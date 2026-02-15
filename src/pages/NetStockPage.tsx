import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Package, ArrowDownToLine, ArrowUpFromLine, Search, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

interface NetStockRow {
  product_id: string
  product_name: string
  product_code: string
  product_image: string | null
  totalIn: number
  totalOut: number
  netStock: number
}

export function NetStockPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<NetStockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      // 全商品を取得
      const { data: products } = await supabase
        .from('products')
        .select('id, name, product_code, image_url')
        .order('name')

      if (!products) {
        setLoading(false)
        return
      }

      // COMPLETED取引の入庫明細
      const { data: inItems } = await supabase
        .from('transaction_items')
        .select('product_id, quantity, transaction:transactions!inner(type, status)')
        .eq('transaction.type' as string, 'IN')
        .eq('transaction.status' as string, 'COMPLETED')

      // COMPLETED取引の出庫明細
      const { data: outItems } = await supabase
        .from('transaction_items')
        .select('product_id, quantity, transaction:transactions!inner(type, status)')
        .eq('transaction.type' as string, 'OUT')
        .eq('transaction.status' as string, 'COMPLETED')

      // 商品ごとに集計
      const inMap = new Map<string, number>()
      const outMap = new Map<string, number>()

      for (const item of inItems ?? []) {
        inMap.set(item.product_id, (inMap.get(item.product_id) ?? 0) + (item.quantity ?? 0))
      }
      for (const item of outItems ?? []) {
        outMap.set(item.product_id, (outMap.get(item.product_id) ?? 0) + (item.quantity ?? 0))
      }

      const result: NetStockRow[] = products.map((p) => {
        const totalIn = inMap.get(p.id) ?? 0
        const totalOut = outMap.get(p.id) ?? 0
        return {
          product_id: p.id,
          product_name: p.name,
          product_code: p.product_code ?? '',
          product_image: p.image_url ?? null,
          totalIn,
          totalOut,
          netStock: totalIn - totalOut,
        }
      })

      setRows(result)
      setLoading(false)
    }
    load()
  }, [])

  const filteredRows = rows.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.product_name.toLowerCase().includes(q) ||
      r.product_code.toLowerCase().includes(q)
    )
  })

  const totalNetStock = filteredRows.reduce((sum, r) => sum + r.netStock, 0)
  const totalIn = filteredRows.reduce((sum, r) => sum + r.totalIn, 0)
  const totalOut = filteredRows.reduce((sum, r) => sum + r.totalOut, 0)

  return (
    <div className="page-transition space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-xl hover:bg-accent transition-colors" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold tracking-tight">純在庫一覧</h1>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ArrowDownToLine className="h-3 w-3 text-sky-500" />
              <p className="text-[10px] font-medium text-muted-foreground">総入庫</p>
            </div>
            <p className="text-lg font-bold num-display text-sky-600 dark:text-sky-400">{totalIn}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ArrowUpFromLine className="h-3 w-3 text-amber-500" />
              <p className="text-[10px] font-medium text-muted-foreground">総出庫</p>
            </div>
            <p className="text-lg font-bold num-display text-amber-600 dark:text-amber-400">{totalOut}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Package className="h-3 w-3 text-emerald-500" />
              <p className="text-[10px] font-medium text-muted-foreground">純在庫</p>
            </div>
            <p className="text-lg font-bold num-display text-emerald-600 dark:text-emerald-400">{totalNetStock}</p>
          </CardContent>
        </Card>
      </div>

      {/* 検索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="商品名・商品コードで検索..."
          inputMode="text"
          enterKeyHint="done"
          className="rounded-xl pl-9 pr-9 bg-white dark:bg-white/5 border-border/60"
        />
        {search && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-lg text-muted-foreground/60 hover:text-foreground"
            onClick={() => setSearch('')}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* 件数 */}
      <p className="text-xs text-muted-foreground">{filteredRows.length}件の商品</p>

      {/* 一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Package className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">該当する商品がありません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRows.map((row) => (
            <Card
              key={row.product_id}
              className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none transition-all duration-200 hover:shadow-md cursor-pointer"
              onClick={() => navigate(`/products/${row.product_id}/edit`)}
            >
              <CardContent className="p-0">
                <div className="flex items-center gap-3 p-3">
                  {/* 商品画像 */}
                  {row.product_image ? (
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border/40">
                      <img src={row.product_image} alt={row.product_name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                      <Package className="h-5 w-5 text-slate-400" />
                    </div>
                  )}

                  {/* 商品名・コード */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate">{row.product_name}</p>
                    {row.product_code && (
                      <p className="font-mono text-[11px] text-muted-foreground/70 truncate">{row.product_code}</p>
                    )}
                  </div>

                  {/* 入庫・出庫・純在庫 */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-center">
                      <p className="text-[9px] font-medium text-muted-foreground/60">入庫</p>
                      <p className="text-sm font-bold num-display text-sky-600 dark:text-sky-400">{row.totalIn}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-medium text-muted-foreground/60">出庫</p>
                      <p className="text-sm font-bold num-display text-amber-600 dark:text-amber-400">{row.totalOut}</p>
                    </div>
                    <div className={`text-center min-w-[40px] rounded-lg px-2 py-1 ${
                      row.netStock > 0
                        ? 'bg-emerald-50 dark:bg-emerald-950/50'
                        : row.netStock < 0
                          ? 'bg-rose-50 dark:bg-rose-950/50'
                          : 'bg-slate-50 dark:bg-slate-800/50'
                    }`}>
                      <p className="text-[9px] font-medium text-muted-foreground/60">純在庫</p>
                      <p className={`text-sm font-bold num-display ${
                        row.netStock > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.netStock < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-500'
                      }`}>{row.netStock}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
