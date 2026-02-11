import { supabase } from './supabase'
import type { Product, Transaction } from '@/types/database'

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

function escapeCsvField(value: string | number | null | undefined): string {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function parseCsvRows(text: string): string[][] {
  const lines = text.trim().split('\n')
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
  const header = '商品名,管理バーコード,現在庫,単価,メモ'
  const rows = products.map((p) =>
    [
      escapeCsvField(p.name),
      escapeCsvField(p.internal_barcode),
      p.current_stock,
      p.default_unit_price,
      escapeCsvField(p.memo),
    ].join(',')
  )
  downloadCsv(
    `products_${new Date().toISOString().split('T')[0]}.csv`,
    [header, ...rows].join('\n')
  )
}

export async function importProductsCsv(text: string) {
  const rows = parseCsvRows(text)
  // Skip header row
  const dataRows = rows.slice(1).filter((r) => r.length >= 1 && r[0])

  const inserts = dataRows.map((r) => ({
    name: r[0],
    internal_barcode: r[1] || null,
    current_stock: parseInt(r[2]) || 0,
    default_unit_price: parseInt(r[3]) || 0,
    memo: r[4] || null,
  }))

  const { error } = await supabase.from('products').insert(inserts)
  if (error) throw error
}

// ---- Transactions CSV ----

export function exportTransactionsCsv(transactions: Transaction[]) {
  const header = 'タイプ,ステータス,カテゴリ,日付,管理番号,取引先,合計金額,メモ'
  const rows = transactions.map((t) =>
    [
      t.type,
      t.status,
      escapeCsvField(t.category),
      t.date,
      escapeCsvField(t.tracking_number),
      escapeCsvField(t.partner_name),
      t.total_amount,
      escapeCsvField(t.memo),
    ].join(',')
  )
  downloadCsv(
    `transactions_${new Date().toISOString().split('T')[0]}.csv`,
    [header, ...rows].join('\n')
  )
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
    partner_name: r[5] || null,
    total_amount: parseInt(r[6]) || 0,
    memo: r[7] || null,
  }))

  const { error } = await supabase.from('transactions').insert(inserts)
  if (error) throw error
}
