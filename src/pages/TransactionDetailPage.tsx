import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Copy, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Transaction, TransactionItem } from '@/types/database'

export function TransactionDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [tx, setTx] = useState<Transaction | null>(null)
  const [items, setItems] = useState<TransactionItem[]>([])
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    if (!id) return
    async function load() {
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .single()
      if (txData) setTx(txData)

      const { data: itemsData } = await supabase
        .from('transaction_items')
        .select('*, product:products(*)')
        .eq('transaction_id', id!)
      if (itemsData) {
        setItems(
          itemsData.map((item) => ({
            ...item,
            product: item.product as TransactionItem['product'],
          }))
        )
      }
    }
    load()
  }, [id])

  // 予定完了 → 在庫反映 + 個体追跡登録
  const handleComplete = async () => {
    if (!tx || !id) return
    setCompleting(true)
    try {
      // 在庫数を更新
      for (const item of items) {
        const delta = tx.type === 'IN' ? item.quantity : -item.quantity
        const { data: product } = await supabase
          .from('products')
          .select('current_stock')
          .eq('id', item.product_id)
          .single()
        if (!product) continue

        const newStock = product.current_stock + delta
        await supabase
          .from('products')
          .update({ current_stock: newStock })
          .eq('id', item.product_id)
      }

      // 個体追跡 (inventory_items) への登録/更新
      // internal_id をキーにして追跡
      if (tx.internal_id) {
        if (tx.type === 'IN') {
          // 入庫完了 → inventory_items に IN_STOCK として登録
          for (const item of items) {
            await supabase.from('inventory_items').insert({
              product_id: item.product_id,
              tracking_number: tx.internal_id, // 互換性のため
              internal_id: tx.internal_id,
              shipping_tracking_id: tx.shipping_tracking_id,
              order_id: tx.order_id,
              status: 'IN_STOCK',
              in_transaction_id: id,
              in_date: tx.date,
              partner_name: tx.partner_name,
            })
          }
        } else {
          // 出庫完了 → 該当 internal_id の inventory_items を SHIPPED に更新
          await supabase
            .from('inventory_items')
            .update({
              status: 'SHIPPED',
              out_transaction_id: id,
              out_date: tx.date,
              shipping_tracking_id: tx.shipping_tracking_id,
              order_id: tx.order_id,
            })
            .eq('internal_id', tx.internal_id)
            .eq('status', 'IN_STOCK')
        }
      }

      // ステータス更新
      const { error } = await supabase
        .from('transactions')
        .update({ status: 'COMPLETED' })
        .eq('id', id)
      if (error) throw error

      toast.success('完了しました。在庫数を反映しました。')
      setTx({ ...tx, status: 'COMPLETED' })
    } catch {
      toast.error('完了処理に失敗しました')
    } finally {
      setCompleting(false)
    }
  }

  // 複製して新規予定作成
  const handleDuplicate = async () => {
    if (!tx) return
    try {
      const { data: newTx, error } = await supabase
        .from('transactions')
        .insert({
          type: tx.type,
          status: 'SCHEDULED',
          category: tx.category,
          date: new Date().toISOString().split('T')[0],
          internal_id: null,
          shipping_tracking_id: null,
          order_id: null,
          partner_name: tx.partner_name,
          total_amount: tx.total_amount,
          memo: tx.memo ? `[複製] ${tx.memo}` : '[複製]',
        })
        .select()
        .single()
      if (error || !newTx) throw error

      if (items.length > 0) {
        await supabase.from('transaction_items').insert(
          items.map((item) => ({
            transaction_id: newTx.id,
            product_id: item.product_id,
            quantity: item.quantity,
            price: Number(item.price),
          }))
        )
      }
      toast.success('複製しました')
      navigate(`/transactions/${newTx.id}`)
    } catch {
      toast.error('複製に失敗しました')
    }
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
      toast.success('削除しました')
      navigate('/transactions')
    } catch {
      toast.error('削除に失敗しました')
    }
  }

  if (!tx) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  const isIN = tx.type === 'IN'
  const priceLabel = isIN ? '仕入れ単価' : '販売単価'
  const hasAnyId = tx.internal_id || tx.shipping_tracking_id || tx.order_id

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/transactions')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">入出庫詳細</h1>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon" onClick={handleDuplicate} title="複製">
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/transactions/${id}/edit`)}
            title="編集"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive" title="削除">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>この入出庫データを削除しますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  この操作は取り消せません。明細データも同時に削除されます。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>削除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* ヘッダ情報 */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Badge variant={tx.type === 'IN' ? 'default' : 'secondary'}>
              {tx.type === 'IN' ? '入庫' : '出庫'}
            </Badge>
            <Badge variant="outline">{tx.category}</Badge>
            <Badge variant={tx.status === 'SCHEDULED' ? 'outline' : 'default'}>
              {tx.status === 'SCHEDULED' ? '予定' : '完了'}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">日付: </span>
              {tx.date}
            </div>
            {tx.partner_name && (
              <div>
                <span className="text-muted-foreground">取引先: </span>
                {tx.partner_name}
              </div>
            )}
          </div>

          {/* 3分割管理番号 */}
          {hasAnyId && (
            <div className="space-y-1 text-sm">
              {tx.internal_id && (
                <div>
                  <span className="text-muted-foreground">店舗管理番号: </span>
                  <span className="font-mono">{tx.internal_id}</span>
                </div>
              )}
              {tx.shipping_tracking_id && (
                <div>
                  <span className="text-muted-foreground">配送追跡番号: </span>
                  <span className="font-mono">{tx.shipping_tracking_id}</span>
                </div>
              )}
              {tx.order_id && (
                <div>
                  <span className="text-muted-foreground">注文ID: </span>
                  <span className="font-mono">{tx.order_id}</span>
                </div>
              )}
            </div>
          )}

          {tx.memo && (
            <p className="text-sm text-muted-foreground">{tx.memo}</p>
          )}
        </CardContent>
      </Card>

      {/* 明細 */}
      <div className="space-y-2">
        <h2 className="font-medium">明細</h2>
        {items.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-medium">{item.product?.name ?? '不明な商品'}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantity} × ¥{Number(item.price).toLocaleString()}
                  <span className="ml-1 text-muted-foreground">({priceLabel})</span>
                </p>
              </div>
              <p className="font-medium">
                ¥{(item.quantity * Number(item.price)).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <span className="font-medium">
          {isIN ? '合計仕入れ金額' : '合計販売金額'}
        </span>
        <span className="text-lg font-bold">
          ¥{Number(tx.total_amount).toLocaleString()}
        </span>
      </div>

      {/* 完了ボタン（予定の場合のみ） */}
      {tx.status === 'SCHEDULED' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-full" size="lg" disabled={completing}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {completing ? '処理中...' : '完了にする（在庫反映）'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>入出庫を完了にしますか？</AlertDialogTitle>
              <AlertDialogDescription>
                在庫数が{tx.type === 'IN' ? '増加' : '減少'}します。
                {tx.internal_id && (
                  tx.type === 'IN'
                    ? ' 管理番号が個体追跡に登録されます。'
                    : ' 管理番号が出荷済みに更新されます。'
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction onClick={handleComplete}>完了にする</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
