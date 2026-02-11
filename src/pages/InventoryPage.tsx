import { useEffect, useState, useCallback } from 'react'
import { Search, ScanBarcode, Package, ArrowUpFromLine, BoxSelect } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarcodeScanner } from '@/components/BarcodeScanner'
import { supabase } from '@/lib/supabase'
import type { InventoryItem } from '@/types/database'

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
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

  const handleBarcodeScan = useCallback(
    (barcode: string) => {
      setScanning(false)
      setSearch(barcode)
    },
    []
  )

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">個体追跡</h1>
        <Badge className={`rounded-lg px-2.5 py-1 ${
          tab === 'IN_STOCK'
            ? 'bg-sky-100 text-sky-700 hover:bg-sky-100'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-100'
        }`}>
          {tab === 'IN_STOCK' ? `在庫: ${filtered.length}件` : `出荷済: ${filtered.length}件`}
        </Badge>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="管理番号 or 商品名で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl pl-9"
          />
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl" onClick={() => setScanning(true)}>
          <ScanBarcode className="h-4 w-4" />
        </Button>
      </div>

      {scanning && (
        <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setScanning(false)} />
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'IN_STOCK' | 'SHIPPED')}>
        <TabsList className="w-full rounded-xl bg-muted/60">
          <TabsTrigger value="IN_STOCK" className="flex-1 rounded-lg">
            <Package className="mr-1 h-3 w-3" />
            未出荷
          </TabsTrigger>
          <TabsTrigger value="SHIPPED" className="flex-1 rounded-lg">
            <ArrowUpFromLine className="mr-1 h-3 w-3" />
            出荷済
          </TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <BoxSelect className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">
                {tab === 'IN_STOCK'
                  ? '未出荷の個体はありません'
                  : '出荷済みの個体はありません'}
              </p>
            </div>
          ) : (
            filtered.map((item) => (
              <Card key={item.id} className="border-0 shadow-sm">
                <CardContent className="p-3.5">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      item.status === 'IN_STOCK' ? 'bg-sky-50' : 'bg-gray-100'
                    }`}>
                      {item.status === 'IN_STOCK' ? (
                        <Package className="h-4 w-4 text-sky-500" />
                      ) : (
                        <ArrowUpFromLine className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">
                          {item.product?.name ?? '不明な商品'}
                        </p>
                        <Badge className={`shrink-0 text-[10px] px-1.5 py-0 ${
                          item.status === 'IN_STOCK'
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-100'
                        }`}>
                          {item.status === 'IN_STOCK' ? '在庫中' : '出荷済'}
                        </Badge>
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                        {item.internal_id && (
                          <div className="flex items-center gap-1">
                            <span className="inline-block w-12 text-[10px] text-violet-500 font-medium">店舗管理</span>
                            <span className="font-mono">{item.internal_id}</span>
                          </div>
                        )}
                        {item.shipping_tracking_id && (
                          <div className="flex items-center gap-1">
                            <span className="inline-block w-12 text-[10px] text-sky-500 font-medium">配送追跡</span>
                            <span className="font-mono">{item.shipping_tracking_id}</span>
                          </div>
                        )}
                        {item.order_id && (
                          <div className="flex items-center gap-1">
                            <span className="inline-block w-12 text-[10px] text-pink-500 font-medium">注文ID</span>
                            <span className="font-mono">{item.order_id}</span>
                          </div>
                        )}
                        {!item.internal_id && item.tracking_number && (
                          <div className="flex items-center gap-1">
                            <span className="inline-block w-12 text-[10px] text-gray-500 font-medium">管理番号</span>
                            <span className="font-mono">{item.tracking_number}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5">入荷: {item.in_date}</span>
                        {item.out_date && <span className="rounded bg-muted px-1.5 py-0.5">出荷: {item.out_date}</span>}
                        {item.partner_name && <span className="rounded bg-muted px-1.5 py-0.5">{item.partner_name}</span>}
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
