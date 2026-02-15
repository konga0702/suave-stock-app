import { useEffect, useState, useCallback } from 'react'
import { Search, X, Package, ArrowUpFromLine, BoxSelect, Tag, Download, CheckSquare, Square, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { supabase } from '@/lib/supabase'
import { exportInventoryCsv } from '@/lib/csv'
import { toast } from 'sonner'
import type { InventoryItem } from '@/types/database'

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('IN_STOCK')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    let query = supabase
      .from('inventory_items')
      .select('*, product:products(name, image_url)')
      .order('created_at', { ascending: false })

    if (tab !== 'ALL') {
      query = query.eq('status', tab)
    }

    const { data } = await query
    if (data) {
      setItems(data.map((item) => ({
        ...item,
        product: item.product as InventoryItem['product'],
      })))
    }
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  // タブ変更時に選択モードをリセット
  useEffect(() => {
    setSelectMode(false)
    setSelected(new Set())
  }, [tab])

  const filtered = items.filter((item) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      item.product?.name?.toLowerCase().includes(q) ||
      item.tracking_number?.toLowerCase().includes(q) ||
      item.order_code?.toLowerCase().includes(q) ||
      item.shipping_code?.toLowerCase().includes(q) ||
      item.partner_name?.toLowerCase().includes(q) ||
      item.memo?.toLowerCase().includes(q)
    )
  })

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((i) => i.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    setDeleting(true)
    try {
      const ids = Array.from(selected)
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .in('id', ids)
      if (error) throw error
      toast.success(`${ids.length}件の個体データを削除しました`)
      setSelected(new Set())
      setSelectMode(false)
      load()
    } catch {
      toast.error('削除に失敗しました')
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  return (
    <div className="page-transition space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">個体追跡</h1>
        <div className="flex items-center gap-1.5">
          <Badge className={`rounded-xl px-3 py-1 font-semibold border-0 ${
            tab === 'IN_STOCK'
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300'
              : tab === 'SHIPPED'
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400'
                : 'bg-violet-100 text-violet-700 hover:bg-violet-100 dark:bg-violet-900 dark:text-violet-300'
          }`}>
            {filtered.length}件
          </Badge>
          {!selectMode ? (
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors"
                onClick={() => setSelectMode(true)}
                title="選択モード"
              >
                <CheckSquare className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors"
                onClick={() => exportInventoryCsv(filtered)}
                title="CSVエクスポート"
              >
                <Download className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-xs"
              onClick={exitSelectMode}
            >
              キャンセル
            </Button>
          )}
        </div>
      </div>

      {/* 選択モード: 全選択・削除バー */}
      {selectMode && (
        <div className="flex items-center justify-between rounded-2xl bg-slate-100 dark:bg-slate-800 p-3">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-sm font-medium"
          >
            {selected.size === filtered.length && filtered.length > 0 ? (
              <CheckSquare className="h-4 w-4 text-violet-500" />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground" />
            )}
            全選択 ({selected.size}/{filtered.length})
          </button>
          <Button
            variant="destructive"
            size="sm"
            className="rounded-xl text-xs gap-1.5"
            disabled={selected.size === 0}
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-3 w-3" />
            {selected.size}件を削除
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="管理番号・商品名・コードで検索"
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
        <BarcodeScanButton onScan={(barcode) => setSearch(barcode)} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full rounded-xl bg-muted/50 p-1">
          <TabsTrigger value="IN_STOCK" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-700 transition-all">
            <Package className="mr-1 h-3 w-3" />
            入荷済
          </TabsTrigger>
          <TabsTrigger value="SHIPPED" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-700 transition-all">
            <ArrowUpFromLine className="mr-1 h-3 w-3" />
            出荷済
          </TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center animate-fade-in">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <BoxSelect className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">
                {search
                  ? '検索結果がありません'
                  : tab === 'IN_STOCK'
                    ? '入荷済の個体はありません'
                    : '出荷済みの個体はありません'}
              </p>
            </div>
          ) : (
            filtered.map((item, index) => (
              <Card
                key={item.id}
                className={`border-0 shadow-sm shadow-slate-200/50 dark:shadow-none transition-all duration-200 hover:shadow-md ${
                  index % 2 === 1 ? 'bg-slate-50/50 dark:bg-white/[0.02]' : ''
                } ${selectMode && selected.has(item.id) ? 'ring-2 ring-violet-400 dark:ring-violet-500' : ''}`}
                onClick={selectMode ? () => toggleSelect(item.id) : undefined}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3.5">
                    {/* 選択モード: チェックボックス */}
                    {selectMode && (
                      <div className="mt-1 shrink-0">
                        {selected.has(item.id) ? (
                          <CheckSquare className="h-5 w-5 text-violet-500" />
                        ) : (
                          <Square className="h-5 w-5 text-muted-foreground/40" />
                        )}
                      </div>
                    )}
                    {item.product?.image_url ? (
                      <div className={`mt-0.5 h-11 w-11 shrink-0 overflow-hidden rounded border-2 ${
                        item.status === 'IN_STOCK' ? 'border-violet-200 dark:border-violet-800' : 'border-slate-200 dark:border-slate-700'
                      }`}>
                        <img src={item.product.image_url} alt={item.product.name} className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded ${
                        item.status === 'IN_STOCK' ? 'bg-violet-50 dark:bg-violet-950' : 'bg-slate-100 dark:bg-slate-800'
                      }`}>
                        {item.status === 'IN_STOCK' ? (
                          <Tag className="h-5 w-5 text-violet-500" />
                        ) : (
                          <ArrowUpFromLine className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-bold truncate">
                          {item.product?.name ?? '不明な商品'}
                        </p>
                        <Badge className={`shrink-0 text-[10px] px-2 py-0.5 rounded-md font-semibold border-0 ${
                          item.status === 'IN_STOCK'
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {item.status === 'IN_STOCK' ? '入荷済' : '出荷済'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-violet-500 truncate">
                        {item.tracking_number}
                      </p>
                      {(item.order_code || item.shipping_code) && (
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60 font-mono">
                          {item.order_code && <span>注文: {item.order_code}</span>}
                          {item.shipping_code && <span>追跡: {item.shipping_code}</span>}
                        </div>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="rounded-lg bg-muted px-2 py-0.5">入庫: {item.in_date}</span>
                        {item.out_date && <span className="rounded-lg bg-muted px-2 py-0.5">出荷: {item.out_date}</span>}
                        {item.partner_name && <span className="rounded-lg bg-muted px-2 py-0.5">{item.partner_name}</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>個体データを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              選択した{selected.size}件の個体追跡データを削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-rose-500 hover:bg-rose-600 rounded-xl"
              disabled={deleting}
            >
              {deleting ? '削除中...' : `${selected.size}件を削除`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
