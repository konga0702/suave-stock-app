import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Upload, Search, X, ArrowDownToLine, ArrowUpFromLine, FileDown, CheckSquare, Square, CheckCheck, Trash2, ArrowUpDown, Filter, ClipboardList, CheckCircle, CalendarCheck, ChevronDown, Calendar, Package } from 'lucide-react'
import { BarcodeScanButton } from '@/components/BarcodeScanButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
import { exportTransactionsDetailCsvWithFilters, importTransactionsCsv, downloadTransactionsTemplate } from '@/lib/csv'
import type { ExportProgress } from '@/lib/csv'
import { toast } from 'sonner'
import type { Transaction } from '@/types/database'

interface TxWithProducts extends Transaction {
  firstProductImage?: string | null
  firstProductName?: string | null
  firstProductCode?: string | null
  itemCount?: number
}

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'partner' | 'category'

// 日付フィルターのプリセット
type DatePreset = 'all' | 'this_month' | 'this_year' | 'last_month' | 'last_year' | 'last_30' | 'last_90' | 'custom'

interface DateRange {
  from: string | null
  to: string | null
}

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'date_desc', label: '日付 新しい順' },
  { key: 'date_asc', label: '日付 古い順' },
  { key: 'amount_desc', label: '金額 高い順' },
  { key: 'amount_asc', label: '金額 安い順' },
  { key: 'partner', label: '取引先順' },
  { key: 'category', label: 'カテゴリ順' },
]

const datePresets: { key: DatePreset; label: string }[] = [
  { key: 'this_month', label: '今月' },
  { key: 'this_year', label: '今年' },
  { key: 'last_month', label: '先月' },
  { key: 'last_year', label: '昨年' },
  { key: 'last_30', label: '過去30日間' },
  { key: 'last_90', label: '過去90日間' },
  { key: 'all', label: '全範囲' },
  { key: 'custom', label: 'カスタム範囲' },
]

function getDateRangeForPreset(preset: DatePreset): DateRange {
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  switch (preset) {
    case 'this_month': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1)
      const to = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return { from: fmt(from), to: fmt(to) }
    }
    case 'this_year': {
      return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31` }
    }
    case 'last_month': {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const to = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: fmt(from), to: fmt(to) }
    }
    case 'last_year': {
      return { from: `${today.getFullYear() - 1}-01-01`, to: `${today.getFullYear() - 1}-12-31` }
    }
    case 'last_30': {
      const from = new Date(today)
      from.setDate(today.getDate() - 30)
      return { from: fmt(from), to: fmt(today) }
    }
    case 'last_90': {
      const from = new Date(today)
      from.setDate(today.getDate() - 90)
      return { from: fmt(from), to: fmt(today) }
    }
    default:
      return { from: null, to: null }
  }
}

// カテゴリ絞り込みの選択肢
type CategoryFilter = 'all' | '入荷' | '出荷' | '移動' | '棚卸'

const categoryFilterOptions: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: '入荷', label: '入荷' },
  { key: '出荷', label: '出荷' },
  { key: '移動', label: '移動' },
  { key: '棚卸', label: '棚卸' },
]

export function TransactionsPage() {
  const [searchParams] = useSearchParams()
  const [transactions, setTransactions] = useState<TxWithProducts[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState(() => {
    const s = searchParams.get('status')
    return s === 'COMPLETED' || s === 'SCHEDULED' ? s : 'SCHEDULED'
  })
  const [typeFilter] = useState<'ALL' | 'IN' | 'OUT'>(() => {
    const t = searchParams.get('type')
    return t === 'IN' || t === 'OUT' ? t : 'ALL'
  })

  // カテゴリ絞り込み（クラプロ仕様：入荷/出荷/移動/棚卸/全部）
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)

  // 日付フィルター
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)

  // ソート・フィルター
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')
  const [partnerFilter, setPartnerFilter] = useState<string>('all')
  const [showSortFilter, setShowSortFilter] = useState(false)

  // CSVエクスポート進捗
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const exportAbortRef = useRef<AbortController | null>(null)

  // ページネーション（ボタン方式）
  const [displayCount, setDisplayCount] = useState(100)

  // 選択モード
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // 一括完了機能
  const [dateCutoff, setDateCutoff] = useState('2026-02-16')
  const [completing, setCompleting] = useState(false)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)

  // アクションシート（＋ボタン）
  const [showActionSheet, setShowActionSheet] = useState(false)
  const navigate = useNavigate()

  // race condition 防止用
  const loadIdRef = useRef(0)
  // タブごとのデータキャッシュ（タブ戻り時に瞬時表示）
  const dataCache = useRef<{ SCHEDULED?: TxWithProducts[]; COMPLETED?: TxWithProducts[] }>({})

  const load = useCallback(async (forceRefresh = false) => {
    const currentLoadId = ++loadIdRef.current
    const cacheKey = tab as 'SCHEDULED' | 'COMPLETED'

    // キャッシュヒット時は即座に表示（楽観的更新）
    if (!forceRefresh && dataCache.current[cacheKey]) {
      setTransactions(dataCache.current[cacheKey]!)
    }

    try {
      // Step 1: transactions全件取得（Supabaseデフォルト1000件制限をページングで回避）
      const PAGE_SIZE = 1000
      let allTxData: Transaction[] = []
      let from = 0

      while (true) {
        const { data, error: txError } = await supabase
          .from('transactions')
          .select('*')
          .eq('status', tab)
          .order('date', { ascending: false })
          .range(from, from + PAGE_SIZE - 1)

        if (txError) {
          console.error('transactions error:', txError.message || String(txError))
          if (currentLoadId === loadIdRef.current) setTransactions([])
          return
        }

        if (!data || data.length === 0) break
        allTxData = [...allTxData, ...data]
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }

      // 古いfetchが完了した場合は結果を捨てる
      if (currentLoadId !== loadIdRef.current) return

      if (allTxData.length === 0) {
        dataCache.current[cacheKey] = []
        setTransactions([])
        return
      }

      // Step 2: transaction_items取得（Promise.allで並列化）
      const txIds = allTxData.map((tx) => tx.id)
      let itemsData: { transaction_id: string; product_id: string }[] = []

      if (txIds.length > 0) {
        const BATCH_SIZE = 50
        const txBatches: string[][] = []
        for (let i = 0; i < txIds.length; i += BATCH_SIZE) {
          txBatches.push(txIds.slice(i, i + BATCH_SIZE))
        }

        // 全バッチを並列実行（直列25回→並列で大幅高速化）
        const itemsResults = await Promise.all(
          txBatches.map((batch) =>
            supabase
              .from('transaction_items')
              .select('transaction_id, product_id')
              .in('transaction_id', batch)
          )
        )

        if (currentLoadId !== loadIdRef.current) return // 中断チェック

        for (const result of itemsResults) {
          if (result.error) {
            console.error('items error:', result.error.message || String(result.error))
          } else if (result.data) {
            itemsData.push(...result.data)
          }
        }
      }

      if (currentLoadId !== loadIdRef.current) return // 中断チェック

      // Step 3: products取得（Promise.allで並列化）
      const productIds = [...new Set(itemsData.map((i) => i.product_id))]
      const productsMap = new Map<string, { name: string; image_url: string | null; product_code: string | null }>()

      if (productIds.length > 0) {
        const BATCH_SIZE = 50
        const pBatches: string[][] = []
        for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
          pBatches.push(productIds.slice(i, i + BATCH_SIZE))
        }

        // 全バッチを並列実行
        const productsResults = await Promise.all(
          pBatches.map((batch) =>
            supabase
              .from('products')
              .select('id, name, image_url, product_code')
              .in('id', batch)
          )
        )

        if (currentLoadId !== loadIdRef.current) return // 中断チェック

        for (const result of productsResults) {
          if (result.error) {
            console.error('products error:', result.error.message || String(result.error))
          } else if (result.data) {
            for (const p of result.data) {
              productsMap.set(p.id, { name: p.name, image_url: p.image_url ?? null, product_code: p.product_code ?? null })
            }
          }
        }
      }

      if (currentLoadId !== loadIdRef.current) return // 最終チェック

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

      const result = allTxData.map((tx) => {
        const productInfo = txProductMap.get(tx.id)
        return {
          ...tx,
          firstProductImage: productInfo?.image_url ?? null,
          firstProductName: productInfo?.name ?? null,
          firstProductCode: productInfo?.product_code ?? null,
          itemCount: productInfo?.count ?? 0,
        }
      })

      // キャッシュに保存してから表示
      dataCache.current[cacheKey] = result
      setTransactions(result)
    } catch (err) {
      console.error('load error:', err)
      if (currentLoadId === loadIdRef.current) setTransactions([])
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

  // フィルター・タブ変更時に表示件数をリセット
  useEffect(() => {
    setDisplayCount(100)
  }, [tab, search, typeFilter, categoryFilter, partnerFilter, sortKey, datePreset, customDateFrom, customDateTo])

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
        load(true)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'インポートに失敗しました'
        if (msg.includes('件の取引を登録しました')) {
          toast.warning(msg, { duration: 8000 })
          load(true)
        } else {
          toast.error(msg)
        }
      }
    }
    input.click()
  }

  // CSVエクスポート（全件・フィルタ対応）
  const handleExport = useCallback(async () => {
    if (exportProgress) return  // 二重実行防止

    const controller = new AbortController()
    exportAbortRef.current = controller

    try {
      await exportTransactionsDetailCsvWithFilters(
        {
          status: tab,
          type: typeFilter !== 'ALL' ? typeFilter : undefined,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          partnerName: partnerFilter !== 'all' ? partnerFilter : undefined,
          search: search || undefined,
        },
        (progress) => setExportProgress(progress),
        controller.signal,
      )
      setExportProgress(null)
      toast.success('CSVをエクスポートしました')
    } catch (err: unknown) {
      setExportProgress(null)
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.info('エクスポートをキャンセルしました')
      } else {
        const msg = err instanceof Error ? err.message : 'エクスポートに失敗しました'
        toast.error(msg)
      }
    } finally {
      exportAbortRef.current = null
    }
  }, [exportProgress, tab, typeFilter, categoryFilter, partnerFilter, search])

  const handleExportCancel = useCallback(() => {
    exportAbortRef.current?.abort()
  }, [])

  // 取引先一覧
  const partners = useMemo(() => {
    const set = new Set<string>()
    transactions.forEach((tx) => {
      if (tx.partner_name) set.add(tx.partner_name)
    })
    return Array.from(set).sort()
  }, [transactions])

  // アクティブな日付範囲を計算
  const activeDateRange = useMemo((): DateRange => {
    if (datePreset === 'custom') {
      return { from: customDateFrom || null, to: customDateTo || null }
    }
    return getDateRangeForPreset(datePreset)
  }, [datePreset, customDateFrom, customDateTo])

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

    // 3. カテゴリフィルター（入荷/出荷/移動/棚卸）
    if (categoryFilter !== 'all') {
      result = result.filter((tx) => tx.category === categoryFilter)
    }

    // 4. 取引先フィルター
    if (partnerFilter !== 'all') {
      result = result.filter((tx) => tx.partner_name === partnerFilter)
    }

    // 5. 日付フィルター
    if (activeDateRange.from || activeDateRange.to) {
      result = result.filter((tx) => {
        if (!tx.date) return true
        if (activeDateRange.from && tx.date < activeDateRange.from) return false
        if (activeDateRange.to && tx.date > activeDateRange.to) return false
        return true
      })
    }

    // 6. ソート（Safari互換性対応）
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
  }, [transactions, typeFilter, search, categoryFilter, partnerFilter, sortKey, activeDateRange])

  // ページネーション用スライス
  const displayedTransactions = filteredAndSorted.slice(0, displayCount)
  const hasMore = displayCount < filteredAndSorted.length

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
      // 両タブのキャッシュを無効化（移動後は両方変わるため）
      dataCache.current = {}
      load(true)
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
      // キャッシュを無効化してから再取得
      dataCache.current[tab as 'SCHEDULED' | 'COMPLETED'] = undefined
      load(true)
    } catch {
      toast.error('削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  const isAllSelected = filteredAndSorted.length > 0 && selectedIds.size === filteredAndSorted.length
  const hasActiveFilter = sortKey !== 'date_desc' || categoryFilter !== 'all' || partnerFilter !== 'all' || datePreset !== 'all'

  // 日付プリセットのラベル
  const datePresetLabel = datePreset === 'all' ? '全範囲' : datePresets.find(d => d.key === datePreset)?.label ?? '全範囲'

  return (
    <div className="page-transition space-y-4">
      {/* CSVエクスポート進捗バナー */}
      {exportProgress && exportProgress.phase !== 'done' && (
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-accent/50 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">
            {exportProgress.phase === 'counting' && '件数を確認中...'}
            {exportProgress.phase === 'fetching' && `取得中 ${exportProgress.fetched} / ${exportProgress.total} 件`}
            {exportProgress.phase === 'processing' && `CSV生成中 (${exportProgress.total} 件)`}
          </span>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleExportCancel}>
            キャンセル
          </Button>
        </div>
      )}

      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">作業</h1>
        <div className="flex gap-1.5">
          {!selectMode ? (
            <>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors" onClick={() => downloadTransactionsTemplate()} title="CSVテンプレート">
                <FileDown className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors" onClick={handleImport} title="CSVインポート">
                <Upload className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors"
                onClick={handleExport}
                disabled={!!exportProgress}
                title="CSVエクスポート（全件）"
              >
                {exportProgress && exportProgress.phase !== 'done'
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  : <ClipboardList className="h-4 w-4" />
                }
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

      {/* タブ（上部） */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full rounded-xl bg-slate-100 dark:bg-slate-800 p-1 h-12 gap-1">
          <TabsTrigger
            value="SCHEDULED"
            className="flex-1 rounded-lg h-10 text-sm font-bold transition-all
              data-[state=active]:bg-sky-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-sky-500/30
              data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-sky-500"
          >
            <CalendarCheck className="mr-1.5 h-4 w-4" />
            作業予定
          </TabsTrigger>
          <TabsTrigger
            value="COMPLETED"
            className="flex-1 rounded-lg h-10 text-sm font-bold transition-all
              data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-emerald-500/30
              data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-emerald-500"
          >
            <CheckCircle className="mr-1.5 h-4 w-4" />
            作業履歴
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          {/* 検索バー */}
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
            {/* カメラスキャンで検索 */}
            <BarcodeScanButton
              className="h-10 w-10 rounded-xl border-border/60 hover:bg-accent"
              onScan={(value) => {
                setSearch(value)
                toast.info(`スキャン: ${value}`)
              }}
            />
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

          {/* フィルターバー（カテゴリ + 日付） */}
          <div className="flex gap-2">
            {/* カテゴリ絞り込みドロップダウン */}
            <div className="relative flex-1">
              <button
                onClick={() => { setShowCategoryDropdown(!showCategoryDropdown); setShowDateFilter(false) }}
                className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-all ${
                  categoryFilter !== 'all'
                    ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300'
                    : 'border-border/60 bg-white dark:bg-white/5 text-foreground hover:bg-accent'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{categoryFilter === 'all' ? '全部' : categoryFilter}</span>
                </div>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showCategoryDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowCategoryDropdown(false)} />
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-xl border border-border/60 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
                    {categoryFilterOptions.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => { setCategoryFilter(opt.key); setShowCategoryDropdown(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-[13px] font-medium text-left transition-colors hover:bg-accent ${
                          categoryFilter === opt.key ? 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300' : ''
                        }`}
                      >
                        {opt.key !== 'all' && (
                          <span className={`h-2 w-2 rounded-full ${
                            opt.key === '入荷' ? 'bg-sky-400' :
                            opt.key === '出荷' ? 'bg-rose-400' :
                            opt.key === '移動' ? 'bg-violet-400' :
                            'bg-amber-400'
                          }`} />
                        )}
                        {opt.key === 'all' && <span className="h-2 w-2" />}
                        {opt.label}
                        {categoryFilter === opt.key && (
                          <span className="ml-auto text-sky-500">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 日付絞り込みボタン */}
            <div className="relative flex-1">
              <button
                onClick={() => { setShowDateFilter(!showDateFilter); setShowCategoryDropdown(false) }}
                className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-all ${
                  datePreset !== 'all'
                    ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300'
                    : 'border-border/60 bg-white dark:bg-white/5 text-foreground hover:bg-accent'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{datePresetLabel}</span>
                </div>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${showDateFilter ? 'rotate-180' : ''}`} />
              </button>
              {showDateFilter && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowDateFilter(false)} />
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-xl border border-border/60 bg-white dark:bg-slate-900 shadow-lg overflow-hidden min-w-[200px]">
                    {datePresets.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => {
                          setDatePreset(opt.key)
                          if (opt.key !== 'custom') setShowDateFilter(false)
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 text-[13px] font-medium text-left transition-colors hover:bg-accent ${
                          datePreset === opt.key ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300' : ''
                        }`}
                      >
                        {opt.label}
                        {datePreset === opt.key && (
                          <span className="text-violet-500">✓</span>
                        )}
                      </button>
                    ))}
                    {/* カスタム範囲入力 */}
                    {datePreset === 'custom' && (
                      <div className="border-t border-border/60 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground w-6">from</span>
                          <Input
                            type="date"
                            value={customDateFrom}
                            onChange={(e) => setCustomDateFrom(e.target.value)}
                            className="flex-1 h-8 text-[12px] rounded-lg border-border/60"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground w-6">to</span>
                          <Input
                            type="date"
                            value={customDateTo}
                            onChange={(e) => setCustomDateTo(e.target.value)}
                            className="flex-1 h-8 text-[12px] rounded-lg border-border/60"
                          />
                        </div>
                        <Button
                          size="sm"
                          className="w-full h-8 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-[12px]"
                          onClick={() => setShowDateFilter(false)}
                        >
                          適用
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
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
                <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 dark:bg-sky-950/30 px-2.5 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  <Filter className="h-3 w-3" />
                  {categoryFilter}
                  <button onClick={() => setCategoryFilter('all')} className="ml-0.5 hover:text-sky-800"><X className="h-3 w-3" /></button>
                </span>
              )}
              {partnerFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-teal-50 dark:bg-teal-950/30 px-2.5 py-1 text-[11px] font-semibold text-teal-600 dark:text-teal-400">
                  <Filter className="h-3 w-3" />
                  {partnerFilter}
                  <button onClick={() => setPartnerFilter('all')} className="ml-0.5 hover:text-teal-800"><X className="h-3 w-3" /></button>
                </span>
              )}
              {datePreset !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 dark:bg-violet-950/30 px-2.5 py-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                  <Calendar className="h-3 w-3" />
                  {datePresetLabel}
                  <button onClick={() => { setDatePreset('all'); setCustomDateFrom(''); setCustomDateTo('') }} className="ml-0.5 hover:text-violet-800"><X className="h-3 w-3" /></button>
                </span>
              )}
              <button
                onClick={() => { setSortKey('date_desc'); setCategoryFilter('all'); setPartnerFilter('all'); setDatePreset('all'); setCustomDateFrom(''); setCustomDateTo('') }}
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

          {/* リスト */}
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
            <>
              {displayedTransactions.map((tx) => {
                const isIN = tx.type === 'IN'
                return selectMode ? (
                  <Card
                    key={tx.id}
                    className={`border border-border/40 shadow-sm rounded-2xl transition-all duration-200 hover:shadow-md ${
                      selectedIds.has(tx.id) ? 'ring-2 ring-sky-400 dark:ring-sky-500 bg-sky-50/50 dark:bg-sky-950/20 border-sky-300' : 'bg-white dark:bg-white/[0.03]'
                    }`}
                    onClick={() => toggleSelect(tx.id)}
                  >
                    <CardContent className="p-4">
                      {/* ヘッダー行: チェック + アイコン + タイプ+日付 + 件数 */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="shrink-0">
                          {selectedIds.has(tx.id) ? (
                            <div className="flex h-5 w-5 items-center justify-center rounded bg-sky-500 text-white">
                              <CheckSquare className="h-3.5 w-3.5" />
                            </div>
                          ) : (
                            <div className="flex h-5 w-5 items-center justify-center rounded border-2 border-border/60">
                              <Square className="h-3.5 w-3.5 text-transparent" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 items-center justify-between min-w-0">
                          <div className="flex items-center gap-2">
                            {isIN ? (
                              <ArrowDownToLine className="h-5 w-5 shrink-0 text-sky-500" />
                            ) : (
                              <ArrowUpFromLine className="h-5 w-5 shrink-0 text-rose-500" />
                            )}
                            <span className={`text-sm font-bold ${
                              isIN ? 'text-sky-600 dark:text-sky-400' : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              {tab === 'SCHEDULED'
                                ? (isIN ? '入荷予定' : '出荷予定')
                                : (isIN ? '入荷' : '出荷')
                              }{' '}{tx.date}
                            </span>
                          </div>
                          {(tx.itemCount ?? 0) > 0 && (
                            <div className="flex flex-col items-end leading-none shrink-0 ml-2">
                              <span className={`text-sm font-bold ${isIN ? 'text-sky-500' : 'text-rose-500'}`}>+{tx.itemCount}</span>
                              <span className="text-[10px] text-muted-foreground">/1</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* メインコンテンツ: 画像 + テキスト */}
                      <div className="flex gap-3 pl-8">
                        {/* 商品画像サムネイル */}
                        {tx.firstProductImage ? (
                          <div className="shrink-0 h-[72px] w-[72px] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 border border-border/30">
                            <img src={tx.firstProductImage} alt={tx.firstProductName ?? ''} className="h-full w-full object-cover" />
                          </div>
                        ) : tx.firstProductName ? (
                          <div className="shrink-0 flex h-[72px] w-[72px] items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-border/30">
                            <Package className="h-6 w-6 text-slate-400" />
                          </div>
                        ) : null}

                        {/* テキスト情報 */}
                        <div className="flex-1 min-w-0">
                          {/* 管理番号: 商品名の上に目立つ表示 */}
                          {tx.tracking_number && (
                            <p className="font-mono text-sm font-bold text-violet-600 dark:text-violet-400 truncate mb-1">
                              {tx.tracking_number}
                            </p>
                          )}
                          {/* 商品名 */}
                          {tx.firstProductName && (
                            <p className="text-sm font-semibold leading-snug line-clamp-2 mb-1">{tx.firstProductName}</p>
                          )}
                          {/* 取引先 */}
                          {tx.partner_name && (
                            <p className="text-xs text-muted-foreground truncate">{tx.partner_name}</p>
                          )}
                          {/* 注文コード */}
                          {tx.order_code && (
                            <p className="font-mono text-[11px] text-muted-foreground/60 truncate mt-0.5">{tx.order_code}</p>
                          )}
                          {/* 注文日 */}
                          {tx.order_date && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">注文日: {tx.order_date.replace(/-/g, '/')}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Link key={tx.id} to={`/transactions/${tx.id}`}>
                    <Card className="border border-border/40 shadow-sm rounded-2xl transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 bg-white dark:bg-white/[0.03]">
                      <CardContent className="p-4">
                        {/* ヘッダー行: アイコン + タイプ+日付 + 件数バッジ */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {isIN ? (
                              <ArrowDownToLine className="h-5 w-5 shrink-0 text-sky-500" />
                            ) : (
                              <ArrowUpFromLine className="h-5 w-5 shrink-0 text-rose-500" />
                            )}
                            <span className={`text-sm font-bold ${
                              isIN ? 'text-sky-600 dark:text-sky-400' : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              {tab === 'SCHEDULED'
                                ? (isIN ? '入荷予定' : '出荷予定')
                                : (isIN ? '入荷' : '出荷')
                              }{' '}{tx.date}
                            </span>
                          </div>
                          {(tx.itemCount ?? 0) > 0 && (
                            <div className="flex flex-col items-end leading-none shrink-0 ml-2">
                              <span className={`text-sm font-bold ${isIN ? 'text-sky-500' : 'text-rose-500'}`}>
                                +{tx.itemCount}
                              </span>
                              <span className="text-[10px] text-muted-foreground">/1</span>
                            </div>
                          )}
                        </div>

                        {/* メインコンテンツ: 画像 + テキスト */}
                        <div className="flex gap-3">
                          {/* 商品画像サムネイル */}
                          {tx.firstProductImage ? (
                            <div className="shrink-0 h-[72px] w-[72px] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 border border-border/30">
                              <img src={tx.firstProductImage} alt={tx.firstProductName ?? ''} className="h-full w-full object-cover" />
                            </div>
                          ) : tx.firstProductName ? (
                            <div className="shrink-0 flex h-[72px] w-[72px] items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-border/30">
                              <Package className="h-6 w-6 text-slate-400" />
                            </div>
                          ) : null}

                          {/* テキスト情報 */}
                          <div className="flex-1 min-w-0">
                            {/* 管理番号: 商品名の上に目立つ表示 */}
                            {tx.tracking_number && (
                              <p className="font-mono text-sm font-bold text-violet-600 dark:text-violet-400 truncate mb-1">
                                {tx.tracking_number}
                              </p>
                            )}
                            {/* 商品名 */}
                            {tx.firstProductName && (
                              <p className="text-sm font-semibold leading-snug line-clamp-2 mb-1">
                                {tx.firstProductName}
                              </p>
                            )}
                            {/* 取引先 */}
                            {tx.partner_name && (
                              <p className="text-xs text-muted-foreground truncate">{tx.partner_name}</p>
                            )}
                            {/* 注文コード */}
                            {tx.order_code && (
                              <p className="font-mono text-[11px] text-muted-foreground/60 truncate mt-0.5">{tx.order_code}</p>
                            )}
                            {/* 注文日 */}
                            {tx.order_date && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">注文日: {tx.order_date.replace(/-/g, '/')}</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}

              {/* さらに読み込みボタン */}
              {hasMore && (
                <div className="py-4 flex flex-col items-center gap-1.5">
                  <button
                    onClick={() => setDisplayCount((prev) => prev + 100)}
                    className="rounded-xl bg-muted/70 px-6 py-2.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                  >
                    さらに100件表示
                  </button>
                  <span className="text-[10px] text-muted-foreground/60">
                    全{filteredAndSorted.length}件中{displayCount}件表示
                  </span>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* フローティング＋ボタン（選択モードでない時） */}
      {!selectMode && (
        <button
          className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-sky-500 text-white shadow-lg shadow-sky-500/30 transition-all hover:bg-sky-600 active:scale-95"
          onClick={() => setShowActionSheet(true)}
          aria-label="新規作業を追加"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

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

      {/* アクションシート（作業種別選択） */}
      {showActionSheet && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
            onClick={() => setShowActionSheet(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white dark:bg-slate-900 shadow-2xl">
            <div className="mx-auto max-w-lg">
              {/* ドラッグバー */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="px-4 pb-4 pt-1 space-y-1">
                {tab === 'COMPLETED' ? (
                  <>
                    <button
                      className="w-full flex items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100"
                      onClick={() => { navigate('/transactions/new?type=IN&category=入荷&status=COMPLETED'); setShowActionSheet(false) }}
                    >
                      <ArrowDownToLine className="h-5 w-5 text-sky-500 shrink-0" />
                      <span className="text-base font-medium">入荷</span>
                    </button>
                    <button
                      className="w-full flex items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100"
                      onClick={() => { navigate('/transactions/new?type=OUT&category=出荷&status=COMPLETED'); setShowActionSheet(false) }}
                    >
                      <ArrowUpFromLine className="h-5 w-5 text-rose-500 shrink-0" />
                      <span className="text-base font-medium">出荷</span>
                    </button>
                    <button
                      className="w-full flex items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100"
                      onClick={() => { navigate('/transactions/new?type=IN&category=棚卸&status=COMPLETED'); setShowActionSheet(false) }}
                    >
                      <CheckSquare className="h-5 w-5 text-amber-500 shrink-0" />
                      <span className="text-base font-medium">棚卸</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="w-full flex items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100"
                      onClick={() => { navigate('/transactions/new?type=IN&category=入荷&status=SCHEDULED'); setShowActionSheet(false) }}
                    >
                      <ArrowDownToLine className="h-5 w-5 text-sky-500 shrink-0" />
                      <span className="text-base font-medium">入荷予定</span>
                    </button>
                    <button
                      className="w-full flex items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100"
                      onClick={() => { navigate('/transactions/new?type=OUT&category=出荷&status=SCHEDULED'); setShowActionSheet(false) }}
                    >
                      <ArrowUpFromLine className="h-5 w-5 text-rose-500 shrink-0" />
                      <span className="text-base font-medium">出荷予定</span>
                    </button>
                    <button
                      className="w-full flex items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100"
                      onClick={() => { navigate('/transactions/new?type=IN&category=棚卸&status=SCHEDULED'); setShowActionSheet(false) }}
                    >
                      <CheckSquare className="h-5 w-5 text-amber-500 shrink-0" />
                      <span className="text-base font-medium">棚卸予定</span>
                    </button>
                  </>
                )}
              </div>
              <div className="h-[env(safe-area-inset-bottom)]" />
            </div>
          </div>
        </>
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

      {/* ソート・取引先フィルター ダイアログ */}
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
                onClick={() => { setSortKey('date_desc'); setPartnerFilter('all') }}
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
