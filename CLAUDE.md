# SUAVE STOCK - プロジェクトコンテキスト

## プロジェクト概要
個人事業向けのモバイルファースト在庫管理Webアプリ。
商品マスタ・入出庫管理・個体追跡・利益分析を一元管理する。

## 技術スタック
- **フロント**: React 19 + TypeScript + Vite 7
- **スタイル**: Tailwind CSS 4 + shadcn/ui（Radix UI）+ lucide-react
- **バックエンド**: Supabase（PostgreSQL）※自前APIサーバーなし
- **ルーティング**: react-router-dom v7（BrowserRouter）
- **トースト**: sonner
- **バーコード**: html5-qrcode / jsqr
- **デプロイ**: Vercel（`git push origin main` で自動デプロイ）

## ファイル構成

```
src/
  App.tsx              # ルート定義・BrowserRouter
  main.tsx             # エントリポイント
  index.css            # グローバルスタイル
  components/
    Layout.tsx         # ボトムナビ付きシェル（max-w-lg）
    BarcodeScanner.tsx # カメラスキャン（html5-qrcode）
    ui/                # shadcn/ui コンポーネント群
  pages/
    DashboardPage.tsx       # / ダッシュボード
    ProductsPage.tsx        # /products 商品一覧
    ProductFormPage.tsx     # /products/new, /products/:id/edit
    TransactionsPage.tsx    # /transactions 作業（入出庫）一覧
    TransactionFormPage.tsx # /transactions/new, /transactions/:id/edit
    TransactionDetailPage.tsx # /transactions/:id
    InventoryPage.tsx       # /inventory 在庫一覧
    InventoryDetailPage.tsx # /inventory/:productId
    NetStockPage.tsx        # /net-stock 純在庫
    ProfitDashboardPage.tsx # /profit 利益ダッシュボード
  lib/
    supabase.ts        # Supabaseクライアント（シングルトン）
    inventory.ts       # 在庫更新・個体追跡ロジック（applyCompletedTransaction等）
    csv.ts             # CSV入出力（インポート・エクスポート）
    utils.ts           # cn() などユーティリティ
  hooks/
    usePersistedSearch.ts  # 検索キーワードlocalStorage永続化フック
  types/
    database.ts        # Product / Transaction / TransactionItem / InventoryItem 型定義
supabase/
  migrations/          # DBスキーマ（001〜007のSQLファイル）
```

## データベース（Supabase）
- **テーブル**: `products` / `transactions` / `transaction_items` / `inventory_items`
- **RLS**: anon に全許可（個人利用向け簡易設定）
- **環境変数**: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`

## 主要な状態管理パターン
- Redux/Zustand/TanStack Query は**未使用**
- 各ページが `useState` + `useEffect` で Supabase から直接取得
- 検索キーワードは `usePersistedSearch` フックで `localStorage` に永続化
- フィルター・ソートは `useSearchParams` でURLに同期（戻り遷移で復元）

## コーディング規約
- コミットメッセージは `feat:` / `fix:` / `refactor:` プレフィックスをつける（日本語OK）
- TypeScript の型エラー・lintエラーは必ず修正してからコミット
- 新しいページは `src/pages/` に追加し、`App.tsx` にルートを登録する
- Supabaseクライアントは `src/lib/supabase.ts` のシングルトンを使う
- UIコンポーネントは shadcn/ui をベースに作成する

## デプロイ手順
```bash
git add .
git commit -m "feat: 〇〇を実装"
git push origin main
# → Vercel が自動でビルド・デプロイ
```

## 注意事項
- `src/lib/inventory.ts` の `applyCompletedTransaction` / `revertCompletedTransaction` は
  在庫数と個体テーブルの整合性を保つ重要な関数。変更時は慎重に。
- `src/lib/csv.ts` は大きなファイル。CSV関連の処理はすべてここに集約されている。
- モバイル前提のUI（`h-dvh`・セーフエリア・ボトムナビ）。PC表示は `max-w-lg` で中央カラム。
