# SuaveStock: 出庫予定ステータス対応 実装プロンプト

以下をそのまま Cursor（Claude）に渡してください。

---

# 実行報告

> 完了日時：2026-04-08 23:21
> コミット：未実施（このターンではコミット未作成）

## 実施した内容
- `supabase/migrations/011_add_scheduled_status_support.sql` を新規追加し、`sync_inventory_transaction` を `CREATE OR REPLACE` で更新
- `status` に `SCHEDULED` を許可し、`OUT` の `SCHEDULED` は transaction/transaction_items のみ作成して早期 return する分岐を追加
- `status` 未指定時は従来どおり `COMPLETED` として扱い、既存の在庫引当・出庫完了処理は維持
- `source` に加えて `external_source` でも受け取れるよう互換対応を追加（テストSQLとn8n payload想定に合わせる）

## 変更・作成したファイル
- `supabase/migrations/011_add_scheduled_status_support.sql` → 新規作成。`sync_inventory_transaction` の `SCHEDULED` 対応と互換入力対応を実装
- `prompt.md` → 実行報告を追記

## 動作確認ポイント
- テストケース①（在庫あり・`SCHEDULED`）で `mode = "scheduled"` が返ること
- `transactions.status = 'SCHEDULED'` で登録されること
- 同ケースで `inventory_items.status` が `IN_STOCK` のまま変化しないこと
- テストケース②（`status` 未指定）で従来の `COMPLETED` フローが維持されること

## 次回PMへの申し送り事項
- 本対応は migration 追加のみで、Edge Function 側のコード変更は不要
- SQL Editor で `011_add_scheduled_status_support.sql` を適用後、prompt内のSQLで回帰確認を実施してください

## 依頼内容

`sync_inventory_transaction` 関数を修正し、n8n から「出庫予定（SCHEDULED）」としてデータを受け取れるようにしてください。

## 背景・目的

現在の動作：

- n8n から `inventory-transactions` API に POST すると、在庫が即座に `SHIPPED` になり、transaction が `status='COMPLETED'` として登録される
- これにより SuaveStock 管理画面の「**出庫完了**」側に入ってしまっている

希望する動作：

- BASE に注文が入った時点では「**出庫予定**」として登録したい
- `transactions.status = 'SCHEDULED'` で作成する
- `inventory_items.status` は `IN_STOCK` のまま保持する（出荷確定操作は後から手動で行う）
- 加えて、注文情報（顧客名・注文ID・商品名）を管理画面の出庫予定レコードに表示したい

---

## テーブル仕様（確認済み）

### transactions テーブル

```
status: TEXT  CHECK IN ('SCHEDULED', 'COMPLETED')  DEFAULT 'SCHEDULED'
partner_name: TEXT   ← 顧客名を入れる
memo: TEXT           ← 注文IDや備考を入れる
category: TEXT       ← OUT の場合 '出荷' が入る
```

### inventory_items テーブル

```
status: TEXT  CHECK IN ('IN_STOCK', 'SHIPPED')
out_transaction_id: UUID   ← 予約紐付け用
```

### transaction_items テーブル

```
transaction_id: UUID
product_id: UUID
quantity: INTEGER
price: NUMERIC
```

---

## 修正対象ファイル

```
supabase/migrations/011_add_scheduled_status_support.sql
```

（新規マイグレーションを追加してください）

---

## 実装内容

### 1. `sync_inventory_transaction` 関数の修正

payload に `status` フィールドを追加で受け取れるようにしてください。

```
p_payload JSONB の中に以下が含まれる想定:
{
  "type": "OUT",
  "status": "SCHEDULED",          ← 新規追加（省略時は既存の "COMPLETED" 動作を維持）
  "external_source": "BASE",
  "external_id": "BASE-12345-1",
  "date": "2026-04-08",
  "partner_name": "山田 太郎",    ← 顧客名（既存フィールド、確実に保存されるよう確認）
  "memo": "BASE注文ID: 12345",    ← 注文ID備考（既存フィールド、確実に保存されるよう確認）
  "items": [
    {
      "product_code": "IC-PDL-GD20",
      "quantity": 1,
      "price": 8000
    }
  ],
  "allow_backorder": true,
  "reservation_policy": "reserve_all_if_any_shortage"
}
```

### 2. `status = 'SCHEDULED'` 時の処理（新規追加）

以下の動作になるよう実装してください：

1. `transactions` テーブルに `status = 'SCHEDULED'` でレコードを挿入する
2. `transaction_items` に明細を挿入する
3. `inventory_items.status` は **変更しない**（`IN_STOCK` のまま保持）
4. `inventory_items.out_transaction_id` に今回作成した transaction の ID をセットしてもよいが、必須ではない
5. レスポンスとして以下を返す：

```json
{
  "ok": true,
  "mode": "scheduled",
  "created": true,
  "product_code": "...",
  "requested_quantity": 1,
  "transaction_id": "..."
}
```

### 3. `status = 'COMPLETED'`（または status 未指定）時

**既存の動作を変更しないこと。**
`inventory_items.status = 'SHIPPED'` への更新・`transactions.status = 'COMPLETED'` の作成はそのまま維持。

### 4. `allow_backorder = true` かつ在庫不足かつ `status = 'SCHEDULED'` の場合

現状の reservation 作成ロジックをそのまま使ってください。
`mode = 'reserved'` を返すことは変えなくてよいです。

---

## 実装後の確認事項

以下のテストケースで動作確認してください（SQL で直接 RPC 呼び出しで構いません）：

### テストケース①: 在庫あり・SCHEDULED

```sql
SELECT sync_inventory_transaction('{
  "type": "OUT",
  "status": "SCHEDULED",
  "external_source": "BASE",
  "external_id": "TEST-SCHEDULED-001",
  "date": "2026-04-08",
  "partner_name": "テスト顧客",
  "memo": "BASE注文ID: TEST-001",
  "items": [{"product_code": "IC-PDL-GD20", "quantity": 1, "price": 8000}]
}'::jsonb);
```

期待結果:

- `mode = "scheduled"`
- `transactions` に status='SCHEDULED' のレコードが存在する
- `inventory_items.status` が 'IN_STOCK' のまま

### テストケース②: 既存の COMPLETED 動作が壊れていないこと

```sql
SELECT sync_inventory_transaction('{
  "type": "OUT",
  "external_source": "BASE",
  "external_id": "TEST-COMPLETED-001",
  "date": "2026-04-08",
  "items": [{"product_code": "IC-PDL-GD20", "quantity": 1, "price": 8000}]
}'::jsonb);
```

期待結果:

- 既存の動作（COMPLETED または INSUFFICIENT_STOCK）と変わらないこと

---

## 備考

- migration ファイル名は `011_add_scheduled_status_support.sql`
- Supabase CLI を使わず SQL Editor で適用することを想定
- Edge Function 側（`inventory-transactions/index.ts`）の変更は **不要**（payload をそのまま RPC に渡しているため）
- RLS は既存設定を踏襲してください

---
