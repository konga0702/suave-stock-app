# SuaveStock 予約注文対応 仕様書

## 1. 背景

現状の `inventory-transactions` API は、在庫不足時に `OUT` トランザクションをエラーで拒否する。

しかし BASE 連携対象のショップは予約販売を前提としており、注文時点で在庫不足であることは通常運用として発生する。

そのため、在庫不足を単純エラーとして扱うのではなく、以下のいずれかの状態で正常処理できるようにしたい。

- 即時出庫可能
- 在庫不足のため予約受付
- 入荷予定へ引当待ち

## 2. 目的

### 2.1 主目的

BASE から流入する注文について、在庫不足でも連携処理自体を失敗させず、SuaveStock 内で「予約」として管理できるようにする。

### 2.2 達成したい業務要件

- 在庫が足りる商品は従来通り `OUT` として確定する
- 在庫が足りない商品はエラーにせず「予約注文」として記録する
- 予約分は後日入荷時に消化できる
- API レスポンスで「出庫確定」か「予約化」かを区別できる
- n8n 側は API エラーで停止せず、処理結果に応じて分岐できる

## 3. 現状の問題

現在は以下の挙動になっている。

- `type=OUT` で API を呼ぶ
- 在庫が十分なら成功
- 在庫不足なら `Bad request` / `Not enough IN_STOCK units for one or more products`
- n8n workflow が赤エラー扱いになる

この挙動だと、予約販売において正常系の注文まで失敗扱いになる。

## 4. 目標仕様

### 4.1 基本方針

在庫不足時は API エラーにしない。

代わりに、注文全体または明細ごとに「予約」として登録し、レスポンスで予約化を返す。

### 4.2 望ましい処理結果

#### ケース A: 在庫十分

- 通常通り `OUT` を作成
- 在庫を減算
- レスポンスは成功

#### ケース B: 在庫不足

- HTTP レベルでは成功レスポンスを返す
- 在庫減算は行わない、または可能なルールで一部のみ減算し残分を予約化
- 不足分または対象明細を「予約注文」または「引当待ち」として保存
- レスポンスで予約化を明示

## 5. 推奨設計

最も安全なのは「在庫トランザクション」と「予約」を分ける設計。

### 5.1 推奨モデル

- 在庫あり:
  - `OUT` トランザクションを作成
- 在庫不足:
  - `OUT` は作らない
  - 代わりに `reservation` レコードを作成

この方式により、実在庫と予約残を明確に分離できる。

### 5.2 非推奨

- マイナス在庫を許可する

理由:

- 在庫表示が実態と乖離しやすい
- 入荷予定と予約残の区別が曖昧になる
- 後続の補充や集計で事故りやすい

## 6. データモデル案

### 6.1 既存

既存の `inventory_transactions` は維持する。

想定フィールド:

- `id`
- `source`
- `type`
- `external_id`
- `date`
- `order_id`
- `items`
- `status`

### 6.2 追加テーブル案: `reservations`

在庫不足時の注文予約を格納する専用テーブルを追加する。

推奨フィールド:

- `id`
- `source`
  例: `BASE`
- `external_id`
  例: `base-XXXXXXXX`
- `order_id`
- `customer_name` 任意
- `reservation_status`
  - `pending`
  - `partially_allocated`
  - `allocated`
  - `cancelled`
  - `completed`
- `created_at`
- `updated_at`
- `note` 任意

### 6.3 追加テーブル案: `reservation_items`

予約明細を別テーブルで持つ。

推奨フィールド:

- `id`
- `reservation_id`
- `product_code`
- `requested_quantity`
- `allocated_quantity`
- `shortage_quantity`
- `price`
- `options_json` 任意
- `status`
  - `pending`
  - `allocated`
  - `completed`
  - `cancelled`

## 7. API 仕様変更案

対象 API:

- `POST /functions/v1/inventory-transactions`

### 7.1 入力仕様

既存の入力は維持する。

例:

```json
{
  "source": "BASE",
  "type": "OUT",
  "external_id": "base-XXXXXXXX",
  "date": "2026-04-08",
  "order_id": "XXXXXXXX",
  "items": [
    {
      "product_code": "IC-PDL-GD20",
      "quantity": 4,
      "price": 15600
    }
  ]
}
```

### 7.2 追加したい入力オプション

#### `allow_backorder`

在庫不足時に予約化を許可するフラグ。

```json
{
  "allow_backorder": true
}
```

推奨:

- BASE 連携時は常に `true`

#### `reservation_policy`

予約化ルール。

候補:

- `reserve_all_if_any_shortage`
  - 明細のどれか1つでも不足していれば不足明細を予約化
- `partial_allocate`
  - 可能分だけ割当し、不足分だけ予約化

推奨初期値:

- `reserve_all_if_any_shortage`

## 8. レスポンス仕様案

### 8.1 在庫十分時

```json
{
  "ok": true,
  "mode": "out_created",
  "created": true,
  "external_id": "base-XXXXXXXX",
  "transaction_id": "uuid",
  "external_source": "BASE"
}
```

### 8.2 在庫不足で予約化した時

```json
{
  "ok": true,
  "mode": "reserved",
  "created": false,
  "reserved": true,
  "external_id": "base-XXXXXXXX",
  "reservation_id": "uuid",
  "external_source": "BASE",
  "items": [
    {
      "product_code": "IC-PDL-GD20",
      "requested_quantity": 4,
      "allocated_quantity": 0,
      "shortage_quantity": 4,
      "status": "reserved"
    }
  ],
  "message": "Insufficient stock. Reservation created."
}
```

### 8.3 一部引当・一部予約の時

必要なら将来対応。

```json
{
  "ok": true,
  "mode": "partially_reserved",
  "created": true,
  "reserved": true,
  "transaction_id": "uuid",
  "reservation_id": "uuid",
  "items": [
    {
      "product_code": "XXX",
      "requested_quantity": 4,
      "allocated_quantity": 2,
      "shortage_quantity": 2,
      "status": "partial"
    }
  ]
}
```

## 9. バリデーション方針

### 9.1 そのままエラーにすべきケース

以下は予約運用でもエラーでよい。

- `product_code` が存在しない
- `quantity <= 0`
- `external_id` が不正
- 認証エラー
- JSON フォーマット不正

### 9.2 エラーにしないケース

- 在庫不足

在庫不足はビジネス上の正常ケースなので、予約化に切り替える。

## 10. 重複送信と冪等性

`external_id` は引き続き冪等キーとして使う。

### 10.1 期待する挙動

- 同じ `external_id` の再送時
  - すでに `OUT` 作成済みなら既存結果を返す
  - すでに予約作成済みなら既存予約を返す

### 10.2 返却例

```json
{
  "ok": true,
  "mode": "reserved",
  "created": false,
  "already_exists": true,
  "reservation_id": "uuid"
}
```

## 11. 入荷予定との連動

「入荷予定」が既存概念としてあるなら、予約はその概念と紐付けられるべき。

### 11.1 最低限

- 予約残数を保持する
- 入荷時に手動または自動で引当できる

### 11.2 将来の理想

- 入荷予定登録時に該当商品コードの予約残へ自動充当
- 予約残が解消したら `reservation_status=allocated` に更新
- 必要ならそのタイミングで `OUT` を確定

## 12. 管理画面で必要な表示

最低限ほしい一覧:

- 予約注文一覧
- 商品別予約残一覧
- 予約ステータス
- BASE注文番号 / external_id
- 入荷予定への紐付け状況

予約詳細画面で見たい項目:

- 商品コード
- 注文数量
- 引当済数量
- 未引当数量
- オプション情報
- 顧客名
- 受注日

## 13. n8n 側の想定変更

SuaveStock 側を改修した後、n8n 側では `HTTP Request2` のレスポンスで分岐できるようにする。

### 13.1 想定レスポンス分岐

- `mode = out_created`
  - 通常成功
- `mode = reserved`
  - 予約成功
- `mode = partially_reserved`
  - 一部予約

### 13.2 n8n 側の扱い

予約になっても workflow は失敗にしない。

将来的には以下の分岐を追加可能:

- 通常出庫成功ログ
- 予約化ログ
- Slack / メール通知
- スプレッドシート記録

## 14. 実装優先順位

### Phase 1

- 在庫不足で API エラーにしない
- `reservations` / `reservation_items` を追加
- `allow_backorder=true` のとき予約化
- レスポンスで `mode=reserved` を返す

### Phase 2

- 管理画面に予約一覧を追加
- 入荷予定との紐付け
- 予約消化 UI

### Phase 3

- 自動引当
- 通知
- 一部引当・一部予約

## 15. Claude への実装依頼要点

Claude へ依頼する時は、少なくとも以下を渡すとよい。

- `inventory-transactions` Edge Function の現行コード
- 現在の在庫テーブル / transaction テーブル定義
- 「入荷予定」に相当する既存テーブル定義
- この仕様書

依頼文の要点:

1. 在庫不足を 400 エラーにしないこと
2. `allow_backorder=true` のとき予約作成に切り替えること
3. `reservations` / `reservation_items` を新設すること
4. レスポンスで `mode=out_created | reserved` を返すこと
5. `external_id` の冪等性を保つこと

## 16. 受け入れ条件

### 受け入れ条件 A

在庫十分の商品注文時:

- `OUT` 作成成功
- 在庫減算される
- `mode=out_created`

### 受け入れ条件 B

在庫不足の商品注文時:

- HTTP 400 にならない
- reservation が作成される
- `mode=reserved`
- n8n が失敗しない

### 受け入れ条件 C

同一 `external_id` 再送時:

- 二重登録されない
- 既存結果を返す

## 17. 補足

今回の BASE 連携では、商品コード解決をまず第1段階として実装済み。

- 単純商品:
  - `item_id + variation_id -> product_code`
- サイズ/仕様分岐商品:
  - 今後 `options` も含めて判定予定

この仕様書は、まず「在庫不足でも予約として正常処理する」ための SuaveStock 側拡張に焦点を当てている。

# 実行報告

> 完了日時：2026-04-08 01:07
> コミット：f0290b3 feat: 在庫不足時の予約注文対応（reservations + sync_inventory_transaction）

## 実施した内容
- 在庫不足時に 400 で落とさず、`allow_backorder=true` の場合は予約化するための DB マイグレーションを追加。
- `sync_inventory_transaction` を `CREATE OR REPLACE` し、`mode=out_created | reserved` を返す分岐と予約系の冪等処理（`external_source + external_id`）を実装。
- 在庫不足予約時のレスポンスに `reservation_id` と予約明細（requested/allocated/shortage）を含め、n8n 側で `mode` 分岐できる形にした。

## 変更・作成したファイル
- `supabase/migrations/010_add_reservations_and_backorder_sync.sql` → `reservations` / `reservation_items` の新設、RLS/インデックス/トリガー追加、`sync_inventory_transaction` の予約対応改修。
- `prompt.md` → 実行報告を追記。

## 動作確認ポイント
- 在庫十分の `OUT` リクエストで `mode=out_created`、`transaction_id` が返ること。
- 在庫不足 + `allow_backorder=true` で HTTP 200 のまま `mode=reserved`、`reservation_id` が返ること。
- 同じ `external_id` を再送しても `already_exists=true` で既存 `transaction_id` または `reservation_id` が返ること。

## 次回PMへの申し送り事項
- 今回の `reservation_policy` は `reserve_all_if_any_shortage` のみ実装し、`partial_allocate` は未対応として明示的にバリデーションエラーを返す。
- 管理画面対応は未実装のため、次フェーズで予約一覧・予約詳細・商品別予約残の UI 追加が必要。
- 将来の入荷予定連携に備え、`reservations` に `inbound_reference` を追加済み（紐付けロジックは未実装）。
