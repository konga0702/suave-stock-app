-- =============================================
-- 007: transactions テーブルに purchase_order_code と order_id を追加
-- =============================================

-- 発注コード（仕入先への発注番号など）
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS purchase_order_code TEXT;

-- 注文ID（顧客からの注文番号・注文IDなど）
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_id TEXT;
