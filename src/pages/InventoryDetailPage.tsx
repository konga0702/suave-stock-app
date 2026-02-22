import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Package, ArrowDownToLine, ArrowUpFromLine, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/types/database'

interface TxEntry {
  txId: string
  date: string
  quantity: number
  price: number
  partner_name: string | null
  tracking_number: string | null
  order_code: string | null
  category: string | null
}

export function InventoryDetailPage() {
  const navigate = useNavigate()
  const { productId } = useParams<{ productId: string }>()
  const [product, setProduct] = useState<Product | null>(null)
  const [inEntries, setInEntries] = useState<TxEntry[]>([])
  const [outEntries, setOutEntries] = useState<TxEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!productId) return
    async function load() {
      // 商品情報
      const { data: prod } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single()
      if (prod) setProduct(prod)

      // 入荷・出荷履歴を並列取得
      const [{ data: inData }, { data: outData }] = await Promise.all([
        supabase
          .from('transaction_items')
          .select('quantity, price, transaction:transactions!inner(id, date, type, status, partner_name, tracking_number, order_code, category)')
          .eq('product_id', productId)
          .eq('transaction.type' as string, 'IN')
          .eq('transaction.status' as string, 'COMPLETED'),
        supabase
          .from('transaction_items')
          .select('quantity, price, transaction:transactions!inner(id, date, type, status, partner_name, tracking_number, order_code, category)')
          .eq('product_id', productId)
          .eq('transaction.type' as string, 'OUT')
          .eq('transaction.status' as string, 'COMPLETED'),
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapEntry = (item: any): TxEntry => {
        const tx = Array.isArray(item.transaction) ? item.transaction[0] : item.transaction
        return {
          txId:            tx?.id ?? '',
          date:            tx?.date ?? '',
          quantity:        item.quantity ?? 0,
          price:           Number(item.price ?? 0),
          partner_name:    tx?.partner_name ?? null,
          tracking_number: tx?.tracking_number ?? null,
          order_code:      tx?.order_code ?? null,
          category:        tx?.category ?? null,
        }
      }

      const sorted = (arr: TxEntry[]) =>
        [...arr].sort((a, b) => b.date.localeCompare(a.date))

      setInEntries(sorted((inData ?? []).map(mapEntry)))
      setOutEntries(sorted((outData ?? []).map(mapEntry)))
      setLoading(false)
    }
    load()
  }, [productId])

  const totalIn  = inEntries.reduce((s, e) => s + e.quantity, 0)
  const totalOut = outEntries.reduce((s, e) => s + e.quantity, 0)
  const netStock = totalIn - totalOut

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="page-transition space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="rounded-xl hover:bg-accent" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">在庫詳細</h1>
        </div>
        <p className="text-sm text-muted-foreground text-center py-12">商品が見つかりません</p>
      </div>
    )
  }

  return (
    <div className="page-transition space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-xl hover:bg-accent transition-colors" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold tracking-tight">在庫詳細</h1>
      </div>

      {/* 商品情報カード */}
      <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {product.image_url ? (
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border/40">
                <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                <Package className="h-7 w-7 text-slate-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold leading-snug truncate">{product.name}</p>
              {product.product_code && (
                <p className="font-mono text-xs text-muted-foreground/70 mt-0.5">{product.product_code}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 在庫サマリー（3カード） */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ArrowDownToLine className="h-3 w-3 text-sky-500" />
              <p className="text-[10px] font-medium text-muted-foreground">入庫</p>
            </div>
            <p className="text-xl font-bold num-display text-sky-600 dark:text-sky-400">{totalIn}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ArrowUpFromLine className="h-3 w-3 text-amber-500" />
              <p className="text-[10px] font-medium text-muted-foreground">出庫</p>
            </div>
            <p className="text-xl font-bold num-display text-amber-600 dark:text-amber-400">{totalOut}</p>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm shadow-slate-200/50 dark:shadow-none ${
          netStock > 0 ? 'bg-emerald-50/60 dark:bg-emerald-950/30' :
          netStock < 0 ? 'bg-rose-50/60 dark:bg-rose-950/30' : ''
        }`}>
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Package className="h-3 w-3 text-emerald-500" />
              <p className="text-[10px] font-medium text-muted-foreground">純在庫</p>
            </div>
            <p className={`text-xl font-bold num-display ${
              netStock > 0 ? 'text-emerald-600 dark:text-emerald-400' :
              netStock < 0 ? 'text-rose-600 dark:text-rose-400' :
              'text-slate-500'
            }`}>{netStock}</p>
          </CardContent>
        </Card>
      </div>

      {/* 入荷・出荷履歴タブ */}
      <Tabs defaultValue="in">
        <TabsList className="w-full rounded-xl bg-slate-100 dark:bg-slate-800 p-1 h-11 gap-1">
          <TabsTrigger
            value="in"
            className="flex-1 rounded-lg text-xs font-bold transition-all
              data-[state=active]:bg-sky-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-sky-500/30
              data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-sky-500"
          >
            <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
            入荷 ({inEntries.length})
          </TabsTrigger>
          <TabsTrigger
            value="out"
            className="flex-1 rounded-lg text-xs font-bold transition-all
              data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-500/30
              data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-amber-500"
          >
            <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" />
            出荷 ({outEntries.length})
          </TabsTrigger>
        </TabsList>

        {(['in', 'out'] as const).map((direction) => {
          const entries = direction === 'in' ? inEntries : outEntries
          const isIN = direction === 'in'
          return (
            <TabsContent key={direction} value={direction} className="mt-3 space-y-2">
              {entries.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center animate-fade-in">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                    {isIN
                      ? <ArrowDownToLine className="h-7 w-7 text-muted-foreground/40" />
                      : <ArrowUpFromLine className="h-7 w-7 text-muted-foreground/40" />}
                  </div>
                  <p className="text-sm text-muted-foreground">{isIN ? '入荷' : '出荷'}履歴はありません</p>
                </div>
              ) : (
                entries.map((entry, idx) => (
                  <Link key={`${entry.txId}-${idx}`} to={`/transactions/${entry.txId}`}>
                    <Card className="border border-border/40 shadow-sm rounded-2xl transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 bg-white dark:bg-white/[0.03]">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          {/* 左: テキスト情報 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              {isIN
                                ? <ArrowDownToLine className="h-4 w-4 shrink-0 text-sky-500" />
                                : <ArrowUpFromLine className="h-4 w-4 shrink-0 text-amber-500" />}
                              <span className={`text-sm font-bold ${isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {entry.date}
                              </span>
                              {entry.category && (
                                <span className="text-xs text-muted-foreground">· {entry.category}</span>
                              )}
                            </div>
                            {/* 管理番号（目立つ表示） */}
                            {entry.tracking_number && (
                              <p className="font-mono text-sm font-bold text-violet-600 dark:text-violet-400 truncate mb-0.5">
                                {entry.tracking_number}
                              </p>
                            )}
                            {entry.partner_name && (
                              <p className="text-xs text-muted-foreground truncate">{entry.partner_name}</p>
                            )}
                            {entry.order_code && (
                              <p className="font-mono text-[11px] text-muted-foreground/60 truncate mt-0.5">{entry.order_code}</p>
                            )}
                          </div>

                          {/* 右: 数量バッジ + 矢印 */}
                          <div className="flex items-center gap-2 shrink-0">
                            <div className={`rounded-xl px-3 py-2 text-center min-w-[52px] ${
                              isIN ? 'bg-sky-50 dark:bg-sky-950/50' : 'bg-amber-50 dark:bg-amber-950/50'
                            }`}>
                              <p className="text-[9px] font-medium text-muted-foreground/60 mb-0.5">数量</p>
                              <p className={`text-base font-bold num-display ${
                                isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'
                              }`}>{entry.quantity}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
