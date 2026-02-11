import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Copy, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, Store, Truck, ShoppingBag, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
      if (tx.internal_id) {
        if (tx.type === 'IN') {
          for (const item of items) {
            await supabase.from('inventory_items').insert({
              product_id: item.product_id,
              tracking_number: tx.internal_id,
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
      {/* ヘッダー */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate('/transactions')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">入出庫詳細</h1>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon" className="rounded-xl hover:bg-indigo-50 hover:text-indigo-600" onClick={handleDuplicate} title="複製">
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl hover:bg-indigo-50 hover:text-indigo-600"
            onClick={() => navigate(`/transactions/${id}/edit`)}
            title="編集"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-xl text-destructive hover:bg-red-50" title="削除">
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
                <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">削除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* タイプ＆ステータス ヘッダーバナー */}
      <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${
        isIN
          ? 'bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600'
          : 'bg-gradient-to-br from-amber-500 via-orange-500 to-red-500'
      }`}>
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
            {isIN ? (
              <ArrowDownToLine className="h-6 w-6" />
            ) : (
              <ArrowUpFromLine className="h-6 w-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{isIN ? '入庫' : '出庫'}</span>
              <Badge className="bg-white/20 text-white hover:bg-white/30 border-0 text-xs">
                {tx.category}
              </Badge>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-sm text-white/80">
              <span>{tx.date}</span>
              {tx.partner_name && <span>· {tx.partner_name}</span>}
            </div>
          </div>
          <div className="ml-auto">
            <Badge className={`rounded-lg px-2.5 py-1 text-xs border-0 ${
              tx.status === 'SCHEDULED'
                ? 'bg-white/20 text-white'
                : 'bg-white text-emerald-700'
            }`}>
              {tx.status === 'SCHEDULED' ? '予定' : '完了'}
            </Badge>
          </div>
        </div>
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute -bottom-4 -right-2 h-16 w-16 rounded-full bg-white/10" />
      </div>

      {/* 管理番号セクション */}
      {hasAnyId && (
        <Card className="border-0 shadow-sm">
          <CardContent className="space-y-2.5 p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">管理番号</p>
            {tx.internal_id && (
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
                  <Store className="h-4 w-4 text-violet-500" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-violet-500">店舗管理番号</p>
                  <p className="font-mono text-sm">{tx.internal_id}</p>
                </div>
              </div>
            )}
            {tx.shipping_tracking_id && (
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50">
                  <Truck className="h-4 w-4 text-sky-500" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-sky-500">配送追跡番号</p>
                  <p className="font-mono text-sm">{tx.shipping_tracking_id}</p>
                </div>
              </div>
            )}
            {tx.order_id && (
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-50">
                  <ShoppingBag className="h-4 w-4 text-pink-500" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-pink-500">注文ID</p>
                  <p className="font-mono text-sm">{tx.order_id}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* メモ */}
      {tx.memo && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
                <FileText className="h-4 w-4 text-gray-400" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground">メモ</p>
                <p className="text-sm text-muted-foreground mt-0.5">{tx.memo}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 明細 */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">明細</h2>
        {items.map((item) => (
          <Card key={item.id} className={`border shadow-sm overflow-hidden ${
            isIN ? 'border-blue-100' : 'border-amber-100'
          }`}>
            <CardContent className="flex items-center justify-between p-3.5">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  isIN ? 'bg-blue-50' : 'bg-amber-50'
                }`}>
                  {isIN ? (
                    <ArrowDownToLine className={`h-4 w-4 text-blue-500`} />
                  ) : (
                    <ArrowUpFromLine className={`h-4 w-4 text-amber-500`} />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">{item.product?.name ?? '不明な商品'}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × ¥{Number(item.price).toLocaleString()}
                    <span className={`ml-1 ${isIN ? 'text-blue-400' : 'text-amber-400'}`}>({priceLabel})</span>
                  </p>
                </div>
              </div>
              <p className={`font-bold ${isIN ? 'text-blue-600' : 'text-amber-600'}`}>
                ¥{(item.quantity * Number(item.price)).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 合計金額 */}
      <div className={`rounded-2xl p-4 ${
        isIN
          ? 'bg-gradient-to-r from-blue-50 to-indigo-50'
          : 'bg-gradient-to-r from-amber-50 to-orange-50'
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">
            {isIN ? '合計仕入れ金額' : '合計販売金額'}
          </span>
          <span className={`text-2xl font-bold ${isIN ? 'text-blue-600' : 'text-amber-600'}`}>
            ¥{Number(tx.total_amount).toLocaleString()}
          </span>
        </div>
      </div>

      {/* 完了ボタン（予定の場合のみ） */}
      {tx.status === 'SCHEDULED' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              className={`w-full rounded-xl shadow-lg ${
                isIN
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
              }`}
              size="lg"
              disabled={completing}
            >
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
              <AlertDialogAction
                onClick={handleComplete}
                className={isIN
                  ? 'bg-blue-500 hover:bg-blue-600'
                  : 'bg-amber-500 hover:bg-amber-600'
                }
              >
                完了にする
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
