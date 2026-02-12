import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Copy, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, Tag, FileText } from 'lucide-react'
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
          tracking_number: null,
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
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  const isIN = tx.type === 'IN'
  const priceLabel = isIN ? '仕入れ単価' : '販売単価'
  const hasTrackingNumber = !!tx.tracking_number

  return (
    <div className="page-transition space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-xl hover:bg-accent transition-colors" onClick={() => navigate('/transactions')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold tracking-tight">入出庫詳細</h1>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon" className="rounded-xl hover:bg-accent transition-colors" onClick={handleDuplicate} title="複製">
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl hover:bg-accent transition-colors"
            onClick={() => navigate(`/transactions/${id}/edit`)}
            title="編集"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-xl text-destructive hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors" title="削除">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>この入出庫データを削除しますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  この操作は取り消せません。明細データも同時に削除されます。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-rose-500 hover:bg-rose-600 rounded-xl">削除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* タイプ＆ステータス ヘッダーバナー */}
      <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${
        isIN
          ? 'bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500 shadow-slate-700/20'
          : 'bg-gradient-to-br from-amber-600 via-amber-500 to-amber-400 shadow-amber-500/20'
      }`}>
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            {isIN ? (
              <ArrowDownToLine className="h-6 w-6" />
            ) : (
              <ArrowUpFromLine className="h-6 w-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{isIN ? '入庫' : '出庫'}</span>
              <Badge className="bg-white/20 text-white hover:bg-white/30 border-0 text-xs rounded-md">
                {tx.category}
              </Badge>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-sm text-white/70">
              <span>{tx.date}</span>
              {tx.partner_name && <span className="opacity-60">·</span>}
              {tx.partner_name && <span>{tx.partner_name}</span>}
            </div>
          </div>
          <div className="ml-auto">
            <Badge className={`rounded-lg px-2.5 py-1 text-xs border-0 font-semibold ${
              tx.status === 'SCHEDULED'
                ? 'bg-white/20 text-white'
                : 'bg-white text-emerald-700'
            }`}>
              {tx.status === 'SCHEDULED' ? '予定' : '完了'}
            </Badge>
          </div>
        </div>
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/[0.06]" />
        <div className="absolute -bottom-4 right-6 h-16 w-16 rounded-full bg-white/[0.04]" />
      </div>

      {/* 管理番号セクション */}
      {hasTrackingNumber && (
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="space-y-3 p-5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">管理番号</p>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950">
                <Tag className="h-4 w-4 text-violet-500" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-violet-500">管理番号</p>
                <p className="font-mono text-sm">{tx.tracking_number}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* メモ */}
      {tx.memo && (
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground">メモ</p>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{tx.memo}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 明細 */}
      <div className="space-y-2">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1">明細</h2>
        {items.map((item) => (
          <Card key={item.id} className={`border shadow-sm shadow-slate-200/50 dark:shadow-none overflow-hidden transition-all ${
            isIN ? 'border-sky-100 dark:border-sky-900' : 'border-amber-100 dark:border-amber-900'
          }`}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                  isIN ? 'bg-sky-50 dark:bg-sky-950' : 'bg-amber-50 dark:bg-amber-950'
                }`}>
                  {isIN ? (
                    <ArrowDownToLine className="h-4 w-4 text-sky-500" />
                  ) : (
                    <ArrowUpFromLine className="h-4 w-4 text-amber-500" />
                  )}
                </div>
                <div>
                  <p className="text-[13px] font-semibold">{item.product?.name ?? '不明な商品'}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × ¥{Number(item.price).toLocaleString()}
                    <span className={`ml-1.5 opacity-60`}>({priceLabel})</span>
                  </p>
                </div>
              </div>
              <p className={`font-bold num-display ${isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'}`}>
                ¥{(item.quantity * Number(item.price)).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 合計金額 */}
      <div className={`rounded-2xl p-4 border ${
        isIN
          ? 'bg-sky-50/50 border-sky-100 dark:bg-sky-950/30 dark:border-sky-900'
          : 'bg-amber-50/50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900'
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">
            {isIN ? '合計仕入れ金額' : '合計販売金額'}
          </span>
          <span className={`text-2xl font-bold num-display ${isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'}`}>
            ¥{Number(tx.total_amount).toLocaleString()}
          </span>
        </div>
      </div>

      {/* 完了ボタン（予定の場合のみ） */}
      {tx.status === 'SCHEDULED' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              className={`w-full rounded-2xl shadow-lg h-12 text-[13px] font-semibold transition-all duration-300 ${
                isIN
                  ? 'bg-slate-800 text-white shadow-slate-800/20 hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300'
                  : 'bg-amber-500 text-white shadow-amber-500/20 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500'
              }`}
              size="lg"
              disabled={completing}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {completing ? '処理中...' : '完了にする（在庫反映）'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>入出庫を完了にしますか？</AlertDialogTitle>
              <AlertDialogDescription>
                在庫数が{tx.type === 'IN' ? '増加' : '減少'}します。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">キャンセル</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleComplete}
                className={`rounded-xl ${isIN
                  ? 'bg-slate-800 hover:bg-slate-700'
                  : 'bg-amber-500 hover:bg-amber-600'
                }`}
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
