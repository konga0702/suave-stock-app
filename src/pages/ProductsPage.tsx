import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Barcode, Upload, Download, Package, CheckSquare, Square, CheckCheck, Trash2, X, ArrowUpDown, ArrowDownWideNarrow, ArrowUpWideNarrow, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
import { BarcodeScanButton } from '@/components/BarcodeScanButton'
import { BarcodeDisplay } from '@/components/BarcodeDisplay'
import { supabase } from '@/lib/supabase'
import { exportProductsCsv, importProductsCsv } from '@/lib/csv'
import { toast } from 'sonner'
import type { Product } from '@/types/database'

type SortKey = 'name' | 'stock_desc' | 'stock_asc' | 'cost_desc' | 'cost_asc' | 'selling_desc' | 'selling_asc'
type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'name', label: '名前順' },
  { key: 'stock_desc', label: '在庫多い順' },
  { key: 'stock_asc', label: '在庫少ない順' },
  { key: 'cost_desc', label: '仕入価格高い順' },
  { key: 'cost_asc', label: '仕入価格安い順' },
  { key: 'selling_desc', label: '販売価格高い順' },
  { key: 'selling_asc', label: '販売価格安い順' },
]

const stockFilterOptions: { key: StockFilter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'in_stock', label: '在庫あり' },
  { key: 'low_stock', label: '在庫少（5以下）' },
  { key: 'out_of_stock', label: '在庫切れ' },
]

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [supplierFilter, setSupplierFilter] = useState<string>('all')
  const [showSortFilter, setShowSortFilter] = useState(false)

  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('name')
    if (data) setProducts(data)
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // 仕入れ先一覧を取得
  const suppliers = useMemo(() => {
    const set = new Set<string>()
    products.forEach((p) => {
      if (p.supplier) set.add(p.supplier)
    })
    return Array.from(set).sort()
  }, [products])

  // フィルター → ソート
  const filteredAndSorted = useMemo(() => {
    // 1. テキスト検索
    let result = products.filter((p) => {
      const q = search.toLowerCase()
      return (
        p.name.toLowerCase().includes(q) ||
        (p.internal_barcode && p.internal_barcode.toLowerCase().includes(q)) ||
        (p.product_code && p.product_code.toLowerCase().includes(q)) ||
        (p.supplier && p.supplier.toLowerCase().includes(q))
      )
    })

    // 2. 在庫フィルター
    if (stockFilter === 'in_stock') {
      result = result.filter((p) => p.current_stock > 0)
    } else if (stockFilter === 'low_stock') {
      result = result.filter((p) => p.current_stock > 0 && p.current_stock <= 5)
    } else if (stockFilter === 'out_of_stock') {
      result = result.filter((p) => p.current_stock === 0)
    }

    // 3. 仕入れ先フィルター
    if (supplierFilter !== 'all') {
      result = result.filter((p) => p.supplier === supplierFilter)
    }

    // 4. ソート
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name, 'ja')
        case 'stock_desc':
          return b.current_stock - a.current_stock
        case 'stock_asc':
          return a.current_stock - b.current_stock
        case 'cost_desc':
          return Number(b.cost_price ?? b.default_unit_price ?? 0) - Number(a.cost_price ?? a.default_unit_price ?? 0)
        case 'cost_asc':
          return Number(a.cost_price ?? a.default_unit_price ?? 0) - Number(b.cost_price ?? b.default_unit_price ?? 0)
        case 'selling_desc':
          return Number(b.selling_price ?? 0) - Number(a.selling_price ?? 0)
        case 'selling_asc':
          return Number(a.selling_price ?? 0) - Number(b.selling_price ?? 0)
        default:
          return 0
      }
    })

    return result
  }, [products, search, stockFilter, supplierFilter, sortKey])

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const count = await importProductsCsv(text)
        toast.success(`${count}件の商品をインポートしました`)
        loadProducts()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'インポートに失敗しました'
        toast.error(msg)
      }
    }
    input.click()
  }

  const getStockColor = (stock: number) => {
    if (stock === 0) return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
    if (stock <= 5) return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
  }

  // 選択モード切り替え
  const toggleSelectMode = () => {
    if (selectMode) {
      setSelectMode(false)
      setSelectedIds(new Set())
    } else {
      setSelectMode(true)
    }
  }

  // 個別の選択/解除
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

  // 全選択/全解除
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAndSorted.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredAndSorted.map((p) => p.id)))
    }
  }

  // 一括削除
  const handleBulkDelete = async () => {
    setDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      let deletedCount = 0

      for (const id of ids) {
        const product = products.find((p) => p.id === id)
        if (product?.image_url) {
          try {
            const path = product.image_url.split('/product-images/')[1]
            if (path) {
              await supabase.storage.from('product-images').remove([path])
            }
          } catch {
            // 無視
          }
        }
        await supabase.from('inventory_items').delete().eq('product_id', id)
        await supabase.from('transaction_items').delete().eq('product_id', id)
        const { error } = await supabase.from('products').delete().eq('id', id)
        if (!error) deletedCount++
      }

      const { data: allTxs } = await supabase.from('transactions').select('id')
      if (allTxs) {
        for (const tx of allTxs) {
          const { count } = await supabase
            .from('transaction_items')
            .select('id', { count: 'exact', head: true })
            .eq('transaction_id', tx.id)
          if (count === 0) {
            await supabase.from('transactions').delete().eq('id', tx.id)
          }
        }
      }

      toast.success(`${deletedCount}件の商品を削除しました`)
      setSelectedIds(new Set())
      setSelectMode(false)
      setShowDeleteConfirm(false)
      loadProducts()
    } catch {
      toast.error('削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  const isAllSelected = filteredAndSorted.length > 0 && selectedIds.size === filteredAndSorted.length
  const hasActiveFilter = stockFilter !== 'all' || supplierFilter !== 'all' || sortKey !== 'name'

  return (
    <div className="page-transition space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">商品一覧</h1>
        <div className="flex gap-1.5">
          {!selectMode ? (
            <>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors" onClick={handleImport} title="CSVインポート">
                <Upload className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors" onClick={() => exportProductsCsv(products)} title="CSVエクスポート">
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
                <Link to="/products/new">
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
            placeholder="商品名・コード・バーコード・仕入れ先"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputMode="text"
            enterKeyHint="done"
            className="rounded-xl pl-9 bg-white dark:bg-white/5 border-border/60 focus:border-slate-400 transition-colors"
          />
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
        <BarcodeScanButton onScan={(barcode) => setSearch(barcode)} />
      </div>

      {/* アクティブなフィルター表示 */}
      {hasActiveFilter && (
        <div className="flex flex-wrap gap-1.5">
          {sortKey !== 'name' && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 dark:bg-sky-950/30 px-2.5 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
              <ArrowUpDown className="h-3 w-3" />
              {sortOptions.find((s) => s.key === sortKey)?.label}
              <button onClick={() => setSortKey('name')} className="ml-0.5 hover:text-sky-800"><X className="h-3 w-3" /></button>
            </span>
          )}
          {stockFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              <Filter className="h-3 w-3" />
              {stockFilterOptions.find((s) => s.key === stockFilter)?.label}
              <button onClick={() => setStockFilter('all')} className="ml-0.5 hover:text-amber-800"><X className="h-3 w-3" /></button>
            </span>
          )}
          {supplierFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-teal-50 dark:bg-teal-950/30 px-2.5 py-1 text-[11px] font-semibold text-teal-600 dark:text-teal-400">
              <Filter className="h-3 w-3" />
              {supplierFilter}
              <button onClick={() => setSupplierFilter('all')} className="ml-0.5 hover:text-teal-800"><X className="h-3 w-3" /></button>
            </span>
          )}
          <button
            onClick={() => { setSortKey('name'); setStockFilter('all'); setSupplierFilter('all') }}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            すべてクリア
          </button>
        </div>
      )}

      {/* 件数表示 */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {filteredAndSorted.length === products.length
            ? `${products.length}件`
            : `${filteredAndSorted.length} / ${products.length}件`}
        </p>
      </div>

      {/* 商品リスト */}
      <div className="space-y-2">
        {filteredAndSorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center animate-fade-in">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Package className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">
              商品が見つかりません
            </p>
          </div>
        ) : (
          filteredAndSorted.map((product, index) => (
            <Card
              key={product.id}
              className={`border-0 shadow-sm shadow-slate-200/50 dark:shadow-none transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
                index % 2 === 1 ? 'bg-slate-50/50 dark:bg-white/[0.02]' : ''
              } ${selectMode && selectedIds.has(product.id) ? 'ring-2 ring-sky-400 dark:ring-sky-500 bg-sky-50/50 dark:bg-sky-950/20' : ''}`}
              onClick={selectMode ? () => toggleSelect(product.id) : undefined}
            >
              <CardContent className="flex items-center gap-3.5 p-4">
                {selectMode && (
                  <div className="shrink-0">
                    {selectedIds.has(product.id) ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-500 text-white">
                        <CheckSquare className="h-4 w-4" />
                      </div>
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-border/60">
                        <Square className="h-4 w-4 text-transparent" />
                      </div>
                    )}
                  </div>
                )}
                {product.image_url ? (
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-slate-100 dark:bg-slate-800">
                    <Package className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {selectMode ? (
                    <p className="text-[13px] font-semibold truncate">{product.name}</p>
                  ) : (
                    <Link
                      to={`/products/${product.id}/edit`}
                      className="block text-[13px] font-semibold hover:text-slate-600 dark:hover:text-slate-300 truncate transition-colors"
                    >
                      {product.name}
                    </Link>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    {product.product_code && (
                      <span className="font-mono text-[11px] text-muted-foreground/70">{product.product_code}</span>
                    )}
                    {product.internal_barcode && (
                      <span className="font-mono text-[11px] text-muted-foreground/70">{product.internal_barcode}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                    <span className="text-rose-500 dark:text-rose-400 font-semibold num-display">仕¥{Number(product.cost_price ?? product.default_unit_price ?? 0).toLocaleString()}</span>
                    <span className="text-amber-600 dark:text-amber-400 font-semibold num-display">売¥{Number(product.selling_price ?? 0).toLocaleString()}</span>
                  </div>
                </div>
                {!selectMode && (
                  <div className="flex items-center gap-2">
                    <div className={`rounded-xl px-3 py-1.5 text-center ${getStockColor(product.current_stock)}`}>
                      <div className="text-base font-bold leading-tight num-display">
                        {product.current_stock}
                      </div>
                      <div className="text-[9px] font-medium leading-tight opacity-70">在庫</div>
                    </div>
                    {product.internal_barcode && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground/50 hover:text-slate-600 transition-colors"
                        onClick={() => setBarcodeProduct(product)}
                      >
                        <Barcode className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 選択モード時のフローティング削除バー */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-50 animate-fade-in">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-800 dark:bg-slate-200 p-4 shadow-xl shadow-slate-900/30">
            <p className="text-sm font-semibold text-white dark:text-slate-900">
              {selectedIds.size}件選択中
            </p>
            <Button
              className="rounded-xl bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/25 transition-all text-xs font-semibold"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              まとめて削除
            </Button>
          </div>
        </div>
      )}

      {/* 一括削除確認ダイアログ */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedIds.size}件の商品を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。選択した商品と関連する入出庫データ・在庫データも全て削除されます。
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

            {/* 在庫フィルター */}
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                在庫で絞り込み
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {stockFilterOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setStockFilter(opt.key)}
                    className={`rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all ${
                      stockFilter === opt.key
                        ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/25'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 仕入れ先フィルター */}
            {suppliers.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" />
                  仕入れ先で絞り込み
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSupplierFilter('all')}
                    className={`rounded-xl px-3 py-2 text-[12px] font-semibold transition-all ${
                      supplierFilter === 'all'
                        ? 'bg-teal-500 text-white shadow-sm shadow-teal-500/25'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    すべて
                  </button>
                  {suppliers.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSupplierFilter(s)}
                      className={`rounded-xl px-3 py-2 text-[12px] font-semibold transition-all ${
                        supplierFilter === s
                          ? 'bg-teal-500 text-white shadow-sm shadow-teal-500/25'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {s}
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
                onClick={() => { setSortKey('name'); setStockFilter('all'); setSupplierFilter('all') }}
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

      {/* バーコード表示ダイアログ */}
      <Dialog open={!!barcodeProduct} onOpenChange={() => setBarcodeProduct(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{barcodeProduct?.name}</DialogTitle>
          </DialogHeader>
          {barcodeProduct?.internal_barcode && (
            <BarcodeDisplay
              value={barcodeProduct.internal_barcode}
              label="管理バーコード"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
