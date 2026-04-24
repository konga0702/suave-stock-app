import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Package,
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  Layers,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  searchInventoryUnitsByManagementCode,
  type TrackedInventoryUnit,
} from '@/lib/inventoryTracking'

export function TrackStockPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [results, setResults] = useState<TrackedInventoryUnit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    setSubmittedQuery(trimmed)
    setSearched(true)
    if (!trimmed) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const rows = await searchInventoryUnitsByManagementCode(trimmed)
      setResults(rows)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="page-transition space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl hover:bg-accent transition-colors"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold tracking-tight">管理番号で追跡</h1>
      </div>

      <Card className="border border-sky-200/60 dark:border-sky-900/40 bg-sky-50/40 dark:bg-sky-950/20 shadow-sm rounded-2xl">
        <CardContent className="p-4 flex gap-2.5">
          <Info className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
          <p className="text-[12px] leading-relaxed text-sky-900/80 dark:text-sky-200/90">
            入庫時に付けた番号は各<strong>在庫個体</strong>の「管理番号」として保存されます。出庫が完了すると個体は出庫済みになり、
            入庫取引・出庫取引の管理番号の両方からこの一覧をたどれます。出庫取引にだけ入力した管理番号は、紐づく個体の<strong>出庫取引</strong>欄に表示されます。
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch(query)
            }}
            placeholder="管理番号・伝票番号など"
            className="rounded-xl pl-9 bg-white dark:bg-white/5 border-border/60"
            enterKeyHint="search"
          />
        </div>
        <Button
          className="rounded-xl shrink-0"
          onClick={() => void runSearch(query)}
          disabled={loading}
        >
          検索
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
        </div>
      )}

      {!loading && searched && submittedQuery && results.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Layers className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">該当する在庫個体はありません</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{results.length}件の個体</p>
          {results.map(({ item, product, inTransaction, outTransaction }) => {
            const isStock = item.status === 'IN_STOCK'
            return (
              <Card
                key={item.id}
                className={`border shadow-sm rounded-2xl ${
                  isStock
                    ? 'border-emerald-200/70 dark:border-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-950/15'
                    : 'border-border/40 bg-white dark:bg-white/[0.03]'
                }`}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {product ? (
                        <Link
                          to={`/inventory/${product.id}?tab=net`}
                          className="flex items-center gap-2 min-w-0 group"
                        >
                          <Package className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-emerald-600" />
                          <span className="text-sm font-semibold truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                            {product.name}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-muted-foreground">（商品削除済）</span>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        isStock
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {isStock ? '在庫中' : '出庫済み'}
                    </span>
                  </div>

                  <div className="font-mono text-sm font-bold text-violet-600 dark:text-violet-400 break-all">
                    {item.tracking_number}
                  </div>

                  <div className="grid gap-2 text-[12px]">
                    <div className="rounded-xl border border-sky-200/50 dark:border-sky-900/40 bg-sky-50/40 dark:bg-sky-950/20 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-sky-700 dark:text-sky-400">
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                        入庫
                      </div>
                      <p className="text-muted-foreground">
                        {item.in_date}
                        {item.partner_name ? ` · ${item.partner_name}` : ''}
                      </p>
                      {inTransaction?.tracking_number && (
                        <p className="font-mono text-[11px]">
                          取引の管理番号: {inTransaction.tracking_number}
                        </p>
                      )}
                      {item.order_code && item.status === 'IN_STOCK' && (
                        <p className="font-mono text-[11px] text-muted-foreground">伝票: {item.order_code}</p>
                      )}
                      {inTransaction && (
                        <Link
                          to={`/transactions/${inTransaction.id}`}
                          className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 font-semibold mt-1"
                        >
                          入庫取引を開く
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>

                    <div
                      className={`rounded-xl border p-3 space-y-1 ${
                        isStock
                          ? 'border-amber-200/40 dark:border-amber-900/30 bg-amber-50/20 dark:bg-amber-950/10'
                          : 'border-amber-200/60 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                        <ArrowUpFromLine className="h-3.5 w-3.5" />
                        出庫
                      </div>
                      {isStock ? (
                        <p className="text-muted-foreground">まだ出庫されていません</p>
                      ) : (
                        <>
                          <p className="text-muted-foreground">
                            {item.out_date ?? '—'}
                          </p>
                          {outTransaction?.tracking_number && (
                            <p className="font-mono text-[11px]">
                              取引の管理番号: {outTransaction.tracking_number}
                            </p>
                          )}
                          {(item.shipping_code || item.order_code) && (
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {[item.shipping_code, item.order_code].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          {outTransaction && (
                            <Link
                              to={`/transactions/${outTransaction.id}`}
                              className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold mt-1"
                            >
                              出庫取引を開く
                              <ChevronRight className="h-3 w-3" />
                            </Link>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
