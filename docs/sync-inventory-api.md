# 外部在庫更新 API（n8n / HTTP 連携）

BASE・CiLEL などから SuaveStock へ入出庫を反映するための **Supabase Edge Function** と、原子的な更新を行う **PostgreSQL RPC** です。

## デプロイの前提（重要）

- **この API は Vercel では動きません。** フロントエンド（Vite アプリ）は Vercel でホストできますが、外部在庫更新の HTTP 受け口は **Supabase Edge Function** 上で動作します。
- **GitHub の main にコードを push しただけでは、Supabase のデータベースや Edge Function は自動では更新されません**（Vercel のフロントデプロイとは別パイプラインです）。リポジトリにマイグレーションや `supabase/functions` を置いても、**Supabase プロジェクト側でマイグレーション適用・シークレット設定・関数デプロイを別途実行**してください。

## 本番反映チェリスト（Supabase CLI）

リポジトリを更新したあと、対象の Supabase プロジェクトで次を実行します（事前に `supabase login` と `supabase link --project-ref <YOUR_PROJECT_REF>` 済みであること）。

```bash
# 1. リモート DB に migration を適用（未適用分）
supabase db push

# 2. Edge Function 用シークレット（n8n 等と共有する長いランダム文字列）
supabase secrets set SYNC_API_TOKEN='your-long-random-secret'

# 3. Edge Function のデプロイ
supabase functions deploy inventory-transactions
```

---

## エンドポイント

デプロイ後の URL（例）:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/inventory-transactions
```

- **メソッド**: `POST`
- **Content-Type**: `application/json`
- **認証**: `Authorization: Bearer <SYNC_API_TOKEN>`
- 論理的には `POST /v1/inventory/transactions` に相当します（Supabase では `/functions/v1/<関数名>` が URL になります）。

## 環境変数・シークレット

### Edge Function（Supabase ダッシュボードまたは CLI）

| 名前 | 必須 | 説明 |
|------|------|------|
| `SYNC_API_TOKEN` | はい | n8n 等が付与する共有シークレット（自前で十分長いランダム文字列を生成） |
| `SUPABASE_URL` | はい | デプロイ時に Supabase が自動注入 |
| `SUPABASE_SERVICE_ROLE_KEY` | はい | デプロイ時に自動注入（**クライアントに出さない**） |

シークレット設定例（CLI）:

```bash
supabase secrets set SYNC_API_TOKEN='your-long-random-secret'
```

## データベース

マイグレーション `009_sync_inventory_api.sql` を適用すると次が有効になります。

- `transactions.external_source` / `transactions.external_id`
- 冪等用の部分一意インデックス: `(external_source, external_id, type)`（外部連携行のみ）
- RPC: `sync_inventory_transaction(p_payload jsonb)`（**service_role のみ** `EXECUTE` 可）

## リクエストボディ

```json
{
  "source": "BASE",
  "type": "OUT",
  "external_id": "base-order-12345",
  "date": "2026-04-06",
  "status": "COMPLETED",
  "category": "出荷",
  "partner_name": "BASE",
  "order_id": "12345",
  "shipping_code": "SAGAWA-9999",
  "purchase_order_code": null,
  "memo": "BASE注文連携",
  "items": [
    { "product_code": "SKU-001", "quantity": 2, "price": 3200 }
  ]
}
```

### サーバー側の補完

- `status` 省略時は `COMPLETED`（それ以外は拒否）
- `partner_name` 省略時は `source` を使用
- `BASE` + `OUT` で `category` 省略時は `出荷`
- `CILEL` + `IN` で `category` 省略時は `入荷`
- `OUT` で `order_code` がなく `order_id` がある場合、`order_code` に `order_id` を入れて既存UIの「注文コード」表示と揃える

`product_code` は `products.product_code` と **trim 後一致** で解決します。重複 SKU があれば `VALIDATION_ERROR` になります。

## レスポンス

新規作成:

```json
{
  "ok": true,
  "transaction_id": "uuid",
  "external_source": "BASE",
  "external_id": "base-order-12345",
  "created": true
}
```

同一キーの再送（冪等）:

```json
{
  "ok": true,
  "transaction_id": "uuid",
  "external_source": "BASE",
  "external_id": "base-order-12345",
  "created": false,
  "message": "Already processed"
}
```

失敗例:

```json
{
  "ok": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Unknown product_code: SKU-999"
  }
}
```

### エラーコード（`error.code`）

| コード | HTTP 目安 | 意味 |
|--------|-----------|------|
| `UNAUTHORIZED` | 401 | Bearer 不一致・未設定 |
| `VALIDATION_ERROR` | 400 | 入力・区分・曖昧な SKU など |
| `PRODUCT_NOT_FOUND` | 400 | 存在しない `product_code` |
| `INVALID_QUANTITY` | 400 | 数量が正の整数でない |
| `DUPLICATE_EVENT` | 409 | 想定外の一意制約衝突 |
| `INSUFFICIENT_STOCK` | 400 | 出庫で `IN_STOCK` 個体が FIFO で足りない |
| `INTERNAL_ERROR` | 500 | DB/その他 |

## curl 例

```bash
export API_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1/inventory-transactions"
export SYNC_API_TOKEN="your-secret"

curl -sS -X POST "$API_URL" \
  -H "Authorization: Bearer $SYNC_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "BASE",
    "type": "OUT",
    "external_id": "base-order-test-001",
    "date": "2026-04-06",
    "order_id": "TEST-001",
    "shipping_code": "SAGAWA-TEST",
    "memo": "APIテスト",
    "items": [
      { "product_code": "SKU-001", "quantity": 1, "price": 1000 }
    ]
  }'
```

## n8n での呼び方（概要）

1. ノード: **HTTP Request**
2. Method: `POST`
3. URL: `https://<PROJECT_REF>.supabase.co/functions/v1/inventory-transactions`
4. Authentication: **Header Auth** などで `Authorization` = `Bearer <SYNC_API_TOKEN>`
5. Body: JSON（上記スキーマ）

BASE / CiLEL 側のトリガーから `external_id`（注文ID・発注IDなど）を一意に渡すと、再実行時も二重反映されません。

## ローカル実行（Supabase CLI）

前提: [Supabase CLI](https://supabase.com/docs/guides/cli) をインストールし、`supabase login` / `supabase link` 済み。

```bash
# DB にマイグレーションを当てる（ローカル or リモートは環境に合わせる）
supabase db push

# Edge Function をローカルで起動（.env に SYNC_API_TOKEN を用意）
echo "SYNC_API_TOKEN=dev-secret" > supabase/.env
supabase functions serve inventory-transactions --env-file supabase/.env
```

別ターミナルから:

```bash
curl -sS -X POST "http://127.0.0.1:54321/functions/v1/inventory-transactions" \
  -H "Authorization: Bearer dev-secret" \
  -H "Content-Type: application/json" \
  -d '{"source":"BASE","type":"OUT","external_id":"local-1","date":"2026-04-06","items":[{"product_code":"SKU-001","quantity":1,"price":0}]}'
```

※ ローカルでは `supabase start` 後の API URL / ポートは環境で異なる場合があります。`supabase status` で Functions の URL を確認してください。

## デプロイ（Edge Function）の再掲

```bash
supabase db push
supabase secrets set SYNC_API_TOKEN='production-secret'
supabase functions deploy inventory-transactions
```

`supabase/config.toml` の `[functions.inventory-transactions] verify_jwt = false` により、この関数は **Supabase JWT ではなく `SYNC_API_TOKEN`** で認証します（anon key の露出範囲は従来どおりフロントのみ）。

## 実装サマリ

| 層 | 役割 |
|----|------|
| Edge Function `inventory-transactions` | Bearer 検証、JSON 受け取り、`sync_inventory_transaction` RPC 呼び出し |
| RPC `sync_inventory_transaction` | 冪等チェック、SKU 解決、親子明細 INSERT、在庫数・個体（FIFO 出庫）を **1 トランザクション** で更新 |

フロントの `src/lib/inventory.ts` と同様、入庫は `inventory_items` を数量分追加し、出庫は `in_date` 昇順で `IN_STOCK` を `SHIPPED` に更新します。
