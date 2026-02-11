# suave-stock-app

個人事業主向けのモバイル特化型 在庫管理 Web アプリケーションです。
バーコード読み取りによる効率的な在庫管理を実現します。

## 技術スタック

- **Frontend:** React (Vite) + TypeScript
- **Styling:** Tailwind CSS + Shadcn/UI
- **Database:** Supabase
- **Barcode:** html5-qrcode

## セットアップ手順 (Mac)

### 1. 前提条件

- Node.js 18 以上
- npm または yarn
- Supabase アカウント

```bash
# Node.js がインストールされていない場合
brew install node
```

### 2. リポジトリのクローン

```bash
git clone https://github.com/konga0702/suave-stock-app.git
cd suave-stock-app
```

### 3. 依存パッケージのインストール

```bash
npm install
```

### 4. Supabase の準備

1. [supabase.com](https://supabase.com) でプロジェクトを作成
2. ダッシュボードの **SQL Editor** を開く
3. `supabase/migrations/001_create_tables.sql` の内容を貼り付けて実行

### 5. 環境変数の設定

Supabase ダッシュボードの **Settings > API** から接続情報を取得し、
プロジェクトルートに `.env.local` を作成します。

```bash
cp .env.local.example .env.local  # または手動で作成
```

`.env.local` の内容:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

### 6. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで http://localhost:5173 を開きます。

同じ Wi-Fi 内のスマホから確認する場合:

```bash
npm run dev -- --host
```

表示されたネットワーク URL (例: `http://192.168.x.x:5173`) にスマホのブラウザでアクセスします。

### 7. ビルド

```bash
npm run build
```

`dist/` ディレクトリに本番用ファイルが生成されます。

## 主な機能

| 機能 | 説明 |
|------|------|
| 商品マスタ管理 | 商品の登録・編集・削除・一覧表示 |
| バーコード読み取り | スマホカメラで管理バーコードをスキャン |
| バーコード表示 | 商品のバーコードを大画面で表示し現物照合 |
| 入出庫管理 | 入庫/出庫の登録、予定と履歴の分離管理 |
| 在庫自動反映 | 予定を「完了」にすると在庫数が自動で増減 |
| 複製機能 | 過去の入出庫データをコピーして新規予定を作成 |
| CSV 入出力 | 商品・入出庫データの CSV インポート/エクスポート |
| スリープ防止 | GitHub Actions で毎日 Supabase に自動アクセス |

## GitHub Actions (スリープ防止)

Supabase Free プランの自動停止を防ぐため、毎日 1 回データベースにアクセスする
GitHub Actions ワークフローが含まれています。

リポジトリの **Settings > Secrets and variables > Actions** で
以下のシークレットを登録してください:

| シークレット名 | 値 |
|---|---|
| `SUPABASE_URL` | Supabase の Project URL |
| `SUPABASE_ANON_KEY` | Supabase の anon public key |

## プロジェクト構成

```
src/
├── components/
│   ├── Layout.tsx           # ボトムナビ付きレイアウト
│   ├── BarcodeScanner.tsx   # カメラバーコード読み取り
│   ├── BarcodeDisplay.tsx   # バーコード大画面表示
│   └── ui/                  # Shadcn/UI コンポーネント
├── pages/
│   ├── DashboardPage.tsx    # ダッシュボード
│   ├── ProductsPage.tsx     # 商品一覧
│   ├── ProductFormPage.tsx  # 商品登録/編集
│   ├── TransactionsPage.tsx # 入出庫一覧 (予定/履歴タブ)
│   ├── TransactionFormPage.tsx    # 入出庫登録/編集
│   └── TransactionDetailPage.tsx  # 入出庫詳細 (完了/複製)
├── lib/
│   ├── supabase.ts          # Supabase クライアント
│   └── csv.ts               # CSV インポート/エクスポート
└── types/
    └── database.ts          # 型定義
```
