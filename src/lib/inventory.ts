import { supabase } from './supabase'

interface TxInfo {
  type: string
  date: string
  tracking_number: string | null
  order_code: string | null
  shipping_code: string | null
  partner_name: string | null
}

interface ItemInfo {
  product_id: string
  quantity: number
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
    // 出庫: IN_STOCK個体をSHIPPEDに更新 (FIFO)
    for (const item of items) {
      const { data: stockItems } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('product_id', item.product_id)
        .eq('status', 'IN_STOCK')
        .order('in_date', { ascending: true })
        .limit(item.quantity)

      if (stockItems && stockItems.length > 0) {
        await supabase
          .from('inventory_items')
          .update({
            status: 'SHIPPED',
            out_transaction_id: txId,
            out_date: tx.date,
            shipping_code: tx.shipping_code || null,
            order_code: tx.order_code || null,
          })
          .in('id', stockItems.map((si) => si.id))
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
      })
      .eq('out_transaction_id', txId)
  }
}
