import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, ScanBarcode, Barcode, Upload, Download } from 'lucide-react'
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">商品一覧</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handleImport} title="CSVインポート">
            <Upload className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => exportProductsCsv(products)} title="CSVエクスポート">
            <Download className="h-4 w-4" />
          </Button>
          <Button asChild size="icon">
            <Link to="/products/new">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="商品名 or バーコード検索"
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

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            商品が見つかりません
          </p>
        ) : (
          filtered.map((product) => (
            <Card key={product.id} className="relative">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/products/${product.id}/edit`}
                    className="block font-medium hover:underline truncate"
                  >
                    {product.name}
                  </Link>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {product.internal_barcode && (
                      <span className="font-mono">{product.internal_barcode}</span>
                    )}
                    <span>¥{Number(product.default_unit_price).toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">
                    {product.current_stock}
                  </div>
                  <div className="text-xs text-muted-foreground">在庫</div>
                </div>
                {product.internal_barcode && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setBarcodeProduct(product)}
                  >
                    <Barcode className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* バーコード表示ダイアログ */}
      <Dialog open={!!barcodeProduct} onOpenChange={() => setBarcodeProduct(null)}>
        <DialogContent className="max-w-sm">
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
