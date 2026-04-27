import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Package, ArrowDownToLine, ArrowUpFromLine, ChevronRight, Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Product, InventoryItem } from '@/types/database'

interface TxEntry {
  txId: string
  date: string
  quantity: number
  price: number
  partner_name: string | null
  tracking_number: string | null
  order_code: string | null
  shipping_code: string | null
  category: string | null
}

interface ManagementCodeRow {
  code: string
  expectedQty: number
  actualQty: number
  delta: number
}

interface CodeTransactionLinks {
  inTxId: string | null
  outTxId: string | null
}

export function InventoryDetailPage() {
  const navigate = useNavigate()
  const { productId } = useParams<{ productId: string }>()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<string>(() => {
    const t = searchParams.get('tab')
    return t === 'net' || t === 'out' ? t : 'in'
  })
  const [product, setProduct] = useState<Product | null>(null)
  const [inEntries, setInEntries] = useState<TxEntry[]>([])
  const [outEntries, setOutEntries] = useState<TxEntry[]>([])
  const [unitItems, setUnitItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncingCode, setSyncingCode] = useState<string | null>(null)
  const [resolvingCode, setResolvingCode] = useState<string | null>(null)

  const loadDetail = useCallback(async () => {
    if (!productId) return

    // 商品情報
    const { data: prod } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single()
    if (prod) setProduct(prod)

    // 入荷・出荷履歴・在庫個体を並列取得
    const [{ data: inData }, { data: outData }, { data: unitData }] = await Promise.all([
      supabase
        .from('transaction_items')
        .select('quantity, price, transaction:transactions!inner(id, date, type, status, partner_name, tracking_number, order_code, shipping_code, category)')
        .eq('product_id', productId)
        .eq('transaction.type' as string, 'IN')
        .eq('transaction.status' as string, 'COMPLETED'),
      supabase
        .from('transaction_items')
        .select('quantity, price, transaction:transactions!inner(id, date, type, status, partner_name, tracking_number, order_code, shipping_code, category)')
        .eq('product_id', productId)
        .eq('transaction.type' as string, 'OUT')
        .eq('transaction.status' as string, 'COMPLETED'),
      supabase
        .from('inventory_items')
        .select('*')
        .eq('product_id', productId)
        .eq('status', 'IN_STOCK')
        .order('in_date', { ascending: false }),
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
        shipping_code:   tx?.shipping_code ?? null,
        category:        tx?.category ?? null,
      }
    }

    const sorted = (arr: TxEntry[]) =>
      [...arr].sort((a, b) => b.date.localeCompare(a.date))

    setInEntries(sorted((inData ?? []).map(mapEntry)))
    setOutEntries(sorted((outData ?? []).map(mapEntry)))
    setUnitItems((unitData ?? []) as InventoryItem[])
    setLoading(false)
  }, [productId])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const totalIn  = inEntries.reduce((s, e) => s + e.quantity, 0)
  const totalOut = outEntries.reduce((s, e) => s + e.quantity, 0)
  const ledgerNetStock = totalIn - totalOut

  const getEntryManagementCode = (entry: TxEntry): string =>
    entry.tracking_number?.trim()
    || entry.order_code?.trim()
    || entry.shipping_code?.trim()
    || '（管理番号未設定）'

  const getUnitManagementCode = (unit: InventoryItem): string =>
    unit.tracking_number?.trim()
    || unit.order_code?.trim()
    || unit.shipping_code?.trim()
    || '（管理番号未設定）'

  const expectedMap = new Map<string, number>()
  for (const entry of inEntries) {
    const code = getEntryManagementCode(entry)
    expectedMap.set(code, (expectedMap.get(code) ?? 0) + entry.quantity)
  }
  for (const entry of outEntries) {
    const code = getEntryManagementCode(entry)
    expectedMap.set(code, (expectedMap.get(code) ?? 0) - entry.quantity)
  }

  const actualMap = new Map<string, number>()
  for (const unit of unitItems) {
    const code = getUnitManagementCode(unit)
    actualMap.set(code, (actualMap.get(code) ?? 0) + 1)
  }

  const ledgerRows = [...expectedMap.entries()]
    .filter(([, qty]) => qty > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  const mismatchRows: ManagementCodeRow[] = [...new Set([...expectedMap.keys(), ...actualMap.keys()])]
    .map((code) => {
      const expectedQty = expectedMap.get(code) ?? 0
      const actualQty = actualMap.get(code) ?? 0
      return {
        code,
        expectedQty,
        actualQty,
        delta: actualQty - expectedQty,
      }
    })
    .filter((row) => row.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.code.localeCompare(b.code))

  const hasMismatch = mismatchRows.length > 0

  const codeTxMap = new Map<string, CodeTransactionLinks>()
  const ensureCodeTx = (code: string): CodeTransactionLinks => {
    const existing = codeTxMap.get(code)
    if (existing) return existing
    const created: CodeTransactionLinks = { inTxId: null, outTxId: null }
    codeTxMap.set(code, created)
    return created
  }

  for (const entry of inEntries) {
    const code = getEntryManagementCode(entry)
    const links = ensureCodeTx(code)
    if (!links.inTxId && entry.txId) links.inTxId = entry.txId
  }
  for (const entry of outEntries) {
    const code = getEntryManagementCode(entry)
    const links = ensureCodeTx(code)
    if (!links.outTxId && entry.txId) links.outTxId = entry.txId
  }
  for (const unit of unitItems) {
    const code = getUnitManagementCode(unit)
    const links = ensureCodeTx(code)
    if (!links.inTxId && unit.in_transaction_id) links.inTxId = unit.in_transaction_id
    if (!links.outTxId && unit.out_transaction_id) links.outTxId = unit.out_transaction_id
  }

  const getCodeLinks = (code: string): CodeTransactionLinks => codeTxMap.get(code) ?? { inTxId: null, outTxId: null }

  const buildAdjustmentOutLink = (row: ManagementCodeRow): string => {
    const params = new URLSearchParams({
      type: 'OUT',
      status: 'COMPLETED',
      category: '廃棄',
      adjust_mode: 'ledger_only',
      product_id: productId ?? '',
      quantity: String(Math.max(1, Math.abs(row.delta))),
    })
    if (row.code !== '（管理番号未設定）') {
      params.set('tracking_number', row.code)
    }
    return `/transactions/new?${params.toString()}`
  }

  const buildAdjustmentInLink = (row: ManagementCodeRow): string => {
    const params = new URLSearchParams({
      type: 'IN',
      status: 'COMPLETED',
      category: '棚卸',
      adjust_mode: 'ledger_only',
      product_id: productId ?? '',
      quantity: String(Math.max(1, Math.abs(row.delta))),
    })
    if (row.code !== '（管理番号未設定）') {
      params.set('tracking_number', row.code)
    }
    return `/transactions/new?${params.toString()}`
  }

  const handleSyncShippedByCode = async (row: ManagementCodeRow) => {
    if (!productId) return
    if (row.delta <= 0) return

    const links = getCodeLinks(row.code)
    if (!links.outTxId) {
      toast.error('対応する出庫取引が見つからないため同期できません')
      return
    }

    const ok = window.confirm(
      `管理番号「${row.code}」の実在庫 ${row.delta} 件を出庫済みに同期します。よろしいですか？`
    )
    if (!ok) return

    setSyncingCode(row.code)
    try {
      const targetUnits = unitItems
        .filter((unit) => getUnitManagementCode(unit) === row.code)
        .slice(0, row.delta)

      if (targetUnits.length === 0) {
        toast.error('同期対象の実在庫が見つかりませんでした')
        return
      }

      const today = new Date().toISOString().slice(0, 10)
      const { error: updateErr } = await supabase
        .from('inventory_items')
        .update({
          status: 'SHIPPED',
          out_transaction_id: links.outTxId,
          out_date: today,
        })
        .in('id', targetUnits.map((u) => u.id))

      if (updateErr) throw updateErr

      toast.success(`${targetUnits.length}件を出庫済みに同期しました`)
      await loadDetail()
    } catch (error) {
      console.error('[InventoryDetail] 同期エラー:', error)
      toast.error('同期に失敗しました')
    } finally {
      setSyncingCode(null)
    }
  }

  const handleAddActualStockByCode = async (row: ManagementCodeRow) => {
    if (!productId) return
    if (row.delta >= 0) return
    const qty = Math.abs(row.delta)

    const ok = window.confirm(
      `管理番号「${row.code}」の実在庫を ${qty} 件追加して不整合を解消します。よろしいですか？`
    )
    if (!ok) return

    const links = getCodeLinks(row.code)
    setResolvingCode(row.code)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const rows = Array.from({ length: qty }).map((_, idx) => ({
        product_id: productId,
        tracking_number:
          row.code !== '（管理番号未設定）' ? row.code : `ADJ-${today}-${idx + 1}`,
        order_code: null as string | null,
        shipping_code: null as string | null,
        status: 'IN_STOCK' as const,
        in_transaction_id: links.inTxId,
        in_date: today,
        partner_name: null as string | null,
      }))

      const { error } = await supabase.from('inventory_items').insert(rows)
      if (error) throw error

      toast.success(`実在庫を ${qty} 件追加しました`)
      await loadDetail()
    } catch (error) {
      console.error('[InventoryDetail] 実在庫追加エラー:', error)
      toast.error('実在庫の追加に失敗しました')
    } finally {
      setResolvingCode(null)
    }
  }

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
        <Card
          className={`border-0 shadow-sm shadow-slate-200/50 dark:shadow-none cursor-pointer transition-all hover:ring-2 hover:ring-emerald-300 ${
            ledgerNetStock > 0 ? 'bg-emerald-50/60 dark:bg-emerald-950/30' :
            ledgerNetStock < 0 ? 'bg-rose-50/60 dark:bg-rose-950/30' : ''
          }`}
          onClick={() => setActiveTab('net')}
        >
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Package className="h-3 w-3 text-emerald-500" />
              <p className="text-[10px] font-medium text-muted-foreground">純在庫</p>
            </div>
            <p className={`text-xl font-bold num-display ${
              ledgerNetStock > 0 ? 'text-emerald-600 dark:text-emerald-400' :
              ledgerNetStock < 0 ? 'text-rose-600 dark:text-rose-400' :
              'text-slate-500'
            }`}>{ledgerNetStock}</p>
          </CardContent>
        </Card>
      </div>

      {/* 入荷・出荷・在庫個体 タブ */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
          <TabsTrigger
            value="net"
            className="flex-1 rounded-lg text-xs font-bold transition-all
              data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-emerald-500/30
              data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-emerald-500"
          >
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            純在庫 ({ledgerNetStock})
          </TabsTrigger>
        </TabsList>

        {/* 入荷・出荷タブ */}
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

        {/* 純在庫（残在庫内訳）タブ */}
        <TabsContent value="net" className="mt-3 space-y-2">
          <Card className="border border-border/50 shadow-sm rounded-2xl">
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[11px] text-muted-foreground">帳簿純在庫</p>
                  <p className="text-base font-bold num-display text-emerald-600 dark:text-emerald-400">{ledgerNetStock}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">実在庫</p>
                  <p className="text-base font-bold num-display text-sky-600 dark:text-sky-400">{unitItems.length}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">不整合件数</p>
                  <p className={`text-base font-bold num-display ${hasMismatch ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {mismatchRows.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">帳簿上の純在庫（管理番号差分）</p>
            {ledgerRows.length === 0 ? (
              <Card className="border border-dashed rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">管理番号差分で残っている純在庫はありません</p>
                </CardContent>
              </Card>
            ) : (
              ledgerRows.map(([code, qty]) => (
                <Card
                  key={`ledger-${code}`}
                  className="border border-emerald-200/70 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm rounded-2xl"
                >
                  <CardContent className="p-4">
                    {(() => {
                      const links = getCodeLinks(code)
                      return (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="font-mono text-sm font-bold text-violet-600 dark:text-violet-400 truncate">{code}</p>
                        <div className="flex items-center gap-2">
                          {links.inTxId && (
                            <Link
                              to={`/transactions/${links.inTxId}`}
                              className="shrink-0 flex items-center gap-1 rounded-lg bg-white dark:bg-white/10 border border-border/40 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                            >
                              入庫取引
                              <ChevronRight className="h-3 w-3" />
                            </Link>
                          )}
                          {links.outTxId && (
                            <Link
                              to={`/transactions/${links.outTxId}`}
                              className="shrink-0 flex items-center gap-1 rounded-lg bg-white dark:bg-white/10 border border-border/40 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                            >
                              出庫取引
                              <ChevronRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl px-3 py-2 text-center min-w-[58px] bg-emerald-100/70 dark:bg-emerald-900/50">
                        <p className="text-[9px] font-medium text-muted-foreground/60 mb-0.5">帳簿</p>
                        <p className="text-base font-bold num-display text-emerald-600 dark:text-emerald-400">{qty}</p>
                      </div>
                    </div>
                      )
                    })()}
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {hasMismatch && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">不整合（帳簿と実在庫の差分）</p>
              {mismatchRows.map((row) => (
                <Card
                  key={`mismatch-${row.code}`}
                  className="border border-rose-200/80 dark:border-rose-800/50 bg-rose-50/50 dark:bg-rose-950/20 shadow-sm rounded-2xl"
                >
                  <CardContent className="p-4">
                    {(() => {
                      const links = getCodeLinks(row.code)
                      return (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="font-mono text-sm font-bold text-violet-600 dark:text-violet-400 truncate">{row.code}</p>
                        <div className="flex items-center gap-2">
                          {links.inTxId && (
                            <Link
                              to={`/transactions/${links.inTxId}`}
                              className="shrink-0 flex items-center gap-1 rounded-lg bg-white dark:bg-white/10 border border-border/40 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                            >
                              入庫取引
                              <ChevronRight className="h-3 w-3" />
                            </Link>
                          )}
                          {links.outTxId && (
                            <Link
                              to={`/transactions/${links.outTxId}`}
                              className="shrink-0 flex items-center gap-1 rounded-lg bg-white dark:bg-white/10 border border-border/40 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                            >
                              出庫取引
                              <ChevronRight className="h-3 w-3" />
                            </Link>
                          )}
                          {row.delta > 0 ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-lg px-2.5 text-[11px]"
                                onClick={() => handleSyncShippedByCode(row)}
                                disabled={syncingCode === row.code}
                              >
                                {syncingCode === row.code ? '同期中...' : '実物なし→出庫済みに同期'}
                              </Button>
                              <Link
                                to={buildAdjustmentInLink(row)}
                                className="shrink-0 flex items-center gap-1 rounded-lg bg-white dark:bg-white/10 border border-border/40 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                              >
                                実物あり→帳簿調整入庫
                                <ChevronRight className="h-3 w-3" />
                              </Link>
                            </>
                          ) : (
                            <>
                              <Link
                                to={buildAdjustmentOutLink(row)}
                                className="shrink-0 flex items-center gap-1 rounded-lg bg-white dark:bg-white/10 border border-border/40 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                              >
                                実物なし→調整出庫
                                <ChevronRight className="h-3 w-3" />
                              </Link>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-lg px-2.5 text-[11px]"
                                onClick={() => handleAddActualStockByCode(row)}
                                disabled={resolvingCode === row.code}
                              >
                                {resolvingCode === row.code ? '追加中...' : '実物あり→実在庫を追加'}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <p className="text-muted-foreground">帳簿 {row.expectedQty} / 実在庫 {row.actualQty}</p>
                        <p className={`font-bold num-display ${row.delta > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {row.delta > 0 ? `実在庫 +${row.delta}` : `実在庫 ${row.delta}`}
                        </p>
                      </div>
                    </div>
                      )
                    })()}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {unitItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center animate-fade-in">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Layers className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">純在庫（未出庫）の管理番号はありません</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">実在庫の管理番号（個体テーブル）</p>
              {unitItems.map((unit) => (
              <Card
                key={unit.id}
                className="border border-emerald-200/70 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm rounded-2xl"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          {unit.in_date}
                        </span>
                        {unit.partner_name && (
                          <span className="text-xs text-muted-foreground truncate">· {unit.partner_name}</span>
                        )}
                      </div>
                      {unit.tracking_number && (
                        <p className="font-mono text-sm font-bold text-violet-600 dark:text-violet-400 truncate">
                          {unit.tracking_number}
                        </p>
                      )}
                      {unit.order_code && (
                        <p className="font-mono text-[11px] text-muted-foreground/60 truncate">{unit.order_code}</p>
                      )}
                    </div>
                    {unit.in_transaction_id && (
                      <Link
                        to={`/transactions/${unit.in_transaction_id}`}
                        className="shrink-0 flex items-center gap-1 rounded-lg bg-white dark:bg-white/10 border border-border/40 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        入庫取引
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
