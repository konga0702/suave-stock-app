-- =============================================
-- 009: 外部連携API用 — transactions に external_source / external_id
--       + 冪等用部分UNIQUE + sync_inventory_transaction RPC
-- =============================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS external_source TEXT;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS external_id TEXT;

COMMENT ON COLUMN public.transactions.external_source IS '外部システム識別子（例: BASE, CILEL）。API連携行のみ設定。';
COMMENT ON COLUMN public.transactions.external_id IS '外部側のイベントID。同一(source,id,type)の再送は冪等扱い。';

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_sync_dedupe
  ON public.transactions (external_source, external_id, type)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_inventory_transaction(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text;
  v_type text;
  v_external_id text;
  v_date date;
  v_status text;
  v_category text;
  v_partner text;
  v_memo text;
  v_order_id text;
  v_order_code text;
  v_shipping_code text;
  v_po_code text;
  v_items jsonb;
  v_existing_id uuid;
  v_tx_id uuid;
  v_total numeric(12, 0) := 0;
  v_elem jsonb;
  v_code text;
  v_qty int;
  v_price numeric(10, 0);
  v_pid uuid;
  v_cnt int;
  v_line_no int;
  v_match_cnt int;
  v_updated int;
  v_i int;
  v_line record;
  v_agg record;
BEGIN
  v_source := nullif(trim(COALESCE(p_payload->>'source', '')), '');
  v_type := upper(nullif(trim(COALESCE(p_payload->>'type', '')), ''));
  v_external_id := nullif(trim(COALESCE(p_payload->>'external_id', '')), '');
  v_items := p_payload->'items';

  IF v_source IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'source is required')
    );
  END IF;

  IF v_type IS NULL OR v_type NOT IN ('IN', 'OUT') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'type must be IN or OUT')
    );
  END IF;

  IF v_external_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'external_id is required')
    );
  END IF;

  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) < 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'items must be a non-empty array')
    );
  END IF;

  BEGIN
    v_date := (p_payload->>'date')::date;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'invalid date')
    );
  END;

  v_status := upper(nullif(trim(COALESCE(p_payload->>'status', '')), ''));
  IF v_status IS NULL THEN
    v_status := 'COMPLETED';
  END IF;
  IF v_status <> 'COMPLETED' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Only status COMPLETED is supported for sync API')
    );
  END IF;

  v_partner := nullif(trim(COALESCE(p_payload->>'partner_name', '')), '');
  IF v_partner IS NULL THEN
    v_partner := v_source;
  END IF;

  v_memo := nullif(trim(COALESCE(p_payload->>'memo', '')), '');
  v_order_id := nullif(trim(COALESCE(p_payload->>'order_id', '')), '');
  v_shipping_code := nullif(trim(COALESCE(p_payload->>'shipping_code', '')), '');
  v_po_code := nullif(trim(COALESCE(p_payload->>'purchase_order_code', '')), '');

  v_category := nullif(trim(COALESCE(p_payload->>'category', '')), '');
  IF v_category IS NULL THEN
    IF v_source = 'BASE' AND v_type = 'OUT' THEN
      v_category := '出荷';
    ELSIF v_source = 'CILEL' AND v_type = 'IN' THEN
      v_category := '入荷';
    ELSE
      RETURN jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'category is required for this source/type')
      );
    END IF;
  END IF;

  IF v_type = 'IN' AND v_category NOT IN ('入荷', '返品', '棚卸') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'invalid IN category')
    );
  END IF;
  IF v_type = 'OUT' AND v_category NOT IN ('出荷', '再送', '棚卸', '廃棄') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'invalid OUT category')
    );
  END IF;

  v_order_code := nullif(trim(COALESCE(p_payload->>'order_code', '')), '');
  IF v_type = 'OUT' AND v_order_code IS NULL AND v_order_id IS NOT NULL THEN
    v_order_code := v_order_id;
  END IF;

  SELECT t.id INTO v_existing_id
  FROM public.transactions t
  WHERE t.external_source = v_source
    AND t.external_id = v_external_id
    AND t.type = v_type;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'transaction_id', v_existing_id,
      'external_source', v_source,
      'external_id', v_external_id,
      'created', false,
      'message', 'Already processed'
    );
  END IF;

  CREATE TEMP TABLE _sync_lines (
    line_no int PRIMARY KEY,
    product_id uuid NOT NULL,
    product_code text NOT NULL,
    quantity int NOT NULL,
    price numeric(10, 0) NOT NULL
  ) ON COMMIT DROP;

  v_line_no := 0;
  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_line_no := v_line_no + 1;
    v_code := nullif(trim(COALESCE(v_elem->>'product_code', '')), '');

    IF v_code IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'product_code is required on each item')
      );
    END IF;

    BEGIN
      v_qty := (v_elem->>'quantity')::int;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object('code', 'INVALID_QUANTITY', 'message', 'quantity must be a positive integer')
      );
    END;

    IF v_qty IS NULL OR v_qty < 1 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object('code', 'INVALID_QUANTITY', 'message', 'quantity must be a positive integer')
      );
    END IF;

    BEGIN
      v_price := COALESCE((v_elem->>'price')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'invalid price')
      );
    END;

    IF v_price < 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'price must be >= 0')
      );
    END IF;

    SELECT count(*)::int INTO v_match_cnt
    FROM public.products p
    WHERE p.product_code IS NOT NULL AND trim(p.product_code) = v_code;

    IF v_match_cnt = 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'PRODUCT_NOT_FOUND',
          'message', format('Unknown product_code: %s', v_code)
        )
      );
    END IF;

    IF v_match_cnt > 1 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'VALIDATION_ERROR',
          'message', format('Ambiguous product_code: %s', v_code)
        )
      );
    END IF;

    SELECT p.id INTO v_pid
    FROM public.products p
    WHERE p.product_code IS NOT NULL AND trim(p.product_code) = v_code
    LIMIT 1;

    INSERT INTO _sync_lines (line_no, product_id, product_code, quantity, price)
    VALUES (v_line_no, v_pid, v_code, v_qty, v_price);

    v_total := v_total + (v_price * v_qty);
  END LOOP;

  BEGIN
    BEGIN
      INSERT INTO public.transactions (
        type,
        status,
        category,
        date,
        partner_name,
        total_amount,
        memo,
        order_code,
        shipping_code,
        purchase_order_code,
        order_id,
        external_source,
        external_id
      ) VALUES (
        v_type,
        'COMPLETED',
        v_category,
        v_date,
        v_partner,
        v_total,
        v_memo,
        v_order_code,
        v_shipping_code,
        v_po_code,
        v_order_id,
        v_source,
        v_external_id
      )
      RETURNING id INTO v_tx_id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT t.id INTO v_existing_id
        FROM public.transactions t
        WHERE t.external_source = v_source
          AND t.external_id = v_external_id
          AND t.type = v_type;

        IF v_existing_id IS NOT NULL THEN
          RETURN jsonb_build_object(
            'ok', true,
            'transaction_id', v_existing_id,
            'external_source', v_source,
            'external_id', v_external_id,
            'created', false,
            'message', 'Already processed'
          );
        END IF;

        RETURN jsonb_build_object(
          'ok', false,
          'error', jsonb_build_object('code', 'DUPLICATE_EVENT', 'message', 'Unique constraint violation')
        );
    END;

    INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price)
    SELECT v_tx_id, sl.product_id, sl.quantity, sl.price
    FROM _sync_lines sl
    ORDER BY sl.line_no;

    IF v_type = 'OUT' THEN
      FOR v_agg IN
        SELECT product_id, sum(quantity)::int AS q
        FROM _sync_lines
        GROUP BY product_id
      LOOP
        WITH picked AS (
          SELECT ii.id
          FROM public.inventory_items ii
          WHERE ii.product_id = v_agg.product_id
            AND ii.status = 'IN_STOCK'
          ORDER BY ii.in_date ASC, ii.id ASC
          LIMIT v_agg.q
          FOR UPDATE
        )
        UPDATE public.inventory_items ii
        SET
          status = 'SHIPPED',
          out_transaction_id = v_tx_id,
          out_date = v_date,
          shipping_code = COALESCE(v_shipping_code, ii.shipping_code),
          order_code = COALESCE(v_order_code, ii.order_code)
        FROM picked
        WHERE ii.id = picked.id;

        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated < v_agg.q THEN
          RAISE EXCEPTION 'SYNC_API_INSUFFICIENT_STOCK';
        END IF;
      END LOOP;

      UPDATE public.products p
      SET current_stock = p.current_stock - agg.q
      FROM (
        SELECT product_id, sum(quantity)::int AS q
        FROM _sync_lines
        GROUP BY product_id
      ) agg
      WHERE p.id = agg.product_id;
    ELSE
      UPDATE public.products p
      SET current_stock = p.current_stock + agg.q
      FROM (
        SELECT product_id, sum(quantity)::int AS q
        FROM _sync_lines
        GROUP BY product_id
      ) agg
      WHERE p.id = agg.product_id;

      FOR v_line IN SELECT * FROM _sync_lines ORDER BY line_no
      LOOP
        v_i := 0;
        WHILE v_i < v_line.quantity
        LOOP
          v_i := v_i + 1;
          INSERT INTO public.inventory_items (
            product_id,
            tracking_number,
            order_code,
            shipping_code,
            status,
            in_transaction_id,
            in_date,
            partner_name
          ) VALUES (
            v_line.product_id,
            COALESCE(left(v_tx_id::text, 8), 'sync') || '-' || v_line.line_no::text || '-' || v_i::text,
            v_order_code,
            v_shipping_code,
            'IN_STOCK',
            v_tx_id,
            v_date,
            v_partner
          );
        END LOOP;
      END LOOP;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'transaction_id', v_tx_id,
      'external_source', v_source,
      'external_id', v_external_id,
      'created', true
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'SYNC_API_INSUFFICIENT_STOCK' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'INSUFFICIENT_STOCK',
          'message', 'Not enough IN_STOCK units for one or more products'
        )
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'INTERNAL_ERROR',
        'message', SQLERRM
      )
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_inventory_transaction(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_inventory_transaction(jsonb) TO service_role;
