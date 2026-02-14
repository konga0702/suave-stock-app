-- 006: 商品テーブルに新しいフィールドを追加
-- 商品コード、仕入価格、販売価格、仕入れ先を追加
-- default_unit_price を cost_price / selling_price に分離

-- 商品コード（SKUなど）
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_code TEXT;

-- 仕入価格（旧 default_unit_price の値を引き継ぐ）
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;

-- 販売価格
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price NUMERIC DEFAULT 0;

-- 仕入れ先
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier TEXT;

-- 既存データの移行: default_unit_price → cost_price にコピー
UPDATE products SET cost_price = default_unit_price WHERE cost_price = 0 AND default_unit_price > 0;

-- 商品コード用インデックス
CREATE INDEX IF NOT EXISTS idx_products_product_code ON products(product_code);
