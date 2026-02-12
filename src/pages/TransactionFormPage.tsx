import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Trash2, Plus,
  AlertTriangle, CheckCircle2, Store, Truck, ShoppingBag, ClipboardPaste,
} from 'lucide-react'
import { BarcodeScanButton } from '@/components/BarcodeScanButton'
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
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Product, TransactionType, TransactionCategory } from '@/types/database'

interface ItemRow {
  product_id: string
  product_name: string
  quantity: number
  price: number
}

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

      try {
        const { data, error } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('internal_id', value.trim())
          .limit(1)

        if (error) {
          console.warn('inventory_items query failed:', error.message)
          setTrackingStatus(null)
          return
        }

        if (!data || data.length === 0) {
          setTrackingStatus('not_found')
          return
        }

        const item = data[0]
        if (item.status === 'SHIPPED') {
          setTrackingStatus('already_shipped')
        } else {
          setTrackingStatus('valid')
          const product = products.find((p) => p.id === item.product_id)
          if (product) {
            const alreadyAdded = items.find((i) => i.product_id === product.id)
            if (!alreadyAdded) {
              addItem(product)
            }
          }
        }
      } catch {
        console.warn('checkInternalId error')
        setTrackingStatus(null)
      }
    },
    [type, products, items, addItem]
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
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err)
      console.error('[TransactionForm] 保存エラー:', err)
      toast.error(`保存失敗: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  // クリップボードから貼り付け
  const pasteFromClipboard = async (target: 'internal_id' | 'shipping_tracking_id' | 'order_id') => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        toast.error('クリップボードが空です')
        return
      }
      const value = text.trim()
      if (target === 'internal_id') {
        setInternalId(value)
        toast.success(`貼り付け: ${value}`)
        if (type === 'OUT') checkInternalId(value)
      } else if (target === 'shipping_tracking_id') {
        setShippingTrackingId(value)
        toast.success(`貼り付け: ${value}`)
      } else {
        setOrderId(value)
        toast.success(`貼り付け: ${value}`)
      }
    } catch {
      toast.error('クリップボードへのアクセスが許可されていません')
    }
  }

  // 単価ラベル（入庫=仕入れ単価, 出庫=販売単価）
  const priceLabel = isIN ? '仕入れ単価' : '販売単価'

  return (
    <div className="page-transition space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-xl hover:bg-accent transition-colors" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold tracking-tight">
          {isEdit ? '入出庫編集' : isIN ? '新規入庫' : '新規出庫'}
        </h1>
      </div>

      <div className="space-y-4">
        {/* ① 基本情報 */}
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="space-y-3.5 p-5">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                isIN ? 'bg-sky-100 dark:bg-sky-950' : 'bg-amber-100 dark:bg-amber-950'
              }`}>
                <span className={`text-xs font-bold ${
                  isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'
                }`}>1</span>
              </div>
              <p className="text-sm font-semibold">基本情報</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">タイプ</Label>
                <Select value={type} onValueChange={(v) => setType(v as TransactionType)}>
                  <SelectTrigger className="rounded-xl bg-white dark:bg-white/5 border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">入庫</SelectItem>
                    <SelectItem value="OUT">出庫</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">カテゴリ</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as TransactionCategory)}>
                  <SelectTrigger className="rounded-xl bg-white dark:bg-white/5 border-border/60">
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
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="date">日付</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl bg-white dark:bg-white/5 border-border/60"
              />
            </div>
          </CardContent>
        </Card>

        {/* ② 商品選択 */}
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="space-y-3.5 p-5">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                isIN ? 'bg-sky-100 dark:bg-sky-950' : 'bg-amber-100 dark:bg-amber-950'
              }`}>
                <span className={`text-xs font-bold ${
                  isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'
                }`}>2</span>
              </div>
              <p className="text-sm font-semibold">商品を選択</p>
            </div>

            <Select
              onValueChange={(productId) => {
                const product = products.find((p) => p.id === productId)
                if (product) addItem(product)
              }}
            >
              <SelectTrigger className="rounded-xl bg-white dark:bg-white/5 border-border/60">
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
              <div key={index} className={`flex items-center gap-2 rounded-2xl border p-3.5 transition-all ${
                isIN ? 'border-sky-100 bg-sky-50/30 dark:border-sky-900 dark:bg-sky-950/30' : 'border-amber-100 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/30'
              }`}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate">{item.product_name}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                      className="h-8 w-14 rounded-lg text-center text-sm bg-white dark:bg-white/5 border-border/60"
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={item.price}
                        onChange={(e) => updateItem(index, 'price', parseInt(e.target.value) || 0)}
                        className="h-8 w-20 rounded-lg text-sm bg-white dark:bg-white/5 border-border/60"
                      />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {priceLabel}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold num-display ${isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    ¥{(item.quantity * item.price).toLocaleString()}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
                    onClick={() => removeItem(index)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}

            {items.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/40 p-6 text-center">
                <Plus className="h-6 w-6 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">
                  上のセレクトから商品を追加
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ③ 管理番号 (3分割) */}
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="space-y-3.5 p-5">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                isIN ? 'bg-sky-100 dark:bg-sky-950' : 'bg-amber-100 dark:bg-amber-950'
              }`}>
                <span className={`text-xs font-bold ${
                  isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'
                }`}>3</span>
              </div>
              <p className="text-sm font-semibold">管理番号</p>
              <span className="text-[10px] text-muted-foreground/60 ml-auto">📷スキャン or 📋貼り付け</span>
            </div>

            {/* 店舗管理番号 */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Store className="h-3 w-3 text-violet-500" />
                <Label className="text-xs text-muted-foreground">店舗管理番号</Label>
              </div>
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
                  placeholder="手入力 or スキャン"
                  inputMode="text"
                  enterKeyHint="done"
                  className="flex-1 rounded-xl bg-white dark:bg-white/5 border-border/60"
                />
                <BarcodeScanButton
                  className="border-violet-200 dark:border-violet-800 text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950"
                  onScan={(value) => {
                    setInternalId(value)
                    toast.success(`読取: ${value}`)
                    // checkInternalId は onBlur 時のみ実行（スキャン直後のAPI呼び出しを排除）
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-xl border-violet-200 dark:border-violet-800 text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950 transition-colors"
                  onClick={() => pasteFromClipboard('internal_id')}
                  title="貼り付け"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* 出荷時の管理番号チェック結果 */}
            {type === 'OUT' && trackingStatus && (
              <div className={`flex items-center gap-2 rounded-xl p-3 text-sm animate-scale-in ${
                trackingStatus === 'valid'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
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
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Truck className="h-3 w-3 text-sky-500" />
                <Label className="text-xs text-muted-foreground">配送追跡番号</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  value={shippingTrackingId}
                  onChange={(e) => setShippingTrackingId(e.target.value)}
                  placeholder="手入力 or スキャン"
                  inputMode="text"
                  enterKeyHint="done"
                  className="flex-1 rounded-xl bg-white dark:bg-white/5 border-border/60"
                />
                <BarcodeScanButton
                  className="border-sky-200 dark:border-sky-800 text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950"
                  onScan={(value) => {
                    setShippingTrackingId(value)
                    toast.success(`読取: ${value}`)
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-xl border-sky-200 dark:border-sky-800 text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950 transition-colors"
                  onClick={() => pasteFromClipboard('shipping_tracking_id')}
                  title="貼り付け"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* 注文ID */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <ShoppingBag className="h-3 w-3 text-pink-500" />
                <Label className="text-xs text-muted-foreground">注文ID</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="手入力 or スキャン"
                  inputMode="text"
                  enterKeyHint="done"
                  className="flex-1 rounded-xl bg-white dark:bg-white/5 border-border/60"
                />
                <BarcodeScanButton
                  className="border-pink-200 dark:border-pink-800 text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950"
                  onScan={(value) => {
                    setOrderId(value)
                    toast.success(`読取: ${value}`)
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-xl border-pink-200 dark:border-pink-800 text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950 transition-colors"
                  onClick={() => pasteFromClipboard('order_id')}
                  title="貼り付け"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ④ 取引先・メモ */}
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="space-y-3.5 p-5">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                isIN ? 'bg-sky-100 dark:bg-sky-950' : 'bg-amber-100 dark:bg-amber-950'
              }`}>
                <span className={`text-xs font-bold ${
                  isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'
                }`}>4</span>
              </div>
              <p className="text-sm font-semibold">
                {isIN ? '取引先・メモ' : '顧客情報・メモ'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="partner">
                {isIN ? '取引先 (仕入先)' : '取引先 (顧客名)'}
              </Label>
              <Input
                id="partner"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder={isIN ? '仕入先名' : '顧客名'}
                className="rounded-xl bg-white dark:bg-white/5 border-border/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="memo">メモ</Label>
              <Textarea
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={2}
                placeholder={isIN ? '入荷メモ' : '出荷メモ・配送先等'}
                className="rounded-xl bg-white dark:bg-white/5 border-border/60"
              />
            </div>
          </CardContent>
        </Card>

        {/* 合計 */}
        <div className={`flex items-center justify-between rounded-2xl p-4 border ${
          isIN
            ? 'bg-sky-50/50 border-sky-100 dark:bg-sky-950/30 dark:border-sky-900'
            : 'bg-amber-50/50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900'
        }`}>
          <span className="font-semibold text-sm text-muted-foreground">
            {isIN ? '合計仕入れ金額' : '合計販売金額'}
          </span>
          <span className={`text-xl font-bold num-display ${isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'}`}>
            ¥{totalAmount.toLocaleString()}
          </span>
        </div>

        {/* 出荷時警告 */}
        {type === 'OUT' && trackingStatus === 'already_shipped' && (
          <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300 animate-scale-in">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            管理番号が出荷済みです。続行する場合は内容を確認してください。
          </div>
        )}

        <Button
          className={`w-full rounded-2xl shadow-lg h-12 text-[13px] font-semibold transition-all duration-300 ${
            isIN
              ? 'bg-slate-800 text-white shadow-slate-800/20 hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300'
              : 'bg-amber-500 text-white shadow-amber-500/20 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500'
          }`}
          size="lg"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '保存中...' : isEdit ? '更新する' : '予定として登録する'}
        </Button>
      </div>
    </div>
  )
}
