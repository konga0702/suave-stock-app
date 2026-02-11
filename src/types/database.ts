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
  internal_id: string | null
  shipping_tracking_id: string | null
  order_id: string | null
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

export type InventoryItemStatus = 'IN_STOCK' | 'SHIPPED'

export interface InventoryItem {
  id: string
  product_id: string
  tracking_number: string
  internal_id: string | null
  shipping_tracking_id: string | null
  order_id: string | null
  status: InventoryItemStatus
  in_transaction_id: string | null
  out_transaction_id: string | null
  in_date: string
  out_date: string | null
  partner_name: string | null
  memo: string | null
  created_at: string
  updated_at: string
  product?: Product
}
