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
        cost_price: parseInt(r[3]) || 0,
        selling_price: 0,
        default_unit_price: parseInt(r[3]) || 0,
        supplier: null,
        current_stock: parseInt(r[2]) || 0,
        memo: r[4] || null,
      }
    } else {
      // 新: 商品名,商品コード,バーコード,仕入価格,販売価格,仕入れ先,数量,メモ
      return {
        name: r[0],
        product_code: r[1] || null,
        internal_barcode: r[2] || null,
        cost_price: parseInt(r[3]) || 0,
        selling_price: parseInt(r[4]) || 0,
        default_unit_price: parseInt(r[3]) || 0,
        supplier: r[5] || null,
        current_stock: parseInt(r[6]) || 0,
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

export async function importTransactionsCsv(text: string) {
  const rows = parseCsvRows(text)
  const dataRows = rows.slice(1).filter((r) => r.length >= 3 && r[0])

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
}

// ---- Inventory CSV ----

export function exportInventoryCsv(items: InventoryItem[]) {
  const header = '商品名,管理番号,注文コード,追跡コード,ステータス,入庫日,出荷日,取引先,メモ'
  const rows = items.map((item) => {
    const statusName = item.status === 'IN_STOCK' ? '在庫中' : '出荷済'
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
