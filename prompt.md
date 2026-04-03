# タスク指示

> 作成日：2026-04-04
> ステータス：完了

## 指示内容

### タスク: 在庫・純在庫の可視化・整合表示・警告

#### 背景（コードの事実）

- `InventoryPage` / `NetStockPage` の「純在庫」は COMPLETED の `transaction_items` 集計による **入庫合計 − 出庫合計**（同じ計算ロジック）。
- `ProductsPage` の在庫表示は `products.current_stock`（`src/lib/inventory.ts` の完了／取下げで更新）。
- 未出庫の個体は `inventory_items` の `status = 'IN_STOCK'`。

#### 目的1: 純在庫から「どの入庫分が残っているか」を見えるようにする

- 在庫タブ（`InventoryPage`）で、行の **「純在庫」表示部分**をタップしたとき（行全体の `/inventory/:productId` 遷移と競合しないよう `stopPropagation` 等）、その商品の **未出庫個体一覧**を表示できるようにする。
- データは Supabase の `inventory_items` を `product_id` + `IN_STOCK` で取得。`in_date`, `tracking_number`, `order_code`, `in_transaction_id` などを一覧表示し、可能なら入庫取引（`/transactions/:id`）への導線を付ける。
- UI は次のいずれか（好みで選定し、実装を統一）:
  - `InventoryDetailPage` に「在庫個体」タブを追加し、クエリ `?tab=units` などで初期表示できるようにする、**または**
  - Sheet / Dialog で一覧表示。
- `NetStockPage` でも同様に「純在庫」から個体一覧へ辿れると望ましい（実装共通化できるなら `src/lib/` または小さなコンポーネントにまとめる）。

#### 目的2: 商品一覧の在庫数と純在庫（帳簿）を揃えて見せる

- `ProductsPage` のデータ取得を拡張し、各商品について **帳簿純在庫**（COMPLETED の IN 数量合計 − OUT 数量合計）を算出する。計算式は `InventoryPage` と同一ロジックにすること（共通化を推奨: 例 `src/lib/stockMetrics.ts` のような集計ヘルパ）。
- 表示方針:
  - 基本は **`current_stock` を主表示のまま**維持し、帳簿純在庫を副表示にする、または一致時は1列にまとめる。PM/デザインに合わせて最も分かりやすい形に。
  - ソート・フィルター「在庫あり」等で参照する値が **どちらか一貫**するよう注意（要仕様決定: 推奨はフィルターは従来どおり `current_stock`、副表示で帳簿と突き合わせ）。

#### 目的3: 不一致・マイナス在庫の警告

- **マイナス**: `current_stock < 0` の商品行に警告（色・バッジ・アイコン）。必要ならページ上部に「要確認: N件」サマリー。
- **不一致**: `current_stock !== 帳簿純在庫` の行に警告。差分（例: +2 / -3）を短く表示できるとなお良い。
- 通知は `sonner` のトーストは **全件で連発しない**こと（初回ロードで1回バナー or 件数表示に留める等）。

#### 制約・注意

- `src/lib/inventory.ts` の `applyCompletedTransaction` / `revertCompletedTransaction` は安易に変更しない。
- **DBの自動修復（`current_stock` の一括UPDATE）は今回のスコープに含めない**。警告と表示の整合が先。修復ボタンを入れる場合は別途PM承認と、個体テーブルとの整合手順を明記すること。
- TypeScript / ESLint を通す。新規ルートが必要なら `App.tsx` に登録。
- 完了後 `prompt.md` の実行報告を規定フォーマットで記載。

#### 受け入れ条件（Done）

- [ ] 在庫一覧から純在庫操作で、当該商品の `IN_STOCK` 個体が一覧確認できる。
- [ ] 商品一覧で `current_stock` と帳簿純在庫が並び、ユーザーが同一商品で両方を比較できる。
- [ ] `current_stock < 0` および `current_stock ≠ 帳簿純在庫` が視覚的に分かる（かつトースト乱発しない）。
- [ ] 計算ロジックが `InventoryPage` と食い違わない（共通化またはテスト可能な関数化）。

---

# 実行報告

> 完了日時：2026-04-04 （実装完了）
> コミット：31b1ec3 feat: 在庫・純在庫の可視化・整合表示・警告を実装

## 実施した内容

- **目的1**: 在庫タブ（InventoryPage）と純在庫ページ（NetStockPage）の「純在庫」セルをタップすると、InventoryDetailPage の「個体」タブへ遷移するよう実装（stopPropagation で行全体のタップと競合しない）。
- **目的1続**: InventoryDetailPage に「個体」タブを追加（?tab=units クエリで初期表示可能）。IN_STOCK な inventory_items を一覧表示し、各個体から入庫取引へのリンクを付けた。
- **目的2**: ProductsPage のデータ取得を拡張し、fetchBookNetStockMap() で帳簿純在庫を取得。current_stock と異なる場合のみバッジ内に「帳±N」を副表示。
- **目的3**: current_stock < 0 はローズ色バッジ（ring付き）、current_stock ≠ 帳簿純在庫はアンバー色バッジ（ring付き）で視覚区別。ページ上部に「要確認: N件」バナーを1回だけ表示（トーストは使用せず）。
- **共通化**: src/lib/stockMetrics.ts を新規作成し fetchBookNetStockMap() を実装。ProductsPage はこれを利用。

## 変更・作成したファイル

- `src/lib/stockMetrics.ts` → 新規作成。COMPLETED IN - COMPLETED OUT を Map で返す共通関数
- `src/pages/InventoryDetailPage.tsx` → 「個体」タブ追加・?tab=units 対応・純在庫カードタップでタブ切替
- `src/pages/InventoryPage.tsx` → 純在庫セルに onClick 追加（stopPropagation + navigate to ?tab=units）
- `src/pages/NetStockPage.tsx` → 同上
- `src/pages/ProductsPage.tsx` → bookNetStockMap 取得・在庫バッジ拡張・警告バナー追加・AlertTriangle import

## 動作確認ポイント

- 在庫一覧（InventoryPage）で商品行の「純在庫」ブロックをタップ → InventoryDetailPage の「個体」タブが開く（行全体タップ＝在庫詳細に遷移するのと競合しないこと）
- NetStockPage でも同様に純在庫タップで個体一覧へ遷移すること
- InventoryDetailPage の「個体」タブに IN_STOCK の inventory_items が表示され、「入庫取引」リンクが機能すること
- ProductsPage のバッジ：normal（緑）/ 在庫少（黄）/ ゼロ・マイナス（赤）/ 帳簿不一致（黄 ring）
- 帳簿と不一致の商品がある場合、ページ上部に「要確認: N件」バナーが表示されること
- TypeScript ビルドがエラーなしで通ること（確認済み）

## 次回PMへの申し送り事項

- DBの current_stock 自動修復（一括UPDATE）は今回スコープ外。必要なら別途PM承認を得て実装すること。
- fetchBookNetStockMap は ProductsPage のロード時に毎回2クエリ発行する。商品数が増えた場合はページネーションやキャッシュの検討を推奨。
- inventory_items に internal_id や shipping_tracking_id フィールドがあるが、TypeScript 型定義（database.ts）に含まれていない。個体タブで表示を追加する場合は型定義の更新が必要。
