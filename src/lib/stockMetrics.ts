import { supabase } from './supabase'

/**
 * 商品ごとの帳簿純在庫（COMPLETED IN qty - COMPLETED OUT qty）を返す。
 * InventoryPage / NetStockPage / ProductsPage で共通利用。
 */
export async function fetchBookNetStockMap(): Promise<Map<string, number>> {
  const [{ data: inItems }, { data: outItems }] = await Promise.all([
    supabase
      .from('transaction_items')
      .select('product_id, quantity, transaction:transactions!inner(type, status)')
      .eq('transaction.type' as string, 'IN')
      .eq('transaction.status' as string, 'COMPLETED'),
    supabase
      .from('transaction_items')
      .select('product_id, quantity, transaction:transactions!inner(type, status)')
      .eq('transaction.type' as string, 'OUT')
      .eq('transaction.status' as string, 'COMPLETED'),
  ])

  const inMap = new Map<string, number>()
  const outMap = new Map<string, number>()
  for (const item of inItems ?? []) {
    inMap.set(item.product_id, (inMap.get(item.product_id) ?? 0) + (item.quantity ?? 0))
  }
  for (const item of outItems ?? []) {
    outMap.set(item.product_id, (outMap.get(item.product_id) ?? 0) + (item.quantity ?? 0))
  }

  const result = new Map<string, number>()
  const allIds = new Set([...inMap.keys(), ...outMap.keys()])
  for (const id of allIds) {
    result.set(id, (inMap.get(id) ?? 0) - (outMap.get(id) ?? 0))
  }
  return result
}
