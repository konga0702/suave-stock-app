import { useEffect, useState, useCallback } from 'react'
import { Search, Package, ArrowUpFromLine, BoxSelect } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarcodeScanButton } from '@/components/BarcodeScanButton'
import { supabase } from '@/lib/supabase'
import type { InventoryItem } from '@/types/database'

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'IN_STOCK' | 'SHIPPED'>('IN_STOCK')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('inventory_items')
      .select('*, product:products(name, internal_barcode)')
      .eq('status', tab)
      .order('created_at', { ascending: false })
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

  const filtered = items.filter((item) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      item.tracking_number?.toLowerCase().includes(q) ||
      item.internal_id?.toLowerCase().includes(q) ||
      item.shipping_tracking_id?.toLowerCase().includes(q) ||
      item.order_id?.toLowerCase().includes(q) ||
      item.product?.name?.toLowerCase().includes(q) ||
      item.partner_name?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="page-transition space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">個体追跡</h1>
        <Badge className={`rounded-xl px-3 py-1 font-semibold border-0 ${
          tab === 'IN_STOCK'
            ? 'bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-900 dark:text-sky-300'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400'
        }`}>
          {tab === 'IN_STOCK' ? `在庫: ${filtered.length}件` : `出荷済: ${filtered.length}件`}
        </Badge>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="管理番号 or 商品名で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl pl-9 bg-white dark:bg-white/5 border-border/60"
          />
        </div>
        <BarcodeScanButton onScan={(barcode) => setSearch(barcode)} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'IN_STOCK' | 'SHIPPED')}>
        <TabsList className="w-full rounded-xl bg-muted/50 p-1">
          <TabsTrigger value="IN_STOCK" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-700 transition-all">
            <Package className="mr-1 h-3 w-3" />
            未出荷
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
                {tab === 'IN_STOCK'
                  ? '未出荷の個体はありません'
                  : '出荷済みの個体はありません'}
              </p>
            </div>
          ) : (
            filtered.map((item, index) => (
              <Card key={item.id} className={`border-0 shadow-sm shadow-slate-200/50 dark:shadow-none transition-all duration-200 hover:shadow-md ${
                index % 2 === 1 ? 'bg-slate-50/50 dark:bg-white/[0.02]' : ''
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                      item.status === 'IN_STOCK' ? 'bg-sky-50 dark:bg-sky-950' : 'bg-slate-100 dark:bg-slate-800'
                    }`}>
                      {item.status === 'IN_STOCK' ? (
                        <Package className="h-4 w-4 text-sky-500" />
                      ) : (
                        <ArrowUpFromLine className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold truncate">
                          {item.product?.name ?? '不明な商品'}
                        </p>
                        <Badge className={`shrink-0 text-[10px] px-2 py-0.5 rounded-md font-semibold border-0 ${
                          item.status === 'IN_STOCK'
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {item.status === 'IN_STOCK' ? '在庫中' : '出荷済'}
                        </Badge>
                      </div>
                      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        {item.internal_id && (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block w-12 text-[10px] text-violet-500 font-medium">店舗管理</span>
                            <span className="font-mono text-[11px]">{item.internal_id}</span>
                          </div>
                        )}
                        {item.shipping_tracking_id && (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block w-12 text-[10px] text-sky-500 font-medium">配送追跡</span>
                            <span className="font-mono text-[11px]">{item.shipping_tracking_id}</span>
                          </div>
                        )}
                        {item.order_id && (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block w-12 text-[10px] text-pink-500 font-medium">注文ID</span>
                            <span className="font-mono text-[11px]">{item.order_id}</span>
                          </div>
                        )}
                        {!item.internal_id && item.tracking_number && (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block w-12 text-[10px] text-slate-500 font-medium">管理番号</span>
                            <span className="font-mono text-[11px]">{item.tracking_number}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="rounded-lg bg-muted px-2 py-0.5">入荷: {item.in_date}</span>
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
    </div>
  )
}
