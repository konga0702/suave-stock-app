export type TransactionType = 'IN' | 'OUT'
export type TransactionStatus = 'SCHEDULED' | 'COMPLETED'
export type InCategory = '入荷' | '返品' | '棚卸'
export type OutCategory = '出荷' | '再送' | '棚卸'
export type TransactionCategory = InCategory | OutCategory

export interface Product {
  id: string
  name: string
  product_code: string | null
  internal_barcode: string | null
  image_url: string | null
  cost_price: number
  selling_price: number
  supplier: string | null
  current_stock: number
  memo: string | null
  created_at: string
  updated_at: string
  /** @deprecated 後方互換用。cost_price を使用してください */
  default_unit_price?: number
}

export interface Transaction {
  id: string
  type: TransactionType
  status: TransactionStatus
  category: TransactionCategory
  date: string
  tracking_number: string | null
  order_code: string | null
  shipping_code: string | null
  partner_name: string | null
  customer_name: string | null
  order_date: string | null
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
  order_code: string | null
  shipping_code: string | null
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
