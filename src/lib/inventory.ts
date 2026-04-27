import { supabase } from './supabase'

/** apply / revert に渡す取引ヘッダー（DBの transactions 行と対応） */
export interface TxInfo {
  type: string
  date: string
  tracking_number: string | null
  order_code: string | null
  shipping_code: string | null
  partner_name: string | null
}

export interface ItemInfo {
  product_id: string
  quantity: number
}

/** DBの transactions 行から TxInfo を組み立てる */
export function transactionRowToTxInfo(row: {
  type: string
  date: string
  tracking_number: string | null
  order_code: string | null
  shipping_code: string | null
  partner_name: string | null
}): TxInfo {
  return {
    type: row.type,
    date: row.date,
    tracking_number: row.tracking_number,
    order_code: row.order_code,
    shipping_code: row.shipping_code,
    partner_name: row.partner_name,
  }
}

/**
 * COMPLETED確定時: 在庫数更新 + inventory_items 登録
 * - TransactionDetailPage の「完了にする」
 * - TransactionFormPage で直接 COMPLETED 保存した場合
 * の両方から呼ばれる共通処理
 */
export async function applyCompletedTransaction(
  txId: string,
  tx: TxInfo,
  items: ItemInfo[]
): Promise<void> {
  // 在庫数を更新
  for (const item of items) {
    const delta = tx.type === 'IN' ? item.quantity : -item.quantity
    const { data: product } = await supabase
      .from('products')
      .select('current_stock')
      .eq('id', item.product_id)
      .single()
    if (!product) continue

    await supabase
      .from('products')
      .update({ current_stock: product.current_stock + delta })
      .eq('id', item.product_id)
  }

  if (tx.type === 'IN') {
    // 入庫: inventory_items に新規登録
    const inserts: object[] = []
    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        inserts.push({
          product_id: item.product_id,
          tracking_number: tx.tracking_number || `${txId.slice(0, 8)}-${i + 1}`,
          order_code: tx.order_code || null,
          shipping_code: tx.shipping_code || null,
          status: 'IN_STOCK',
          in_transaction_id: txId,
          in_date: tx.date,
          partner_name: tx.partner_name || null,
        })
      }
    }
    if (inserts.length > 0) {
      await supabase.from('inventory_items').insert(inserts)
    }
  } else {
    // 出庫: 管理番号指定がある場合は該当個体を優先してSHIPPEDに更新
    const normalizeManagementCode = (value: string | null | undefined): string =>
      (value ?? '')
        .trim()
        .replace(/[‐‑‒–—―ー−]/g, '-')
        .toUpperCase()

    const pickMatches = (
      rows: Array<{ id: string; tracking_number: string | null; order_code: string | null; shipping_code: string | null }>,
      code: string | null
    ) => {
      const normalizedCode = normalizeManagementCode(code)
      if (!normalizedCode) return [] as typeof rows
      return rows.filter(
        (row) =>
          normalizeManagementCode(row.tracking_number) === normalizedCode
          || normalizeManagementCode(row.order_code) === normalizedCode
          || normalizeManagementCode(row.shipping_code) === normalizedCode
      )
    }

    for (const item of items) {
      const { data: stockItems } = await supabase
        .from('inventory_items')
        .select('id, tracking_number, order_code, shipping_code')
        .eq('product_id', item.product_id)
        .eq('status', 'IN_STOCK')
        .order('in_date', { ascending: true })
        .limit(Math.max(item.quantity * 3, item.quantity + 10))

      if (stockItems && stockItems.length > 0) {
        let targetIds: string[] = []
        const codeCandidates = [
          ...pickMatches(stockItems, tx.tracking_number),
          ...pickMatches(stockItems, tx.order_code),
          ...pickMatches(stockItems, tx.shipping_code),
        ]
        const seen = new Set<string>()
        const uniqueByCode = codeCandidates.filter((row) => {
          if (seen.has(row.id)) return false
          seen.add(row.id)
          return true
        })

        if (tx.tracking_number || tx.order_code || tx.shipping_code) {
          if (uniqueByCode.length < item.quantity) {
            throw new Error('指定した管理番号の在庫が不足しています')
          }
          targetIds = uniqueByCode.slice(0, item.quantity).map((si) => si.id)
        } else {
          targetIds = stockItems.slice(0, item.quantity).map((si) => si.id)
        }

        await supabase
          .from('inventory_items')
          .update({
            status: 'SHIPPED',
            out_transaction_id: txId,
            out_date: tx.date,
            shipping_code: tx.shipping_code || null,
            order_code: tx.order_code || null,
          })
          .in('id', targetIds)
      }
    }
  }
}

/**
 * 予定に戻す: 在庫数を巻き戻す + inventory_items を元に戻す
 * - TransactionDetailPage の「予定に戻す」から呼ばれる
 */
export async function revertCompletedTransaction(
  txId: string,
  tx: TxInfo,
  items: ItemInfo[]
): Promise<void> {
  // 在庫数を逆転（完了時と逆方向）
  for (const item of items) {
    const delta = tx.type === 'IN' ? -item.quantity : item.quantity
    const { data: product } = await supabase
      .from('products')
      .select('current_stock')
      .eq('id', item.product_id)
      .single()
    if (!product) continue

    await supabase
      .from('products')
      .update({ current_stock: Math.max(0, product.current_stock + delta) })
      .eq('id', item.product_id)
  }

  if (tx.type === 'IN') {
    // 入庫取消: このtransactionで追加したinventory_itemsを削除
    await supabase
      .from('inventory_items')
      .delete()
      .eq('in_transaction_id', txId)
  } else {
    // 出庫取消: SHIPPEDをIN_STOCKに戻す
    await supabase
      .from('inventory_items')
      .update({
        status: 'IN_STOCK',
        out_transaction_id: null,
        out_date: null,
        shipping_code: null,
        order_code: null,
      })
      .eq('out_transaction_id', txId)
  }
}
