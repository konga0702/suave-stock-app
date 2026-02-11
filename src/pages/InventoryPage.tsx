import { useEffect, useState, useCallback } from 'react'
import { Search, ScanBarcode, Package, ArrowUpFromLine } from 'lucide-react'
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
      item.tracking_number.toLowerCase().includes(q) ||
      item.product?.name?.toLowerCase().includes(q) ||
      item.partner_name?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">個体追跡</h1>
        <Badge variant="outline">
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
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => setScanning(true)}>
          <ScanBarcode className="h-4 w-4" />
        </Button>
      </div>

      {scanning && (
        <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setScanning(false)} />
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'IN_STOCK' | 'SHIPPED')}>
        <TabsList className="w-full">
          <TabsTrigger value="IN_STOCK" className="flex-1">
            <Package className="mr-1 h-3 w-3" />
            未出荷
          </TabsTrigger>
          <TabsTrigger value="SHIPPED" className="flex-1">
            <ArrowUpFromLine className="mr-1 h-3 w-3" />
            出荷済
          </TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-2">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {tab === 'IN_STOCK'
                ? '未出荷の個体はありません'
                : '出荷済みの個体はありません'}
            </p>
          ) : (
            filtered.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {item.product?.name ?? '不明な商品'}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        管理番号: {item.tracking_number}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                        <span>入荷: {item.in_date}</span>
                        {item.out_date && <span>· 出荷: {item.out_date}</span>}
                        {item.partner_name && <span>· {item.partner_name}</span>}
                      </div>
                    </div>
                    <Badge
                      variant={item.status === 'IN_STOCK' ? 'default' : 'secondary'}
                      className="ml-2 shrink-0"
                    >
                      {item.status === 'IN_STOCK' ? '在庫中' : '出荷済'}
                    </Badge>
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
