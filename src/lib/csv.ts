import { supabase } from './supabase'
import type { Product, Transaction, InventoryItem } from '@/types/database'

function todayStr() {
  return new Date().toISOString().split('T')[0].replace(/-/g, '')
}

function downloadCsv(filename: string, csvContent: string) {
  const bom = '\uFEFF'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function esc(value: string | number | null | undefined): string {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function parseCsvRows(text: string): string[][] {
  // BOM除去 + 改行コード統一(CRLF→LF)
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // 全テキストを1文字ずつ走査（クォート内の改行を正しくセル内改行として扱う）
  const rows: string[][] = []
  let row: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i]
    if (inQuotes) {
      if (char === '"' && cleaned[i + 1] === '"') {
        // "" → " (エスケープされたクォート)
        current += '"'
        i++
      } else if (char === '"') {
        // クォート終了
        inQuotes = false
      } else {
        // クォート内の文字（改行含む）はそのままセルの値に
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        row.push(current.trim())
        current = ''
      } else if (char === '\n') {
        // 行の区切り
        row.push(current.trim())
        rows.push(row)
        row = []
        current = ''
      } else {
        current += char
      }
    }
  }
  // 最終行（末尾に改行がない場合も対応）
  if (current || row.length > 0) {
    row.push(current.trim())
    rows.push(row)
  }

  return rows
}

// ---- Products CSV ----

export function exportProductsCsv(products: Product[]) {
  const header = '商品名,商品コード,バーコード,仕入価格,販売価格,仕入れ先,数量,メモ'
  const rows = products.map((p) =>
    [
      esc(p.name),
      esc(p.product_code),
      esc(p.internal_barcode),
      p.cost_price ?? p.default_unit_price ?? 0,
      p.selling_price ?? 0,
      esc(p.supplier),
      p.current_stock,
      esc(p.memo),
    ].join(',')
  )
  downloadCsv(
    `products_${todayStr()}.csv`,
    [header, ...rows].join('\n')
  )
}

// 数値パース: ¥マーク・カンマ・スペース・$を除去してから数値変換
function parseNum(value: string | undefined): number {
  if (!value) return 0
  const cleaned = value.replace(/[¥￥$,、\s]/g, '')
  const num = parseInt(cleaned)
  return isNaN(num) ? 0 : num
}

export async function importProductsCsv(text: string) {
  const rows = parseCsvRows(text)
  if (rows.length < 2) throw new Error('CSVにデータがありません')

  const header = rows[0]
  const dataRows = rows.slice(1).filter((r) => r.length >= 1 && r[0])

  // ヘッダーで旧/新フォーマットを自動判定
  const isOldFormat = header.length <= 5 || header[0] === '商品名' && header[1] === '管理バーコード'

  const inserts = dataRows.map((r) => {
    if (isOldFormat) {
      // 旧: 商品名,管理バーコード,現在庫,単価,メモ
      return {
        name: r[0],
        product_code: null,
        internal_barcode: r[1] || null,
        cost_price: parseNum(r[3]),
        selling_price: 0,
        default_unit_price: parseNum(r[3]),
        supplier: null,
        current_stock: parseNum(r[2]),
        memo: r[4] || null,
      }
    } else {
      // 新: 商品名,商品コード,バーコード,仕入価格,販売価格,仕入れ先,数量,メモ
      return {
        name: r[0],
        product_code: r[1] || null,
        internal_barcode: r[2] || null,
        cost_price: parseNum(r[3]),
        selling_price: parseNum(r[4]),
        default_unit_price: parseNum(r[3]),
        supplier: r[5] || null,
        current_stock: parseNum(r[6]),
        memo: r[7] || null,
      }
    }
  })

  if (inserts.length === 0) throw new Error('インポートするデータがありません')

  const { error } = await supabase.from('products').insert(inserts)
  if (error) throw error
  return inserts.length
}

// ---- Transactions CSV (詳細版: 商品名・数量・単価を含む) ----

export interface TransactionExportFilters {
  status?: string        // 'SCHEDULED' | 'COMPLETED'
  type?: 'IN' | 'OUT'   // 入庫/出庫フィルター
  category?: string      // カテゴリフィルター
  partnerName?: string   // 取引先フィルター
  search?: string        // テキスト検索（partner_name, tracking_number, order_code, shipping_code, memo, category）
}

export interface ExportProgress {
  phase: 'counting' | 'fetching' | 'processing' | 'done'
  fetched: number
  total: number
}

/**
 * 全件CSVエクスポート（フィルタ対応・ページング取得）
 * - Supabase/PostgRESTの1000件デフォルト上限を回避するため、PAGE_SIZE単位で分割取得
 * - フィルタはDBクエリ側で適用（クライアント側の表示件数に依存しない）
 * - onProgress コールバックで進捗を通知
 */
export async function exportTransactionsDetailCsvWithFilters(
  filters: TransactionExportFilters = {},
  onProgress?: (progress: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const PAGE_SIZE = 500

  // Step 1: 総件数を取得
  onProgress?.({ phase: 'counting', fetched: 0, total: 0 })

  let countQuery = supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })

  if (filters.status) countQuery = countQuery.eq('status', filters.status)
  if (filters.type)   countQuery = countQuery.eq('type', filters.type)
  if (filters.category && filters.category !== 'all') countQuery = countQuery.eq('category', filters.category)
  if (filters.partnerName && filters.partnerName !== 'all') countQuery = countQuery.eq('partner_name', filters.partnerName)

  const { count, error: countError } = await countQuery
  if (countError) throw new Error(`件数取得エラー: ${countError.message}`)
  const total = count ?? 0
  if (total === 0) return

  // Step 2: ページング取得でtransactionsを全件取得
  onProgress?.({ phase: 'fetching', fetched: 0, total })

  const allTxs: Transaction[] = []
  for (let from = 0; from < total; from += PAGE_SIZE) {
    if (signal?.aborted) throw new DOMException('エクスポートがキャンセルされました', 'AbortError')

    let pageQuery = supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (filters.status) pageQuery = pageQuery.eq('status', filters.status)
    if (filters.type)   pageQuery = pageQuery.eq('type', filters.type)
    if (filters.category && filters.category !== 'all') pageQuery = pageQuery.eq('category', filters.category)
    if (filters.partnerName && filters.partnerName !== 'all') pageQuery = pageQuery.eq('partner_name', filters.partnerName)

    const { data: pageData, error: pageError } = await pageQuery
    if (pageError) throw new Error(`データ取得エラー (offset=${from}): ${pageError.message}`)
    if (pageData) allTxs.push(...(pageData as Transaction[]))

    onProgress?.({ phase: 'fetching', fetched: allTxs.length, total })
  }

  // クライアント側のテキスト検索（DB側でのilike相当。列が多いためクライアントフィルタで対応）
  let txs = allTxs
  if (filters.search) {
    const q = filters.search.toLowerCase()
    txs = txs.filter((tx) =>
      tx.partner_name?.toLowerCase().includes(q) ||
      tx.tracking_number?.toLowerCase().includes(q) ||
      tx.order_code?.toLowerCase().includes(q) ||
      tx.shipping_code?.toLowerCase().includes(q) ||
      tx.memo?.toLowerCase().includes(q) ||
      tx.category?.toLowerCase().includes(q) ||
      (tx.type === 'IN' ? '入庫' : '出庫').includes(q)
    )
    if (txs.length === 0) return
  }

  // Step 3: transaction_items を取得（txIds は最大1000件ずつ .in() を分割）
  onProgress?.({ phase: 'processing', fetched: txs.length, total: txs.length })

  const txIds = txs.map((t) => t.id)
  const allItems: Array<{ transaction_id: string; product_id: string; quantity: number; price: number }> = []

  const IN_CHUNK = 200  // .in() の引数上限を考慮
  for (let i = 0; i < txIds.length; i += IN_CHUNK) {
    if (signal?.aborted) throw new DOMException('エクスポートがキャンセルされました', 'AbortError')
    const chunk = txIds.slice(i, i + IN_CHUNK)
    const { data: itemsData, error: itemsError } = await supabase
      .from('transaction_items')
      .select('transaction_id, product_id, quantity, price')
      .in('transaction_id', chunk)
    if (itemsError) throw new Error(`明細取得エラー: ${itemsError.message}`)
    if (itemsData) allItems.push(...itemsData)
  }

  // Step 4: products を取得
  const productIds = [...new Set(allItems.map((i) => i.product_id))]
  const productsMap = new Map<string, string>()
  for (let i = 0; i < productIds.length; i += IN_CHUNK) {
    if (signal?.aborted) throw new DOMException('エクスポートがキャンセルされました', 'AbortError')
    const chunk = productIds.slice(i, i + IN_CHUNK)
    const { data: prods, error: prodsError } = await supabase
      .from('products')
      .select('id, name')
      .in('id', chunk)
    if (prodsError) throw new Error(`商品取得エラー: ${prodsError.message}`)
    if (prods) {
      for (const p of prods) productsMap.set(p.id, p.name)
    }
  }

  // Step 5: トランザクションごとに明細をグループ化
  const itemsByTx = new Map<string, Array<{ product_name: string; quantity: number; price: number }>>()
  for (const item of allItems) {
    const list = itemsByTx.get(item.transaction_id) ?? []
    list.push({
      product_name: productsMap.get(item.product_id) ?? '',
      quantity: item.quantity,
      price: Number(item.price),
    })
    itemsByTx.set(item.transaction_id, list)
  }

  // Step 6: CSV生成
  const header = '日付,区分,カテゴリ,ステータス,商品名,数量,単価,小計,合計金額,取引先,管理番号,注文コード,追跡コード,発注コード,注文日,顧客名,注文ID,メモ'

  const rows: string[] = []
  for (const tx of txs) {
    const txItems = itemsByTx.get(tx.id) ?? []
    const typeName = tx.type === 'IN' ? '入庫' : '出庫'
    const statusName = tx.status === 'COMPLETED' ? '完了' : '予定'

    if (txItems.length === 0) {
      rows.push([
        tx.date,
        esc(typeName),
        esc(tx.category),
        esc(statusName),
        '',
        '',
        '',
        '',
        tx.total_amount,
        esc(tx.partner_name),
        esc(tx.tracking_number),
        esc(tx.order_code),
        esc(tx.shipping_code),
        esc(tx.purchase_order_code),
        esc(tx.order_date),
        esc(tx.customer_name),
        esc(tx.order_id),
        esc(tx.memo),
      ].join(','))
    } else {
      txItems.forEach((item, idx) => {
        const subtotal = item.quantity * item.price
        rows.push([
          idx === 0 ? tx.date : '',
          idx === 0 ? esc(typeName) : '',
          idx === 0 ? esc(tx.category) : '',
          idx === 0 ? esc(statusName) : '',
          esc(item.product_name),
          item.quantity,
          item.price,
          subtotal,
          idx === 0 ? tx.total_amount : '',
          idx === 0 ? esc(tx.partner_name) : '',
          idx === 0 ? esc(tx.tracking_number) : '',
          idx === 0 ? esc(tx.order_code) : '',
          idx === 0 ? esc(tx.shipping_code) : '',
          idx === 0 ? esc(tx.purchase_order_code) : '',
          idx === 0 ? esc(tx.order_date) : '',
          idx === 0 ? esc(tx.customer_name) : '',
          idx === 0 ? esc(tx.order_id) : '',
          idx === 0 ? esc(tx.memo) : '',
        ].join(','))
      })
    }
  }

  onProgress?.({ phase: 'done', fetched: txs.length, total: txs.length })

  downloadCsv(
    `transaction_report_${todayStr()}.csv`,
    [header, ...rows].join('\n')
  )
}

// 旧互換（フィルタなし・全件エクスポート）
export async function exportTransactionsDetailCsv() {
  return exportTransactionsDetailCsvWithFilters()
}

// 旧互換（インポート用）
export function exportTransactionsCsv(_transactions: Transaction[]) {
  exportTransactionsDetailCsvWithFilters()
}

/**
 * 入出庫CSVインポート（新フォーマット対応）
 * CSV形式: 日付,区分,カテゴリ,商品名,数量,単価,取引先,管理番号,注文コード,追跡コード,発注コード,注文日,顧客名,注文ID,メモ
 *
 * 同じ管理番号の行はひとつの取引にまとめられる。
 * 管理番号が空の場合は行ごとに個別の取引として登録。
 * 商品名で products テーブルから自動マッチする。
 */
export async function importTransactionsCsv(text: string) {
  const rows = parseCsvRows(text)
  if (rows.length < 2) throw new Error('CSVにデータがありません')

  const header = rows[0]

  // ── フォーマット判定 ──────────────────────────────────────────
  // 新フォーマット: 1列目=「日付」、2列目=「区分」or「タイプ」
  const isNewFormat = header[0] === '日付' && (header[1] === '区分' || header[1] === 'タイプ')

  if (!isNewFormat) {
    // 旧フォーマット (type,status,category,date,...) — 後方互換・列位置固定
    const dataRows = rows.slice(1).filter((r) => r.some((c) => c))
    if (dataRows.length === 0) throw new Error('インポートするデータがありません')
    const inserts = dataRows.map((r) => ({
      type: r[0] as 'IN' | 'OUT',
      status: (r[1] || 'SCHEDULED') as 'SCHEDULED' | 'COMPLETED',
      category: r[2],
      date: r[3] || new Date().toISOString().split('T')[0],
      tracking_number: r[4] || null,
      order_code: r[5] || null,
      shipping_code: r[6] || null,
      partner_name: r[7] || null,
      total_amount: parseInt(r[8]) || 0,
      memo: r[9] || null,
    }))
    const { error } = await supabase.from('transactions').insert(inserts)
    if (error) throw error
    return inserts.length
  }

  // ── 新フォーマット処理（ヘッダ名でカラムマッピング） ──────────────

  // ヘッダ名 → 列インデックスのマップを構築
  // 同名ヘッダが複数ある場合は最初の出現を使う
  const col = new Map<string, number>()
  header.forEach((h, i) => {
    const name = h.trim()
    if (name && !col.has(name)) col.set(name, i)
  })

  // 列インデックスを安全に取得するヘルパー（列が存在しない場合は undefined）
  const get = (r: string[], colName: string): string =>
    col.has(colName) ? (r[col.get(colName)!] ?? '').trim() : ''

  // データ行: 日付・商品名がどちらも空の行はスキップ
  const rawDataRows = rows.slice(1)
  interface IndexedRow { r: string[]; csvLine: number }
  const dataRows: IndexedRow[] = rawDataRows
    .map((r, i) => ({ r, csvLine: i + 2 })) // csvLine は 1-origin でヘッダが1行目
    .filter(({ r }) => r.some((c) => c.trim()))  // 完全空行を除外

  if (dataRows.length === 0) throw new Error('インポートするデータがありません')

  // 商品マスタを取得（商品コード優先、次いで商品名）
  const { data: products } = await supabase.from('products').select('id, name, product_code')
  const productNameMap = new Map<string, string>() // name.toLowerCase() → id
  const productCodeMap = new Map<string, string>() // product_code.toLowerCase() → id
  if (products) {
    for (const p of products) {
      productNameMap.set(p.name.trim().toLowerCase(), p.id)
      if (p.product_code) productCodeMap.set(p.product_code.trim().toLowerCase(), p.id)
    }
  }

  // 区分テキスト → type 変換
  function parseType(val: string): 'IN' | 'OUT' {
    const v = val.trim()
    if (v === '入庫' || v === 'IN'  || v === '入荷') return 'IN'
    if (v === '出庫' || v === 'OUT' || v === '出荷') return 'OUT'
    return 'IN' // デフォルト: 入庫
  }

  // ステータステキスト → status 変換
  function parseStatus(val: string): 'SCHEDULED' | 'COMPLETED' {
    const v = val.trim()
    if (v === '履歴' || v === 'COMPLETED' || v === '完了') return 'COMPLETED'
    // 「予定」「SCHEDULED」「」→ SCHEDULED
    return 'SCHEDULED'
  }

  // カテゴリのデフォルト
  function defaultCategory(type: 'IN' | 'OUT'): string {
    return type === 'IN' ? '入荷' : '出荷'
  }

  // ── 行をパース（日付が空 = 前の取引の追加明細） ──────────────────
  interface ParsedRow {
    csvLine: number
    date: string
    type: 'IN' | 'OUT'
    status: 'SCHEDULED' | 'COMPLETED'
    category: string
    productName: string
    productCode: string       // 商品コード列があれば使う
    quantity: number
    price: number
    partnerName: string | null
    trackingNumber: string | null
    orderCode: string | null
    shippingCode: string | null
    purchaseOrderCode: string | null
    orderDate: string | null
    customerName: string | null
    orderId: string | null
    memo: string | null
  }

  const parsedRows: ParsedRow[] = []
  let lastBase: Omit<ParsedRow, 'csvLine' | 'productName' | 'productCode' | 'quantity' | 'price'> | null = null


  for (const { r, csvLine } of dataRows) {
    const date = get(r, '日付')

    if (date) {
      // 新しい取引の開始行
      const typeStr  = get(r, '区分') || get(r, 'タイプ')
      const statusStr = get(r, 'ステータス')
      const cat      = get(r, 'カテゴリ')
      const type     = parseType(typeStr)

      lastBase = {
        date,
        type,
        status:            parseStatus(statusStr),
        category:          cat || defaultCategory(type),
        partnerName:       get(r, '取引先')   || null,
        trackingNumber:    get(r, '管理番号') || null,
        orderCode:         get(r, '注文コード') || null,
        shippingCode:      get(r, '追跡コード') || null,
        purchaseOrderCode: get(r, '発注コード') || null,
        orderDate:         get(r, '注文日')    || null,
        customerName:      get(r, '顧客名')    || null,
        orderId:           get(r, '注文ID')    || null,
        memo:              get(r, 'メモ')      || null,
      }
    }

    if (!lastBase) continue  // 日付より前に明細行が来た場合は無視

    const productName = get(r, '商品名')
    const productCode = get(r, '商品コード') || get(r, 'product_code') || ''

    // 日付も商品名もない行はスキップ
    if (!date && !productName) continue

    // 商品名がない行もスキップ（取引ヘッダ行で明細なしの場合）
    if (!productName && !productCode) continue

    parsedRows.push({
      csvLine,
      ...lastBase,
      productName,
      productCode,
      quantity: parseNum(get(r, '数量')),
      price:    parseNum(get(r, '単価')),
    })
  }

  if (parsedRows.length === 0) throw new Error('インポートするデータがありません')

  // ── グループ化（日付+区分+ステータス+管理番号+注文コード） ──────────
  interface TxGroup {
    date: string
    type: 'IN' | 'OUT'
    status: 'SCHEDULED' | 'COMPLETED'
    category: string
    partnerName: string | null
    trackingNumber: string | null
    orderCode: string | null
    shippingCode: string | null
    purchaseOrderCode: string | null
    orderDate: string | null
    customerName: string | null
    orderId: string | null
    memo: string | null
    items: Array<{ csvLine: number; productName: string; productCode: string; quantity: number; price: number }>
  }

  const groups: TxGroup[] = []
  let currentGroup: TxGroup | null = null

  for (const row of parsedRows) {
    const groupKey = `${row.date}|${row.type}|${row.status}|${row.trackingNumber ?? ''}|${row.orderCode ?? ''}`
    const prevKey  = currentGroup
      ? `${currentGroup.date}|${currentGroup.type}|${currentGroup.status}|${currentGroup.trackingNumber ?? ''}|${currentGroup.orderCode ?? ''}`
      : ''

    if (currentGroup && groupKey === prevKey) {
      currentGroup.items.push({
        csvLine:     row.csvLine,
        productName: row.productName,
        productCode: row.productCode,
        quantity:    row.quantity,
        price:       row.price,
      })
    } else {
      currentGroup = {
        date:              row.date,
        type:              row.type,
        status:            row.status,
        category:          row.category,
        partnerName:       row.partnerName,
        trackingNumber:    row.trackingNumber,
        orderCode:         row.orderCode,
        shippingCode:      row.shippingCode,
        purchaseOrderCode: row.purchaseOrderCode,
        orderDate:         row.orderDate,
        customerName:      row.customerName,
        orderId:           row.orderId,
        memo:              row.memo,
        items: [{
          csvLine:     row.csvLine,
          productName: row.productName,
          productCode: row.productCode,
          quantity:    row.quantity,
          price:       row.price,
        }],
      }
      groups.push(currentGroup)
    }
  }

  // ── 商品IDの解決 + エラー収集 ──────────────────────────────────
  // notFound: { csvLine, name } で行番号付き報告
  interface NotFoundEntry { csvLine: number; name: string }
  const notFound: NotFoundEntry[] = []
  const notFoundNames = new Set<string>() // 重複排除用

  let txCount = 0

  for (const group of groups) {
    const resolvedItems: Array<{ product_id: string; quantity: number; price: number }> = []

    for (const item of group.items) {
      // 商品コード優先 → 商品名フォールバック
      const searchCode = item.productCode.toLowerCase()
      const searchName = item.productName.toLowerCase()

      const pid =
        (searchCode ? productCodeMap.get(searchCode) : undefined) ??
        productNameMap.get(searchName) ??
        (searchCode ? productNameMap.get(searchCode) : undefined) // コードを名前として検索する最終フォールバック

      if (!pid) {
        const label = item.productCode
          ? `${item.productName}（コード: ${item.productCode}）`
          : item.productName
        if (!notFoundNames.has(label)) {
          notFound.push({ csvLine: item.csvLine, name: label })
          notFoundNames.add(label)
        }
        continue
      }

      resolvedItems.push({
        product_id: pid,
        quantity:   item.quantity || 1,
        price:      item.price,
      })
    }

    if (resolvedItems.length === 0) continue

    const totalAmount = resolvedItems.reduce((s, i) => s + i.quantity * i.price, 0)

    // トランザクション登録
    const { data: newTx, error: txError } = await supabase
      .from('transactions')
      .insert({
        type:                group.type,
        status:              group.status,   // ← ステータス列を反映（旧実装は常にSCHEDULED固定だった）
        category:            group.category,
        date:                group.date,
        tracking_number:     group.trackingNumber,
        order_code:          group.orderCode,
        shipping_code:       group.shippingCode,
        purchase_order_code: group.purchaseOrderCode,
        order_date:          group.orderDate,
        customer_name:       group.customerName,
        order_id:            group.orderId,
        partner_name:        group.partnerName,
        total_amount:        totalAmount,
        memo:                group.memo,
      })
      .select()
      .single()

    if (txError || !newTx) throw txError ?? new Error('取引の登録に失敗しました')

    // 明細登録
    const { error: itemsError } = await supabase
      .from('transaction_items')
      .insert(
        resolvedItems.map((item) => ({
          transaction_id: newTx.id,
          product_id:     item.product_id,
          quantity:       item.quantity,
          price:          item.price,
        }))
      )

    if (itemsError) throw itemsError
    txCount++
  }

  // ── エラー報告（行番号付き） ───────────────────────────────────
  if (notFound.length > 0 && txCount === 0) {
    const lines = notFound.map((e) => `  ${e.csvLine}行目: ${e.name}`).join('\n')
    throw new Error(
      `インポートに失敗しました。CSVの商品名/商品コードが商品マスタに登録されていません。\n\n見つからない商品（行番号付き）:\n${lines}\n\n※商品名は商品一覧の名前と完全一致、または商品コード列を追加してください。`
    )
  }

  if (notFound.length > 0) {
    const lines = notFound.map((e) => `${e.csvLine}行目: ${e.name}`).join('\n')
    throw new Error(
      `${txCount}件の取引を登録しました。\n以下の商品が見つからずスキップしました:\n${lines}`
    )
  }

  return txCount
}

// ---- Inventory CSV ----

export function exportInventoryCsv(items: InventoryItem[]) {
  const header = '商品名,管理番号,注文コード,追跡コード,ステータス,入庫日,出荷日,取引先,メモ'
  const rows = items.map((item) => {
    const statusName = item.status === 'IN_STOCK' ? '入荷済' : '出荷済'
    return [
      esc(item.product?.name),
      esc(item.tracking_number),
      esc(item.order_code),
      esc(item.shipping_code),
      esc(statusName),
      item.in_date,
      item.out_date ?? '',
      esc(item.partner_name),
      esc(item.memo),
    ].join(',')
  })

  downloadCsv(
    `stock_report_${todayStr()}.csv`,
    [header, ...rows].join('\n')
  )
}

// ---- 入出庫CSVテンプレート（登録済み商品名で動的生成） ----

export async function downloadTransactionsTemplate() {
  const { data: products } = await supabase
    .from('products')
    .select('name, cost_price, selling_price, default_unit_price')
    .order('name')
    .limit(5)

  const header = '日付,区分,カテゴリ,商品名,数量,単価,取引先,管理番号,注文コード,追跡コード,発注コード,注文日,顧客名,注文ID,メモ'
  const today = new Date().toISOString().split('T')[0]

  let sampleRows: string[]
  if (products && products.length > 0) {
    // 登録済み商品名を使ったサンプルデータ
    sampleRows = products.slice(0, 3).map((p, i) => {
      const price = Number(p.cost_price ?? p.default_unit_price ?? 0)
      return [
        today,
        '入庫',
        '入荷',
        esc(p.name),
        String(i + 1),
        String(price),
        '仕入先サンプル',
        `TRK-00${i + 1}`,
        `ORD-00${i + 1}`,
        `SHP-00${i + 1}`,
        `PO-00${i + 1}`,
        today,
        '',
        '',
        'サンプルデータ',
      ].join(',')
    })
    // 出庫サンプルも1件追加
    if (products.length > 0) {
      const p = products[0]
      const sellPrice = Number(p.selling_price ?? p.default_unit_price ?? 0)
      sampleRows.push(
        [
          today,
          '出庫',
          '出荷',
          esc(p.name),
          '1',
          String(sellPrice),
          '顧客サンプル',
          'TRK-010',
          'ORD-010',
          'SHP-010',
          '',
          today,
          '顧客サンプル',
          'ORDER-001',
          '出荷サンプル',
        ].join(',')
      )
    }
  } else {
    // 商品未登録の場合はガイド行
    sampleRows = [
      `${today},入庫,入荷,※ここに登録済みの商品名を入力,1,1000,仕入先名,TRK-001,ORD-001,SHP-001,PO-001,${today},,,メモ`,
    ]
  }

  downloadCsv(
    `transactions_template_${todayStr()}.csv`,
    [header, ...sampleRows].join('\n')
  )
}
