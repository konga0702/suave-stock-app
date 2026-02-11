import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, ScanBarcode, Barcode, Upload, Download, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BarcodeScanner } from '@/components/BarcodeScanner'
import { BarcodeDisplay } from '@/components/BarcodeDisplay'
import { supabase } from '@/lib/supabase'
import { exportProductsCsv, importProductsCsv } from '@/lib/csv'
import { toast } from 'sonner'
import type { Product } from '@/types/database'

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null)

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

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.internal_barcode && p.internal_barcode.includes(search))
  )

  const handleBarcodeScan = useCallback(
    (barcode: string) => {
      setScanning(false)
      setSearch(barcode)
    },
    []
  )

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        await importProductsCsv(text)
        toast.success('インポート完了')
        loadProducts()
      } catch {
        toast.error('インポートに失敗しました')
      }
    }
    input.click()
  }

  const getStockColor = (stock: number) => {
    if (stock === 0) return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
    if (stock <= 5) return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
  }

  return (
    <div className="page-transition space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">商品一覧</h1>
        <div className="flex gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors" onClick={handleImport} title="CSVインポート">
            <Upload className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors" onClick={() => exportProductsCsv(products)} title="CSVエクスポート">
            <Download className="h-4 w-4" />
          </Button>
          <Button asChild size="icon" className="h-9 w-9 rounded-xl bg-slate-800 text-white shadow-sm hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 transition-all">
            <Link to="/products/new">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="商品名 or バーコード検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl pl-9 bg-white dark:bg-white/5 border-border/60 focus:border-slate-400 transition-colors"
          />
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-border/60 hover:bg-accent transition-colors" onClick={() => setScanning(true)}>
          <ScanBarcode className="h-4 w-4" />
        </Button>
      </div>

      {scanning && (
        <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setScanning(false)} />
      )}

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center animate-fade-in">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Package className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">
              商品が見つかりません
            </p>
          </div>
        ) : (
          filtered.map((product, index) => (
            <Card
              key={product.id}
              className={`border-0 shadow-sm shadow-slate-200/50 dark:shadow-none transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
                index % 2 === 1 ? 'bg-slate-50/50 dark:bg-white/[0.02]' : ''
              }`}
            >
              <CardContent className="flex items-center gap-3.5 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                  <Package className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/products/${product.id}/edit`}
                    className="block text-[13px] font-semibold hover:text-slate-600 dark:hover:text-slate-300 truncate transition-colors"
                  >
                    {product.name}
                  </Link>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {product.internal_barcode && (
                      <span className="font-mono text-[11px] text-muted-foreground/70">{product.internal_barcode}</span>
                    )}
                    <span className="font-semibold text-slate-600 dark:text-slate-300 num-display">¥{Number(product.default_unit_price).toLocaleString()}</span>
                  </div>
                </div>
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
              </CardContent>
            </Card>
          ))
        )}
      </div>

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
