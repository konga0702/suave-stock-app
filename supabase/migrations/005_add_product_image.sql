-- 005: 商品画像対応
-- products テーブルに image_url カラム追加
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Supabase Storage バケット作成（公開読み取り）
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 誰でもアップロード可能（anon key利用のため）
CREATE POLICY "Allow public upload to product-images"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'product-images');

-- 誰でも更新可能
CREATE POLICY "Allow public update product-images"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'product-images')
WITH CHECK (bucket_id = 'product-images');

-- 誰でも削除可能
CREATE POLICY "Allow public delete product-images"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'product-images');

-- 公開バケットなので SELECT は自動で許可される
