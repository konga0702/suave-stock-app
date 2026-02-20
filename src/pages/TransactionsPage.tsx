import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Upload, Download, Search, X, ArrowDownToLine, ArrowUpFromLine, FileDown, CheckSquare, Square, CheckCheck, Trash2, ArrowUpDown, Filter, CalendarCheck, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { supabase } from '@/lib/supabase'
import { exportTransactionsCsv, importTransactionsCsv, downloadTransactionsTemplate } from '@/lib/csv'
import { toast } from 'sonner'
import type { Transaction } from '@/types/database'

interface TxWithProducts extends Transaction {
  firstProductImage?: string | null
  firstProductName?: string | null
  firstProductCode?: string | null
  itemCount?: number
}

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'partner' | 'category'

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'date_desc', label: '日付 新しい順' },
  { key: 'date_asc', label: '日付 古い順' },
  { key: 'amount_desc', label: '金額 高い順' },
  { key: 'amount_asc', label: '金額 安い順' },
  { key: 'partner', label: '取引先順' },
  { key: 'category', label: 'カテゴリ順' },
]

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<TxWithProducts[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('SCHEDULED')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL')

  // ソート・フィルター
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [partnerFilter, setPartnerFilter] = useState<string>('all')
  const [showSortFilter, setShowSortFilter] = useState(false)

  // 選択モード
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // 一括完了機能
  const [dateCutoff, setDateCutoff] = useState('2026-02-16')
  const [completing, setCompleting] = useState(false)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)

  const load = useCallback(async () => {
    try {
      // Step 1: transactions取得
      const { data, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('status', tab)
        .order('date', { ascending: false })

      if (txError) {
        console.error('transactions error:', txError.message || String(txError))
        setTransactions([])
        return
      }

      if (!data || data.length === 0) {
        setTransactions([])
        return
      }

      // Step 2: transaction_items取得（バッチ処理でSafari対応）
      const txIds = data.map((tx) => tx.id)
      let itemsData: { transaction_id: string; product_id: string }[] = []

      if (txIds.length > 0) {
        // Safari対策: 50件ずつバッチ処理
        const BATCH_SIZE = 50
        const batches = []
        for (let i = 0; i < txIds.length; i += BATCH_SIZE) {
          batches.push(txIds.slice(i, i + BATCH_SIZE))
        }

        for (const batch of batches) {
          const { data: items, error: itemsError } = await supabase
            .from('transaction_items')
            .select('transaction_id, product_id')
            .in('transaction_id', batch)

          if (itemsError) {
            console.error('items error:', itemsError.message || String(itemsError))
          } else if (items) {
            itemsData.push(...items)
          }
        }
      }

      // Step 3: products取得（バッチ処理でSafari対応）
      const productIds = [...new Set(itemsData.map((i) => i.product_id))]
      const productsMap = new Map<string, { name: string; image_url: string | null; product_code: string | null }>()

      if (productIds.length > 0) {
        // Safari対策: 50件ずつバッチ処理
        const BATCH_SIZE = 50
        const batches = []
        for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
          batches.push(productIds.slice(i, i + BATCH_SIZE))
        }

        for (const batch of batches) {
          const { data: productsData, error: prodError } = await supabase
            .from('products')
            .select('id, name, image_url, product_code')
            .in('id', batch)

          if (prodError) {
            console.error('products error:', prodError.message || String(prodError))
          } else if (productsData) {
            for (const p of productsData) {
              productsMap.set(p.id, { name: p.name, image_url: p.image_url ?? null, product_code: p.product_code ?? null })
            }
          }
        }
      }

      // Step 4: マッピング
      const txProductMap = new Map<string, { image_url: string | null; name: string; product_code: string | null; count: number }>()
      for (const item of itemsData) {
        const existing = txProductMap.get(item.transaction_id)
        const product = productsMap.get(item.product_id)
        if (!existing) {
          txProductMap.set(item.transaction_id, {
            image_url: product?.image_url ?? null,
            name: product?.name ?? '',
            product_code: product?.product_code ?? null,
            count: 1,
          })
        } else {
          existing.count++
        }
      }

      setTransactions(
        data.map((tx) => {
          const productInfo = txProductMap.get(tx.id)
          return {
            ...tx,
            firstProductImage: productInfo?.image_url ?? null,
            firstProductName: productInfo?.name ?? null,
            firstProductCode: productInfo?.product_code ?? null,
            itemCount: productInfo?.count ?? 0,
          }
        })
      )
    } catch (err) {
      console.error('load error:', err)
      setTransactions([])
    }
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  // タブ切り替え時に選択モード解除
  useEffect(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [tab])

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const count = await importTransactionsCsv(text)
        toast.success(`${count}件の取引をインポートしました`)
        load()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'インポートに失敗しました'
        if (msg.includes('件の取引を登録しました')) {
          toast.warning(msg, { duration: 8000 })
          load()
        } else {
          toast.error(msg)
        }
      }
    }
    input.click()
  }

  // カテゴリ一覧
  const categories = useMemo(() => {
    const set = new Set<string>()
    transactions.forEach((tx) => {
      if (tx.category) set.add(tx.category)
    })
    return Array.from(set).sort()
  }, [transactions])

  // 取引先一覧
  const partners = useMemo(() => {
    const set = new Set<string>()
    transactions.forEach((tx) => {
      if (tx.partner_name) set.add(tx.partner_name)
    })
    return Array.from(set).sort()
  }, [transactions])

  // フィルター → ソート
  const filteredAndSorted = useMemo(() => {
    // 1. タイプフィルター
    let result = transactions.filter((tx) => {
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) return false
      return true
    })

    // 2. テキスト検索
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((tx) =>
        tx.partner_name?.toLowerCase().includes(q) ||
        tx.tracking_number?.toLowerCase().includes(q) ||
        tx.order_code?.toLowerCase().includes(q) ||
        tx.shipping_code?.toLowerCase().includes(q) ||
        tx.memo?.toLowerCase().includes(q) ||
        tx.category?.toLowerCase().includes(q) ||
        tx.firstProductName?.toLowerCase().includes(q) ||
        tx.firstProductCode?.toLowerCase().includes(q) ||
        (tx.type === 'IN' ? '入庫' : '出庫').includes(q)
      )
    }

    // 3. カテゴリフィルター
    if (categoryFilter !== 'all') {
      result = result.filter((tx) => tx.category === categoryFilter)
    }

    // 4. 取引先フィルター
    if (partnerFilter !== 'all') {
      result = result.filter((tx) => tx.partner_name === partnerFilter)
    }

    // 5. ソート（Safari互換性対応）
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case 'date_desc':
          return (b.date || '').localeCompare(a.date || '')
        case 'date_asc':
          return (a.date || '').localeCompare(b.date || '')
        case 'amount_desc': {
          const aAmount = Number(a.total_amount) || 0
          const bAmount = Number(b.total_amount) || 0
          return bAmount - aAmount
        }
        case 'amount_asc': {
          const aAmount = Number(a.total_amount) || 0
          const bAmount = Number(b.total_amount) || 0
          return aAmount - bAmount
        }
        case 'partner':
          return (a.partner_name || '').localeCompare(b.partner_name || '')
        case 'category':
          return (a.category || '').localeCompare(b.category || '')
        default:
          return 0
      }
    })

    return result
  }, [transactions, typeFilter, search, categoryFilter, partnerFilter, sortKey])

  // 選択モード
  const toggleSelectMode = () => {
    if (selectMode) {
      setSelectMode(false)
      setSelectedIds(new Set())
    } else {
      setSelectMode(true)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAndSorted.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredAndSorted.map((tx) => tx.id)))
    }
  }

  // 日付指定で自動選択
  const selectByDate = () => {
    if (!dateCutoff) return
    const cutoffDate = new Date(dateCutoff)
    const selected = new Set<string>()

    filteredAndSorted.forEach((tx) => {
      const txDate = new Date(tx.date)
      if (txDate <= cutoffDate) {
        selected.add(tx.id)
      }
    })

    setSelectedIds(selected)
    toast.info(`${selected.size}件を選択しました`)
  }

  // 一括完了
  const handleBulkComplete = async () => {
    setCompleting(true)
    try {
      const ids = Array.from(selectedIds)

      // statusのみをCOMPLETEDに更新（在庫への影響なし）
      const { error } = await supabase
        .from('transactions')
        .update({
          status: 'COMPLETED',
          updated_at: new Date().toISOString()
        })
        .in('id', ids)
        .eq('status', 'SCHEDULED') // 念のため予定のみ対象

      if (error) throw error

      toast.success(`${ids.length}件の予定を履歴に移動しました`)
      setSelectedIds(new Set())
      setSelectMode(false)
      setShowCompleteConfirm(false)
      load()
    } catch {
      toast.error('完了処理に失敗しました')
    } finally {
      setCompleting(false)
    }
  }

  // 一括削除
  const handleBulkDelete = async () => {
    setDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      let deletedCount = 0

      for (const id of ids) {
        // 明細を先に削除
        await supabase.from('transaction_items').delete().eq('transaction_id', id)
        // トランザクション削除
        const { error } = await supabase.from('transactions').delete().eq('id', id)
        if (!error) deletedCount++
      }

      toast.success(`${deletedCount}件の取引を削除しました`)
      setSelectedIds(new Set())
      setSelectMode(false)
      setShowDeleteConfirm(false)
      load()
    } catch {
      toast.error('削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  const isAllSelected = filteredAndSorted.length > 0 && selectedIds.size === filteredAndSorted.length
  const hasActiveFilter = sortKey !== 'date_desc' || categoryFilter !== 'all' || partnerFilter !== 'all'

  return (
    <div className="page-transition space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">入出庫</h1>
        <div className="flex gap-1.5">
          {!selectMode ? (
            <>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors" onClick={() => downloadTransactionsTemplate()} title="CSVテンプレート">
                <FileDown className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors" onClick={handleImport} title="CSVインポート">
                <Upload className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors" onClick={() => exportTransactionsCsv(transactions)} title="CSVエクスポート">
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors"
                onClick={toggleSelectMode}
                title="選択モード"
              >
                <CheckSquare className="h-4 w-4" />
              </Button>
              <Button asChild size="icon" className="h-9 w-9 rounded-xl bg-slate-800 text-white shadow-sm hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 transition-all">
                <Link to="/transactions/new">
                  <Plus className="h-4 w-4" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-xl border-border/60 text-xs font-semibold hover:bg-accent transition-colors"
                onClick={toggleSelectAll}
              >
                <CheckCheck className="mr-1.5 h-4 w-4" />
                {isAllSelected ? '全解除' : '全選択'}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors"
                onClick={toggleSelectMode}
                title="選択モード終了"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 検索バー + ソート/フィルターボタン */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="取引先・管理番号・商品名など"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
        <Button
          variant="outline"
          size="icon"
          className={`h-10 w-10 rounded-xl border-border/60 transition-colors relative ${hasActiveFilter ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30 text-sky-600' : 'hover:bg-accent'}`}
          onClick={() => setShowSortFilter(true)}
          title="並び替え・絞り込み"
        >
          <ArrowUpDown className="h-4 w-4" />
          {hasActiveFilter && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-sky-500" />
          )}
        </Button>
      </div>

      {/* タイプ絞り込み */}
      <div className="flex gap-2">
        {(['ALL', 'IN', 'OUT'] as const).map((t) => {
          const active = typeFilter === t
          const label = t === 'ALL' ? 'すべて' : t === 'IN' ? '入庫' : '出庫'
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                active
                  ? t === 'IN'
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300'
                    : t === 'OUT'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                      : 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* アクティブなフィルター表示 */}
      {hasActiveFilter && (
        <div className="flex flex-wrap gap-1.5">
          {sortKey !== 'date_desc' && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 dark:bg-sky-950/30 px-2.5 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
              <ArrowUpDown className="h-3 w-3" />
              {sortOptions.find((s) => s.key === sortKey)?.label}
              <button onClick={() => setSortKey('date_desc')} className="ml-0.5 hover:text-sky-800"><X className="h-3 w-3" /></button>
            </span>
          )}
          {categoryFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              <Filter className="h-3 w-3" />
              {categoryFilter}
              <button onClick={() => setCategoryFilter('all')} className="ml-0.5 hover:text-amber-800"><X className="h-3 w-3" /></button>
            </span>
          )}
          {partnerFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-teal-50 dark:bg-teal-950/30 px-2.5 py-1 text-[11px] font-semibold text-teal-600 dark:text-teal-400">
              <Filter className="h-3 w-3" />
              {partnerFilter}
              <button onClick={() => setPartnerFilter('all')} className="ml-0.5 hover:text-teal-800"><X className="h-3 w-3" /></button>
            </span>
          )}
          <button
            onClick={() => { setSortKey('date_desc'); setCategoryFilter('all'); setPartnerFilter('all') }}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            すべてクリア
          </button>
        </div>
      )}

      {/* 選択モード時の日付選択UI（予定タブのみ） */}
      {selectMode && tab === 'SCHEDULED' && (
        <Card className="border-2 border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 shadow-sm">
          <CardContent className="flex items-center gap-2 p-3">
            <CalendarCheck className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <Input
              type="date"
              value={dateCutoff}
              onChange={(e) => setDateCutoff(e.target.value)}
              className="flex-1 h-9 rounded-lg border-sky-300 dark:border-sky-700 bg-white dark:bg-slate-900 text-sm"
            />
            <span className="text-xs text-sky-700 dark:text-sky-300 font-medium shrink-0">以前を</span>
            <Button
              onClick={selectByDate}
              size="sm"
              className="h-9 rounded-lg bg-sky-500 hover:bg-sky-600 text-white shadow-sm text-xs font-semibold px-4"
            >
              選択
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 件数表示 */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {filteredAndSorted.length === transactions.length
            ? `${transactions.length}件`
            : `${filteredAndSorted.length} / ${transactions.length}件`}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full rounded-xl bg-muted/50 p-1">
          <TabsTrigger value="SCHEDULED" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-700 transition-all">予定</TabsTrigger>
          <TabsTrigger value="COMPLETED" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-700 transition-all">履歴</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-2">
          {filteredAndSorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center animate-fade-in">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                {tab === 'SCHEDULED' ? (
                  <ArrowDownToLine className="h-7 w-7 text-muted-foreground/40" />
                ) : (
                  <ArrowUpFromLine className="h-7 w-7 text-muted-foreground/40" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {search
                  ? '検索結果がありません'
                  : tab === 'SCHEDULED' ? '予定はありません' : '履歴はありません'}
              </p>
            </div>
          ) : (
            filteredAndSorted.map((tx, index) => {
              const isIN = tx.type === 'IN'
              return selectMode ? (
                <Card
                  key={tx.id}
                  className={`mb-2 border-0 shadow-sm shadow-slate-200/50 dark:shadow-none transition-all duration-200 hover:shadow-md ${
                    index % 2 === 1 ? 'bg-slate-50/50 dark:bg-white/[0.02]' : ''
                  } ${selectedIds.has(tx.id) ? 'ring-2 ring-sky-400 dark:ring-sky-500 bg-sky-50/50 dark:bg-sky-950/20' : ''}`}
                  onClick={() => toggleSelect(tx.id)}
                >
                  <CardContent className="flex items-center gap-3.5 p-4">
                    {/* チェックボックス */}
                    <div className="shrink-0">
                      {selectedIds.has(tx.id) ? (
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-500 text-white">
                          <CheckSquare className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-border/60">
                          <Square className="h-4 w-4 text-transparent" />
                        </div>
                      )}
                    </div>
                    {/* 商品画像 or タイプアイコン */}
                    {tx.firstProductImage ? (
                      <div className={`relative h-11 w-11 shrink-0 overflow-hidden rounded border-2 ${
                        isIN ? 'border-sky-200 dark:border-sky-800' : 'border-amber-200 dark:border-amber-800'
                      }`}>
                        <img src={tx.firstProductImage} alt="" className="h-full w-full object-cover" />
                        <div className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ${
                          isIN ? 'bg-sky-500' : 'bg-amber-500'
                        }`}>
                          {isIN ? (
                            <ArrowDownToLine className="h-2.5 w-2.5 text-white" />
                          ) : (
                            <ArrowUpFromLine className="h-2.5 w-2.5 text-white" />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded ${
                        isIN ? 'bg-sky-50 dark:bg-sky-950' : 'bg-amber-50 dark:bg-amber-950'
                      }`}>
                        {isIN ? (
                          <ArrowDownToLine className="h-5 w-5 text-sky-500" />
                        ) : (
                          <ArrowUpFromLine className="h-5 w-5 text-amber-500" />
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {tx.firstProductName && (
                        <p className="text-[13px] font-bold truncate">
                          {tx.firstProductName}{(tx.itemCount ?? 0) > 1 ? <span className="text-[11px] font-normal text-muted-foreground ml-1">他{(tx.itemCount ?? 0) - 1}件</span> : ''}
                        </p>
                      )}
                      {tx.firstProductCode && (
                        <p className="font-mono text-[11px] text-muted-foreground/70 truncate">{tx.firstProductCode}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border-0 ${
                          isIN
                            ? 'bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-900 dark:text-sky-300'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-300'
                        }`}>
                          {isIN ? '入庫' : '出庫'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-md border-border/60">{tx.category}</Badge>
                        <span className="text-[11px] text-muted-foreground">{tx.date}</span>
                      </div>
                    </div>
                    <div className={`shrink-0 text-right font-bold num-display text-[15px] ${
                      isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      ¥{Number(tx.total_amount).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Link key={tx.id} to={`/transactions/${tx.id}`}>
                  <Card className={`mb-2 border-0 shadow-sm shadow-slate-200/50 dark:shadow-none transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
                    index % 2 === 1 ? 'bg-slate-50/50 dark:bg-white/[0.02]' : ''
                  }`}>
                    <CardContent className="flex items-center gap-3.5 p-4">
                      {/* 商品画像 or タイプアイコン */}
                      {tx.firstProductImage ? (
                        <div className={`relative h-11 w-11 shrink-0 overflow-hidden rounded border-2 ${
                          isIN ? 'border-sky-200 dark:border-sky-800' : 'border-amber-200 dark:border-amber-800'
                        }`}>
                          <img src={tx.firstProductImage} alt="" className="h-full w-full object-cover" />
                          <div className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ${
                            isIN ? 'bg-sky-500' : 'bg-amber-500'
                          }`}>
                            {isIN ? (
                              <ArrowDownToLine className="h-2.5 w-2.5 text-white" />
                            ) : (
                              <ArrowUpFromLine className="h-2.5 w-2.5 text-white" />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded ${
                          isIN ? 'bg-sky-50 dark:bg-sky-950' : 'bg-amber-50 dark:bg-amber-950'
                        }`}>
                          {isIN ? (
                            <ArrowDownToLine className="h-5 w-5 text-sky-500" />
                          ) : (
                            <ArrowUpFromLine className="h-5 w-5 text-amber-500" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {/* 商品名を太字で目立つように表示 */}
                        {tx.firstProductName && (
                          <p className="text-[13px] font-bold truncate">
                            {tx.firstProductName}{(tx.itemCount ?? 0) > 1 ? <span className="text-[11px] font-normal text-muted-foreground ml-1">他{(tx.itemCount ?? 0) - 1}件</span> : ''}
                          </p>
                        )}
                        {tx.firstProductCode && (
                          <p className="font-mono text-[11px] text-muted-foreground/70 truncate">{tx.firstProductCode}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border-0 ${
                            isIN
                              ? 'bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-900 dark:text-sky-300'
                              : 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-300'
                          }`}>
                            {isIN ? '入庫' : '出庫'}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-md border-border/60">{tx.category}</Badge>
                          <span className="text-[11px] text-muted-foreground">{tx.date}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          {tx.partner_name && <span className="truncate">{tx.partner_name}</span>}
                          {tx.partner_name && tx.tracking_number && <span className="opacity-40">·</span>}
                          {tx.tracking_number && (
                            <span className="truncate font-mono text-[10px] text-muted-foreground/50">
                              {tx.tracking_number}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`shrink-0 text-right font-bold num-display text-[15px] ${
                        isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        ¥{Number(tx.total_amount).toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })
          )}
        </TabsContent>
      </Tabs>

      {/* 選択モード時のフローティングアクションバー */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-50 animate-fade-in">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-800 dark:bg-slate-200 p-4 shadow-xl shadow-slate-900/30">
            <p className="text-sm font-semibold text-white dark:text-slate-900">
              {selectedIds.size}件選択中
            </p>
            <div className="flex gap-2">
              {tab === 'SCHEDULED' && (
                <Button
                  className="rounded-xl bg-sky-500 text-white hover:bg-sky-600 shadow-lg shadow-sky-500/25 transition-all text-xs font-semibold"
                  onClick={() => setShowCompleteConfirm(true)}
                  disabled={completing}
                >
                  <CheckCircle className="mr-1.5 h-4 w-4" />
                  {completing ? '処理中...' : 'まとめて完了'}
                </Button>
              )}
              <Button
                className="rounded-xl bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/25 transition-all text-xs font-semibold"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                まとめて削除
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 一括削除確認ダイアログ */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedIds.size}件の取引を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。選択した取引と関連する明細データも全て削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={deleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-rose-500 hover:bg-rose-600 rounded-xl"
              disabled={deleting}
            >
              {deleting ? '削除中...' : `${selectedIds.size}件を削除`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 一括完了確認ダイアログ */}
      <AlertDialog open={showCompleteConfirm} onOpenChange={setShowCompleteConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedIds.size}件の予定を履歴に移動しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作により、選択した{selectedIds.size}件の予定のステータスが「完了」に変更され、履歴タブに移動します。
              在庫数への影響はありません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={completing}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkComplete}
              className="bg-sky-500 hover:bg-sky-600 rounded-xl"
              disabled={completing}
            >
              {completing ? '処理中...' : `${selectedIds.size}件を完了`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ソート・フィルター ダイアログ */}
      <Dialog open={showSortFilter} onOpenChange={setShowSortFilter}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">並び替え・絞り込み</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* 並び替え */}
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <ArrowUpDown className="h-3.5 w-3.5" />
                並び替え
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {sortOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSortKey(opt.key)}
                    className={`rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all ${
                      sortKey === opt.key
                        ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/25'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* カテゴリフィルター */}
            {categories.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" />
                  カテゴリで絞り込み
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={`rounded-xl px-3 py-2 text-[12px] font-semibold transition-all ${
                      categoryFilter === 'all'
                        ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/25'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    すべて
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategoryFilter(c)}
                      className={`rounded-xl px-3 py-2 text-[12px] font-semibold transition-all ${
                        categoryFilter === c
                          ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/25'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 取引先フィルター */}
            {partners.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" />
                  取引先で絞り込み
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setPartnerFilter('all')}
                    className={`rounded-xl px-3 py-2 text-[12px] font-semibold transition-all ${
                      partnerFilter === 'all'
                        ? 'bg-teal-500 text-white shadow-sm shadow-teal-500/25'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    すべて
                  </button>
                  {partners.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPartnerFilter(p)}
                      className={`rounded-xl px-3 py-2 text-[12px] font-semibold transition-all ${
                        partnerFilter === p
                          ? 'bg-teal-500 text-white shadow-sm shadow-teal-500/25'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* リセット・閉じるボタン */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 rounded-xl text-xs border-border/60"
                onClick={() => { setSortKey('date_desc'); setCategoryFilter('all'); setPartnerFilter('all') }}
              >
                リセット
              </Button>
              <Button
                className="flex-1 rounded-xl text-xs bg-slate-800 text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300"
                onClick={() => setShowSortFilter(false)}
              >
                閉じる
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
