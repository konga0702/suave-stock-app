-- =============================================
-- 個体追跡テーブル: inventory_items
-- 管理番号（QRコード）単位で入荷/出荷を追跡
-- =============================================

CREATE TABLE inventory_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  tracking_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_STOCK' CHECK (status IN ('IN_STOCK', 'SHIPPED')),
  in_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  out_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  in_date DATE NOT NULL DEFAULT CURRENT_DATE,
  out_date DATE,
  partner_name TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 管理番号検索用インデックス
CREATE INDEX idx_inventory_items_tracking_number ON inventory_items (tracking_number);
CREATE INDEX idx_inventory_items_product_status ON inventory_items (product_id, status);
CREATE INDEX idx_inventory_items_status ON inventory_items (status);

-- updated_at自動更新トリガー
CREATE TRIGGER trigger_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON inventory_items FOR ALL USING (true) WITH CHECK (true);
