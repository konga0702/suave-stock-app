-- 出庫区分に「廃棄」を追加
-- 1. publicスキーマのtransactionsテーブルから制約を削除
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_category_check;
-- 2. '廃棄' を含めた新しいルールを設定
ALTER TABLE public.transactions ADD CONSTRAINT transactions_category_check CHECK (
  (type = 'IN' AND category IN ('入荷', '返品', '棚卸'))
  OR (type = 'OUT' AND category IN ('出荷', '再送', '棚卸', '廃棄'))
);
