-- =============================================
-- tracking_number を 3分割:
--   internal_id (店舗管理番号)
--   shipping_tracking_id (配送追跡番号)
--   order_id (注文ID)
-- =============================================

-- transactions テーブルにカラム追加
ALTER TABLE transactions ADD COLUMN internal_id TEXT;
ALTER TABLE transactions ADD COLUMN shipping_tracking_id TEXT;
ALTER TABLE transactions ADD COLUMN order_id TEXT;

-- 既存データの移行: tracking_number → internal_id
UPDATE transactions SET internal_id = tracking_number WHERE tracking_number IS NOT NULL;

-- 旧カラムを削除
ALTER TABLE transactions DROP COLUMN tracking_number;

-- inventory_items テーブルにもカラム追加
ALTER TABLE inventory_items ADD COLUMN internal_id TEXT;
ALTER TABLE inventory_items ADD COLUMN shipping_tracking_id TEXT;
ALTER TABLE inventory_items ADD COLUMN order_id TEXT;

-- 既存データの移行
UPDATE inventory_items SET internal_id = tracking_number WHERE tracking_number IS NOT NULL;

-- tracking_number は互換性のためNULLABLEに変更してそのまま残す
-- (旧データの参照用。新規データでは使わない)

-- インデックス追加
CREATE INDEX idx_transactions_internal_id ON transactions (internal_id);
CREATE INDEX idx_transactions_order_id ON transactions (order_id);
CREATE INDEX idx_inventory_items_internal_id ON inventory_items (internal_id);
