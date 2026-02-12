export type TransactionType = 'IN' | 'OUT'
export type TransactionStatus = 'SCHEDULED' | 'COMPLETED'
export type InCategory = '入荷' | '返品' | '棚卸'
export type OutCategory = '出荷' | '再送' | '棚卸'
export type TransactionCategory = InCategory | OutCategory

export interface Product {
  id: string
  name: string
  internal_barcode: string | null
  current_stock: number
  default_unit_price: number
  memo: string | null
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  type: TransactionType
  status: TransactionStatus
  category: TransactionCategory
  date: string
  tracking_number: string | null
  partner_name: string | null
  total_amount: number
  memo: string | null
  created_at: string
  updated_at: string
}

export interface TransactionItem {
  id: string
  transaction_id: string
  product_id: string
  quantity: number
  price: number
  created_at: string
  product?: Product
}

// Note: inventory_items テーブルは未作成（将来実装予定）
