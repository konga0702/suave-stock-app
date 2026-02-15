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
  const lines = cleaned.trim().split('\n')
  return lines.map((line) => {
    const row: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (char === '"') {
          inQuotes = false
        } else {
          current += char
        }
      } else {
        if (char === '"') {
          inQuotes = true
        } else if (char === ',') {
          row.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
    }
    row.push(current.trim())
    return row
  })
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

export async function exportTransactionsDetailCsv() {
  // 全トランザクション取得
  const { data: txs } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })

  if (!txs || txs.length === 0) return

  // transaction_items + product を取得
  const txIds = txs.map((t) => t.id)
  const { data: items } = await supabase
    .from('transaction_items')
    .select('transaction_id, product_id, quantity, price')
    .in('transaction_id', txIds)

  // products 取得
  const productIds = [...new Set((items ?? []).map((i) => i.product_id))]
  const productsMap = new Map<string, string>()
  if (productIds.length > 0) {
    const { data: prods } = await supabase
      .from('products')
      .select('id, name')
      .in('id', productIds)
    if (prods) {
      for (const p of prods) productsMap.set(p.id, p.name)
    }
  }

  // トランザクションごとに明細をグループ化
  const itemsByTx = new Map<string, Array<{ product_name: string; quantity: number; price: number }>>()
  if (items) {
    for (const item of items) {
      const list = itemsByTx.get(item.transaction_id) ?? []
      list.push({
        product_name: productsMap.get(item.product_id) ?? '',
        quantity: item.quantity,
        price: Number(item.price),
      })
      itemsByTx.set(item.transaction_id, list)
    }
  }

  const header = '日付,区分,カテゴリ,ステータス,商品名,数量,単価,小計,合計金額,取引先,管理番号,注文コード,追跡コード,メモ'

  const rows: string[] = []
  for (const tx of txs) {
    const txItems = itemsByTx.get(tx.id) ?? []
    const typeName = tx.type === 'IN' ? '入庫' : '出庫'
    const statusName = tx.status === 'COMPLETED' ? '完了' : '予定'

    if (txItems.length === 0) {
      // 明細なしの場合は1行
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
        esc(tx.memo),
      ].join(','))
    } else {
      // 明細ごとに1行（最初の行にトランザクション情報を含む）
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
          idx === 0 ? esc(tx.memo) : '',
        ].join(','))
      })
    }
  }

  downloadCsv(
    `transaction_report_${todayStr()}.csv`,
    [header, ...rows].join('\n')
  )
}

// 旧互換（インポート用）
export function exportTransactionsCsv(_transactions: Transaction[]) {
  exportTransactionsDetailCsv()
}

/**
 * 入出庫CSVインポート（新フォーマット対応）
 * CSV形式: 日付,区分,カテゴリ,商品名,数量,単価,取引先,管理番号,注文コード,追跡コード,メモ
 *
 * 同じ管理番号の行はひとつの取引にまとめられる。
 * 管理番号が空の場合は行ごとに個別の取引として登録。
 * 商品名で products テーブルから自動マッチする。
 */
export async function importTransactionsCsv(text: string) {
  const rows = parseCsvRows(text)
  if (rows.length < 2) throw new Error('CSVにデータがありません')

  const header = rows[0]
  const dataRows = rows.slice(1).filter((r) => r.length >= 4 && r.some((c) => c))

  if (dataRows.length === 0) throw new Error('インポートするデータがありません')

  // 新フォーマット判定: 1列目が「日付」
  const isNewFormat = header[0] === '日付' && (header[1] === '区分' || header[1] === 'タイプ')

  if (!isNewFormat) {
    // 旧フォーマット (type,status,category,date,...) — 後方互換
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

  // --- 新フォーマット処理 ---

  // 商品テーブルを取得（名前 → id マッピング）
  const { data: products } = await supabase.from('products').select('id, name, product_code')
  const productMap = new Map<string, string>() // name(lower) → id
  const codeMap = new Map<string, string>()    // product_code(lower) → id
  if (products) {
    for (const p of products) {
      productMap.set(p.name.toLowerCase(), p.id)
      if (p.product_code) codeMap.set(p.product_code.toLowerCase(), p.id)
    }
  }

  // 区分テキスト → type 変換
  function parseType(val: string): 'IN' | 'OUT' {
    const v = val.trim()
    if (v === '入庫' || v === 'IN') return 'IN'
    if (v === '出庫' || v === 'OUT') return 'OUT'
    return 'IN'
  }

  // カテゴリのデフォルト
  function defaultCategory(type: 'IN' | 'OUT'): string {
    return type === 'IN' ? '入荷' : '出荷'
  }

  // 行をパース
  interface ParsedRow {
    date: string
    type: 'IN' | 'OUT'
    category: string
    productName: string
    quantity: number
    price: number
    partnerName: string | null
    trackingNumber: string | null
    orderCode: string | null
    shippingCode: string | null
    memo: string | null
  }

  // 連続行の結合（日付が空欄 = 前の行の取引に属する明細）
  const parsedRows: ParsedRow[] = []
  let lastBase: Omit<ParsedRow, 'productName' | 'quantity' | 'price'> | null = null

  for (const r of dataRows) {
    const date = r[0]?.trim()
    const typeStr = r[1]?.trim()
    const cat = r[2]?.trim()

    if (date) {
      // 新しい取引の開始行
      const type = parseType(typeStr)
      lastBase = {
        date,
        type,
        category: cat || defaultCategory(type),
        partnerName: r[6]?.trim() || null,
        trackingNumber: r[7]?.trim() || null,
        orderCode: r[8]?.trim() || null,
        shippingCode: r[9]?.trim() || null,
        memo: r[10]?.trim() || null,
      }
    }

    if (!lastBase) continue

    const productName = r[3]?.trim()
    if (!productName) continue

    parsedRows.push({
      ...lastBase,
      // 日付行でない場合でも基本情報は lastBase から引き継ぐ
      productName,
      quantity: parseNum(r[4]),
      price: parseNum(r[5]),
    })
  }

  if (parsedRows.length === 0) throw new Error('インポートするデータがありません')

  // 取引ごとにグループ化（日付+区分+管理番号+注文コード でグルーピング）
  interface TxGroup {
    date: string
    type: 'IN' | 'OUT'
    category: string
    partnerName: string | null
    trackingNumber: string | null
    orderCode: string | null
    shippingCode: string | null
    memo: string | null
    items: Array<{ productName: string; quantity: number; price: number }>
  }

  const groups: TxGroup[] = []
  let currentGroup: TxGroup | null = null

  for (const row of parsedRows) {
    const groupKey = `${row.date}|${row.type}|${row.trackingNumber ?? ''}|${row.orderCode ?? ''}`
    const prevKey = currentGroup
      ? `${currentGroup.date}|${currentGroup.type}|${currentGroup.trackingNumber ?? ''}|${currentGroup.orderCode ?? ''}`
      : ''

    if (currentGroup && groupKey === prevKey) {
      // 同じ取引に明細追加
      currentGroup.items.push({
        productName: row.productName,
        quantity: row.quantity,
        price: row.price,
      })
    } else {
      // 新しい取引グループ
      currentGroup = {
        date: row.date,
        type: row.type,
        category: row.category,
        partnerName: row.partnerName,
        trackingNumber: row.trackingNumber,
        orderCode: row.orderCode,
        shippingCode: row.shippingCode,
        memo: row.memo,
        items: [{
          productName: row.productName,
          quantity: row.quantity,
          price: row.price,
        }],
      }
      groups.push(currentGroup)
    }
  }

  // 商品名が見つからない場合のエラー収集
  const notFound: string[] = []

  // 各グループをトランザクション + 明細として登録
  let txCount = 0
  for (const group of groups) {
    // 明細の商品IDを解決
    const resolvedItems: Array<{ product_id: string; quantity: number; price: number }> = []
    for (const item of group.items) {
      const pid =
        productMap.get(item.productName.toLowerCase()) ??
        codeMap.get(item.productName.toLowerCase())

      if (!pid) {
        if (!notFound.includes(item.productName)) notFound.push(item.productName)
        continue
      }
      resolvedItems.push({
        product_id: pid,
        quantity: item.quantity || 1,
        price: item.price,
      })
    }

    if (resolvedItems.length === 0) continue

    const totalAmount = resolvedItems.reduce((s, i) => s + i.quantity * i.price, 0)

    // トランザクション登録
    const { data: newTx, error: txError } = await supabase
      .from('transactions')
      .insert({
        type: group.type,
        status: 'SCHEDULED' as const,
        category: group.category,
        date: group.date,
        tracking_number: group.trackingNumber,
        order_code: group.orderCode,
        shipping_code: group.shippingCode,
        partner_name: group.partnerName,
        total_amount: totalAmount,
        memo: group.memo,
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
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
        }))
      )

    if (itemsError) throw itemsError
    txCount++
  }

  if (notFound.length > 0 && txCount === 0) {
    throw new Error(
      `インポートに失敗しました。\nCSVの商品名が商品マスタに登録されていません。\n\n見つからない商品名:\n${notFound.join('\n')}\n\n※商品名は商品一覧に登録済みの名前と完全一致させてください。商品コードでもマッチできます。`
    )
  }

  if (notFound.length > 0) {
    throw new Error(
      `${txCount}件の取引を登録しました。\n以下の商品名が見つからずスキップしました:\n${notFound.join(', ')}`
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

  const header = '日付,区分,カテゴリ,商品名,数量,単価,取引先,管理番号,注文コード,追跡コード,メモ'
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
          '出荷サンプル',
        ].join(',')
      )
    }
  } else {
    // 商品未登録の場合はガイド行
    sampleRows = [
      `${today},入庫,入荷,※ここに登録済みの商品名を入力,1,1000,仕入先名,TRK-001,ORD-001,SHP-001,メモ`,
    ]
  }

  downloadCsv(
    `transactions_template_${todayStr()}.csv`,
    [header, ...sampleRows].join('\n')
  )
}
