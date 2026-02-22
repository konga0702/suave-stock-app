import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package, ArrowDownToLine, ArrowUpFromLine, Search, X, ArrowUpDown, Filter,
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

type SortKey = 'name_asc' | 'name_desc' | 'net_desc' | 'net_asc' | 'in_desc' | 'out_desc'
type StockFilter = 'all' | 'positive' | 'negative' | 'zero' | 'has_in' | 'has_out'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name_asc', label: '商品名 A→Z' },
  { key: 'name_desc', label: '商品名 Z→A' },
  { key: 'net_desc', label: '純在庫 多い順' },
  { key: 'net_asc', label: '純在庫 少ない順' },
  { key: 'in_desc', label: '入庫数 多い順' },
  { key: 'out_desc', label: '出庫数 多い順' },
]

const FILTER_OPTIONS: { key: StockFilter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'positive', label: 'プラス在庫' },
  { key: 'negative', label: 'マイナス在庫' },
  { key: 'zero', label: 'ゼロ在庫' },
  { key: 'has_in', label: '入庫あり' },
  { key: 'has_out', label: '出庫あり' },
]

export function InventoryPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<NetStockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('net_desc')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [showSortPanel, setShowSortPanel] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: products } = await supabase
        .from('products')
        .select('id, name, product_code, image_url')
        .order('name')

      if (!products) { setLoading(false); return }

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

  const processedRows = useMemo(() => {
    let result = rows.filter((r) => {
      if (!search) return true
      const q = search.toLowerCase()
      return r.product_name.toLowerCase().includes(q) || r.product_code.toLowerCase().includes(q)
    })

    switch (stockFilter) {
      case 'positive': result = result.filter((r) => r.netStock > 0); break
      case 'negative': result = result.filter((r) => r.netStock < 0); break
      case 'zero':     result = result.filter((r) => r.netStock === 0); break
      case 'has_in':   result = result.filter((r) => r.totalIn > 0); break
      case 'has_out':  result = result.filter((r) => r.totalOut > 0); break
    }

    return [...result].sort((a, b) => {
      switch (sortKey) {
        case 'name_asc':  return a.product_name.localeCompare(b.product_name, 'ja')
        case 'name_desc': return b.product_name.localeCompare(a.product_name, 'ja')
        case 'net_desc':  return b.netStock - a.netStock
        case 'net_asc':   return a.netStock - b.netStock
        case 'in_desc':   return b.totalIn - a.totalIn
        case 'out_desc':  return b.totalOut - a.totalOut
        default:          return 0
      }
    })
  }, [rows, search, stockFilter, sortKey])

  // 全商品合計（ダッシュボードと一致させる）
  const totalIn  = rows.reduce((s, r) => s + r.totalIn, 0)
  const totalOut = rows.reduce((s, r) => s + r.totalOut, 0)
  const totalNetStock = totalIn - totalOut

  const activeSortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label
  const activeFilterLabel = FILTER_OPTIONS.find((o) => o.key === stockFilter)?.label

  return (
    <div className="page-transition space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">在庫</h1>
        <p className="text-xs text-muted-foreground">{rows.length}商品</p>
      </div>

      {/* サマリーカード（ダッシュボードと同じ計算） */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ArrowDownToLine className="h-3 w-3 text-sky-500" />
              <p className="text-[10px] font-medium text-muted-foreground">総入庫</p>
            </div>
            <p className="text-xl font-bold num-display text-sky-600 dark:text-sky-400">{totalIn}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ArrowUpFromLine className="h-3 w-3 text-amber-500" />
              <p className="text-[10px] font-medium text-muted-foreground">総出庫</p>
            </div>
            <p className="text-xl font-bold num-display text-amber-600 dark:text-amber-400">{totalOut}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none bg-emerald-50/60 dark:bg-emerald-950/30">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Package className="h-3 w-3 text-emerald-500" />
              <p className="text-[10px] font-medium text-muted-foreground">純在庫</p>
            </div>
            <p className="text-xl font-bold num-display text-emerald-600 dark:text-emerald-400">{totalNetStock}</p>
          </CardContent>
        </Card>
      </div>

      {/* 検索バー */}
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

      {/* ソート・フィルターボタン */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className={`rounded-xl text-xs gap-1.5 ${sortKey !== 'net_desc' ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300' : ''}`}
          onClick={() => { setShowSortPanel((v) => !v); setShowFilterPanel(false) }}
        >
          <ArrowUpDown className="h-3 w-3" />
          {activeSortLabel ?? '並び替え'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={`rounded-xl text-xs gap-1.5 ${stockFilter !== 'all' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' : ''}`}
          onClick={() => { setShowFilterPanel((v) => !v); setShowSortPanel(false) }}
        >
          <Filter className="h-3 w-3" />
          {activeFilterLabel ?? '絞り込み'}
        </Button>
        {(sortKey !== 'net_desc' || stockFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl text-xs text-muted-foreground hover:text-foreground ml-auto"
            onClick={() => { setSortKey('net_desc'); setStockFilter('all') }}
          >
            <X className="h-3 w-3 mr-1" />クリア
          </Button>
        )}
      </div>

      {/* ソートパネル */}
      {showSortPanel && (
        <div className="flex flex-wrap gap-1.5">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => { setSortKey(opt.key); setShowSortPanel(false) }}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                sortKey === opt.key
                  ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* フィルターパネル */}
      {showFilterPanel && (
        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => { setStockFilter(opt.key); setShowFilterPanel(false) }}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                stockFilter === opt.key
                  ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* 件数 */}
      <p className="text-xs text-muted-foreground">
        {processedRows.length === rows.length
          ? `${rows.length}件の商品`
          : `${processedRows.length} / ${rows.length}件を表示`}
      </p>

      {/* 商品一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      ) : processedRows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center animate-fade-in">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Package className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">該当する商品がありません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {processedRows.map((row) => (
            <Card
              key={row.product_id}
              className="border border-border/40 shadow-sm rounded-2xl transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer bg-white dark:bg-white/[0.03]"
              onClick={() => navigate(`/inventory/${row.product_id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {/* 商品画像 */}
                  {row.product_image ? (
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border/40">
                      <img src={row.product_image} alt={row.product_name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                      <Package className="h-6 w-6 text-slate-400" />
                    </div>
                  )}

                  {/* 商品名・コード */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-snug truncate">{row.product_name}</p>
                    {row.product_code && (
                      <p className="font-mono text-xs text-muted-foreground/70 truncate mt-0.5">{row.product_code}</p>
                    )}
                  </div>

                  {/* 入庫・出庫・純在庫 */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-center">
                      <p className="text-[9px] font-medium text-muted-foreground/60 mb-0.5">入庫</p>
                      <p className="text-sm font-bold num-display text-sky-600 dark:text-sky-400">{row.totalIn}</p>
                    </div>
                    <div className="h-7 w-px bg-border/40" />
                    <div className="text-center">
                      <p className="text-[9px] font-medium text-muted-foreground/60 mb-0.5">出庫</p>
                      <p className="text-sm font-bold num-display text-amber-600 dark:text-amber-400">{row.totalOut}</p>
                    </div>
                    <div className="h-7 w-px bg-border/40" />
                    <div className={`text-center min-w-[44px] rounded-xl px-2 py-1.5 ${
                      row.netStock > 0
                        ? 'bg-emerald-50 dark:bg-emerald-950/50'
                        : row.netStock < 0
                          ? 'bg-rose-50 dark:bg-rose-950/50'
                          : 'bg-slate-100 dark:bg-slate-800/50'
                    }`}>
                      <p className="text-[9px] font-medium text-muted-foreground/60 mb-0.5">純在庫</p>
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
