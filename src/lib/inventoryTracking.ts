import { supabase } from './supabase'
import type { InventoryItem } from '@/types/database'

/** ilike 用に % と _ と \ をエスケープ */
export function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export interface TransactionStub {
  id: string
  date: string
  type: string
  tracking_number: string | null
  order_code: string | null
  shipping_code: string | null
}

export interface TrackedInventoryUnit {
  item: InventoryItem
  product: { id: string; name: string; product_code: string | null } | null
  inTransaction: TransactionStub | null
  outTransaction: TransactionStub | null
}

/**
 * 管理番号（入庫・出庫）で在庫個体を検索する。
 * - inventory_items の tracking_number / order_code / shipping_code
 * - 入庫・出庫 COMPLETED 取引の tracking_number に紐づく個体
 */
export async function searchInventoryUnitsByManagementCode(
  rawQuery: string
): Promise<TrackedInventoryUnit[]> {
  const q = rawQuery.trim()
  if (!q) return []

  const esc = escapeIlikePattern(q)
  const wild = `%${esc}%`

  const [{ data: byColumns }, { data: inTxMatch }, { data: outTxMatch }] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('*')
      .or(`tracking_number.ilike.${wild},order_code.ilike.${wild},shipping_code.ilike.${wild}`)
      .order('in_date', { ascending: false })
      .limit(100),
    supabase
      .from('transactions')
      .select('id')
      .eq('type', 'IN')
      .eq('status', 'COMPLETED')
      .ilike('tracking_number', wild)
      .limit(50),
    supabase
      .from('transactions')
      .select('id')
      .eq('type', 'OUT')
      .eq('status', 'COMPLETED')
      .ilike('tracking_number', wild)
      .limit(50),
  ])

  const inIds = (inTxMatch ?? []).map((t) => t.id)
  const outIds = (outTxMatch ?? []).map((t) => t.id)

  const [{ data: byInTx }, { data: byOutTx }] = await Promise.all([
    inIds.length > 0
      ? supabase.from('inventory_items').select('*').in('in_transaction_id', inIds).limit(100)
      : Promise.resolve({ data: null as InventoryItem[] | null }),
    outIds.length > 0
      ? supabase.from('inventory_items').select('*').in('out_transaction_id', outIds).limit(100)
      : Promise.resolve({ data: null as InventoryItem[] | null }),
  ])

  const byId = new Map<string, InventoryItem>()
  for (const row of byColumns ?? []) {
    byId.set(row.id, row as InventoryItem)
  }
  for (const row of [...(byInTx ?? []), ...(byOutTx ?? [])]) {
    byId.set(row.id, row as InventoryItem)
  }

  const merged = [...byId.values()].sort(
    (a, b) => (b.in_date ?? '').localeCompare(a.in_date ?? '')
  )

  if (merged.length === 0) return []

  const productIds = [...new Set(merged.map((i) => i.product_id))]
  const { data: products } = await supabase
    .from('products')
    .select('id, name, product_code')
    .in('id', productIds)

  const productMap = new Map((products ?? []).map((p) => [p.id, p]))

  const txIdSet = new Set<string>()
  for (const item of merged) {
    if (item.in_transaction_id) txIdSet.add(item.in_transaction_id)
    if (item.out_transaction_id) txIdSet.add(item.out_transaction_id)
  }
  const txIds = [...txIdSet]
  let txMap = new Map<string, TransactionStub>()
  if (txIds.length > 0) {
    const { data: txs } = await supabase
      .from('transactions')
      .select('id, date, type, tracking_number, order_code, shipping_code')
      .in('id', txIds)

    txMap = new Map(
      (txs ?? []).map((t) => [
        t.id,
        {
          id: t.id,
          date: t.date,
          type: t.type,
          tracking_number: t.tracking_number ?? null,
          order_code: t.order_code ?? null,
          shipping_code: t.shipping_code ?? null,
        },
      ])
    )
  }

  return merged.map((item) => ({
    item,
    product: productMap.get(item.product_id) ?? null,
    inTransaction: item.in_transaction_id ? txMap.get(item.in_transaction_id) ?? null : null,
    outTransaction: item.out_transaction_id ? txMap.get(item.out_transaction_id) ?? null : null,
  }))
}
