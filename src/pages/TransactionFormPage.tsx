import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ScanBarcode, Trash2, Plus, QrCode,
  AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { BarcodeScanner } from '@/components/BarcodeScanner'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Product, TransactionType, TransactionCategory } from '@/types/database'

interface ItemRow {
  product_id: string
  product_name: string
  quantity: number
  price: number
}

// スキャン対象の区別
type ScanTarget = 'product' | 'internal_id' | 'shipping_tracking_id' | 'order_id'

const IN_CATEGORIES: TransactionCategory[] = ['入荷', '返品', '棚卸']
const OUT_CATEGORIES: TransactionCategory[] = ['出荷', '再送', '棚卸']

export function TransactionFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = !!id

  const [type, setType] = useState<TransactionType>(
    (searchParams.get('type') as TransactionType) || 'IN'
  )
  const [category, setCategory] = useState<TransactionCategory>('入荷')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [internalId, setInternalId] = useState('')
  const [shippingTrackingId, setShippingTrackingId] = useState('')
  const [orderId, setOrderId] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [memo, setMemo] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [saving, setSaving] = useState(false)

  // 出荷時の管理番号チェック結果
  const [trackingStatus, setTrackingStatus] = useState<
    null | 'valid' | 'not_found' | 'already_shipped'
  >(null)

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data) setProducts(data)
      })
  }, [])

  useEffect(() => {
    if (!id) return
    async function load() {
      const { data: tx } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .single()
      if (!tx) return

      setType(tx.type as TransactionType)
      setCategory(tx.category as TransactionCategory)
      setDate(tx.date)
      setInternalId(tx.internal_id ?? '')
      setShippingTrackingId(tx.shipping_tracking_id ?? '')
      setOrderId(tx.order_id ?? '')
      setPartnerName(tx.partner_name ?? '')
      setMemo(tx.memo ?? '')

      const { data: txItems } = await supabase
        .from('transaction_items')
        .select('*, product:products(name)')
        .eq('transaction_id', id)

      if (txItems) {
        setItems(
          txItems.map((item) => ({
            product_id: item.product_id,
            product_name: (item.product as unknown as { name: string })?.name ?? '',
            quantity: item.quantity,
            price: Number(item.price),
          }))
        )
      }
    }
    load()
  }, [id])

  // type変更時にcategoryリセット
  useEffect(() => {
    if (type === 'IN') setCategory('入荷')
    else setCategory('出荷')
    setTrackingStatus(null)
  }, [type])

  const categories = type === 'IN' ? IN_CATEGORIES : OUT_CATEGORIES
  const isIN = type === 'IN'

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.price, 0)

  const addItem = useCallback(
    (product: Product) => {
      const existing = items.find((i) => i.product_id === product.id)
      if (existing) {
        setItems(
          items.map((i) =>
            i.product_id === product.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          )
        )
      } else {
        setItems([
          ...items,
          {
            product_id: product.id,
            product_name: product.name,
            quantity: 1,
            price: Number(product.default_unit_price),
          },
        ])
      }
    },
    [items]
  )

  // 管理番号チェック（出荷時 - internal_idベース）
  const checkInternalId = useCallback(
    async (value: string) => {
      if (!value.trim() || type !== 'OUT') {
        setTrackingStatus(null)
        return
      }

      const { data } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('internal_id', value.trim())
        .limit(1)

      if (!data || data.length === 0) {
        setTrackingStatus('not_found')
        return
      }

      const item = data[0]
      if (item.status === 'SHIPPED') {
        setTrackingStatus('already_shipped')
      } else {
        setTrackingStatus('valid')
        // 該当商品を自動追加
        const product = products.find((p) => p.id === item.product_id)
        if (product) {
          const alreadyAdded = items.find((i) => i.product_id === product.id)
          if (!alreadyAdded) {
            addItem(product)
          }
        }
      }
    },
    [type, products, items, addItem]
  )

  // スキャン完了ハンドラ
  const handleScanResult = useCallback(
    (code: string) => {
      if (scanTarget === 'product') {
        setScanTarget(null)
        const product = products.find((p) => p.internal_barcode === code)
        if (product) {
          addItem(product)
          toast.success(`追加: ${product.name}`)
        } else {
          toast.error(`バーコード "${code}" に該当する商品が見つかりません`)
        }
      } else if (scanTarget === 'internal_id') {
        setScanTarget(null)
        setInternalId(code)
        toast.success(`店舗管理番号読取: ${code}`)
        if (type === 'OUT') {
          checkInternalId(code)
        }
      } else if (scanTarget === 'shipping_tracking_id') {
        setScanTarget(null)
        setShippingTrackingId(code)
        toast.success(`配送追跡番号読取: ${code}`)
      } else if (scanTarget === 'order_id') {
        setScanTarget(null)
        setOrderId(code)
        toast.success(`注文ID読取: ${code}`)
      }
    },
    [scanTarget, products, addItem, type, checkInternalId]
  )

  const updateItem = (index: number, field: keyof ItemRow, value: string | number) => {
    setItems(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (items.length === 0) {
      toast.error('明細を追加してください')
      return
    }
    setSaving(true)
    try {
      const txPayload = {
        type,
        status: 'SCHEDULED' as const,
        category,
        date,
        internal_id: internalId.trim() || null,
        shipping_tracking_id: shippingTrackingId.trim() || null,
        order_id: orderId.trim() || null,
        partner_name: partnerName.trim() || null,
        total_amount: totalAmount,
        memo: memo.trim() || null,
      }

      if (isEdit) {
        const { error } = await supabase
          .from('transactions')
          .update(txPayload)
          .eq('id', id)
        if (error) throw error

        await supabase.from('transaction_items').delete().eq('transaction_id', id)
        const { error: itemsError } = await supabase
          .from('transaction_items')
          .insert(
            items.map((item) => ({
              transaction_id: id!,
              product_id: item.product_id,
              quantity: item.quantity,
              price: item.price,
            }))
          )
        if (itemsError) throw itemsError
        toast.success('入出庫データを更新しました')
      } else {
        const { data: newTx, error } = await supabase
          .from('transactions')
          .insert(txPayload)
          .select()
          .single()
        if (error || !newTx) throw error

        const { error: itemsError } = await supabase
          .from('transaction_items')
          .insert(
            items.map((item) => ({
              transaction_id: newTx.id,
              product_id: item.product_id,
              quantity: item.quantity,
              price: item.price,
            }))
          )
        if (itemsError) throw itemsError
        toast.success('入出庫データを登録しました')
      }
      navigate('/transactions')
    } catch {
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 単価ラベル（入庫=仕入れ単価, 出庫=販売単価）
  const priceLabel = isIN ? '仕入れ単価' : '販売単価'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">
          {isEdit ? '入出庫編集' : isIN ? '新規入庫' : '新規出庫'}
        </h1>
      </div>

      <div className="space-y-4">
        {/* ① 基本情報 */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-medium text-muted-foreground">① 基本情報</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">タイプ</Label>
                <Select value={type} onValueChange={(v) => setType(v as TransactionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">入庫</SelectItem>
                    <SelectItem value="OUT">出庫</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">カテゴリ</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as TransactionCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="date">日付</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* ② 商品選択 */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">② 商品を選択</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScanTarget(scanTarget === 'product' ? null : 'product')}
              >
                <ScanBarcode className="mr-1 h-3 w-3" />
                商品スキャン
              </Button>
            </div>

            {scanTarget === 'product' && (
              <BarcodeScanner
                onScan={handleScanResult}
                onClose={() => setScanTarget(null)}
              />
            )}

            <Select
              onValueChange={(productId) => {
                const product = products.find((p) => p.id === productId)
                if (product) addItem(product)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="商品を選択して追加..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} (在庫: {p.current_stock})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {items.map((item, index) => (
              <Card key={index} className="border-dashed">
                <CardContent className="flex items-center gap-2 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                        className="h-8 w-16 text-center"
                      />
                      <span className="text-xs text-muted-foreground">×</span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={item.price}
                          onChange={(e) => updateItem(index, 'price', parseInt(e.target.value) || 0)}
                          className="h-8 w-24"
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {priceLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      ¥{(item.quantity * item.price).toLocaleString()}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeItem(index)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {items.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center">
                <Plus className="h-5 w-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  バーコードスキャンまたは選択で商品を追加
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ③ 管理番号 (3分割) */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-medium text-muted-foreground">③ 管理番号</p>

            {/* 店舗管理番号 */}
            <div className="space-y-1">
              <Label className="text-xs">店舗管理番号</Label>
              <div className="flex gap-2">
                <Input
                  value={internalId}
                  onChange={(e) => {
                    setInternalId(e.target.value)
                    setTrackingStatus(null)
                  }}
                  onBlur={() => {
                    if (type === 'OUT' && internalId.trim()) {
                      checkInternalId(internalId)
                    }
                  }}
                  placeholder="店舗管理番号"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setScanTarget(scanTarget === 'internal_id' ? null : 'internal_id')}
                >
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>
              {scanTarget === 'internal_id' && (
                <BarcodeScanner
                  onScan={handleScanResult}
                  onClose={() => setScanTarget(null)}
                />
              )}
            </div>

            {/* 出荷時の管理番号チェック結果 */}
            {type === 'OUT' && trackingStatus && (
              <div className={`flex items-center gap-2 rounded-md p-2 text-sm ${
                trackingStatus === 'valid'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}>
                {trackingStatus === 'valid' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    入荷済み・未出荷です。出荷可能です。
                  </>
                ) : trackingStatus === 'already_shipped' ? (
                  <>
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    この管理番号は既に出荷済みです。
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    この管理番号は入荷記録にありません。
                  </>
                )}
              </div>
            )}

            {/* 配送追跡番号 */}
            <div className="space-y-1">
              <Label className="text-xs">配送追跡番号</Label>
              <div className="flex gap-2">
                <Input
                  value={shippingTrackingId}
                  onChange={(e) => setShippingTrackingId(e.target.value)}
                  placeholder="配送追跡番号"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setScanTarget(scanTarget === 'shipping_tracking_id' ? null : 'shipping_tracking_id')}
                >
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>
              {scanTarget === 'shipping_tracking_id' && (
                <BarcodeScanner
                  onScan={handleScanResult}
                  onClose={() => setScanTarget(null)}
                />
              )}
            </div>

            {/* 注文ID */}
            <div className="space-y-1">
              <Label className="text-xs">注文ID</Label>
              <div className="flex gap-2">
                <Input
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="注文ID"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setScanTarget(scanTarget === 'order_id' ? null : 'order_id')}
                >
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>
              {scanTarget === 'order_id' && (
                <BarcodeScanner
                  onScan={handleScanResult}
                  onClose={() => setScanTarget(null)}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* ④ 取引先・メモ */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {isIN ? '④ 取引先・メモ' : '④ 顧客情報・メモ'}
            </p>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="partner">
                {isIN ? '取引先 (仕入先)' : '取引先 (顧客名)'}
              </Label>
              <Input
                id="partner"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder={isIN ? '仕入先名' : '顧客名'}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="memo">メモ</Label>
              <Textarea
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={2}
                placeholder={isIN ? '入荷メモ' : '出荷メモ・配送先等'}
              />
            </div>
          </CardContent>
        </Card>

        {/* 合計 */}
        <div className="flex items-center justify-between rounded-lg bg-muted p-3">
          <span className="font-medium">
            {isIN ? '合計仕入れ金額' : '合計販売金額'}
          </span>
          <span className="text-lg font-bold">¥{totalAmount.toLocaleString()}</span>
        </div>

        {/* 出荷時警告 */}
        {type === 'OUT' && trackingStatus === 'already_shipped' && (
          <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            管理番号が出荷済みです。続行する場合は内容を確認してください。
          </div>
        )}

        <Button className="w-full" size="lg" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : isEdit ? '更新する' : '予定として登録する'}
        </Button>
      </div>
    </div>
  )
}
