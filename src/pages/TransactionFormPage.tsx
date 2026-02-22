import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Trash2, Plus, ClipboardPaste, Tag, Truck, ShoppingBag, Search, X, Package, User, CalendarDays, CheckCircle, Clock, Receipt, Hash,
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
import type { Product, TransactionType, TransactionCategory, TransactionStatus } from '@/types/database'

interface ItemRow {
  product_id: string
  product_name: string
  product_code: string
  product_image: string | null
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
  const [status, setStatus] = useState<TransactionStatus>(
    (searchParams.get('status') as TransactionStatus) || 'SCHEDULED'
  )
  const [category, setCategory] = useState<TransactionCategory>(
    (searchParams.get('category') as TransactionCategory) ||
    ((searchParams.get('type') || 'IN') === 'IN' ? '入荷' : '出荷')
  )
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  // ① 基本情報に移動: 管理番号
  const [trackingNumber, setTrackingNumber] = useState('')

  // ③ コード・取引情報
  const [orderCode, setOrderCode] = useState('')
  const [shippingCode, setShippingCode] = useState('')
  const [purchaseOrderCode, setPurchaseOrderCode] = useState('')  // 発注コード（新規）
  const [partnerName, setPartnerName] = useState('')              // 取引先（③に移動）
  const [orderDate, setOrderDate] = useState('')                  // 注文日（③に移動）

  // ④ 顧客情報・メモ
  const [customerName, setCustomerName] = useState('')
  const [orderId, setOrderId] = useState('')                      // 注文ID（新規）
  const [memo, setMemo] = useState('')

  const [items, setItems] = useState<ItemRow[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [saving, setSaving] = useState(false)

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
      if (tx.status === 'SCHEDULED' || tx.status === 'COMPLETED') {
        setStatus(tx.status as TransactionStatus)
      }
      setCategory(tx.category as TransactionCategory)
      setDate(tx.date)
      setTrackingNumber(tx.tracking_number ?? '')
      setOrderCode(tx.order_code ?? '')
      setShippingCode(tx.shipping_code ?? '')
      setPurchaseOrderCode(tx.purchase_order_code ?? '')
      setPartnerName(tx.partner_name ?? '')
      setCustomerName(tx.customer_name ?? '')
      setOrderDate(tx.order_date ?? '')
      setOrderId(tx.order_id ?? '')
      setMemo(tx.memo ?? '')

      const { data: txItems } = await supabase
        .from('transaction_items')
        .select('*, product:products(name, image_url, product_code)')
        .eq('transaction_id', id)

      if (txItems) {
        setItems(
          txItems.map((item) => {
            const product = item.product as unknown as { name: string; image_url: string | null; product_code: string | null } | null
            return {
              product_id: item.product_id,
              product_name: product?.name ?? '',
              product_code: product?.product_code ?? '',
              product_image: product?.image_url ?? null,
              quantity: item.quantity,
              price: Number(item.price),
            }
          })
        )
      }
    }
    load()
  }, [id])

  // type変更時にcategoryリセット（初回マウント時はスキップ）
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (type === 'IN') setCategory('入荷')
    else setCategory('出荷')
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
        const autoPrice = type === 'IN'
            ? Number(product.cost_price ?? product.default_unit_price ?? 0)
            : Number(product.selling_price ?? product.default_unit_price ?? 0)
        setItems([
          ...items,
          {
            product_id: product.id,
            product_name: product.name,
            product_code: product.product_code ?? '',
            product_image: product.image_url ?? null,
            quantity: 1,
            price: autoPrice,
          },
        ])
      }
    },
    [items, type]
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
      // 商品コードが入力・変更された場合、productsテーブルも更新
      for (const item of items) {
        if (item.product_code.trim()) {
          await supabase
            .from('products')
            .update({ product_code: item.product_code.trim() })
            .eq('id', item.product_id)
        }
      }

      const txPayload = {
        type,
        status: status,
        category,
        date,
        tracking_number: trackingNumber.trim() || null,
        order_code: orderCode.trim() || null,
        shipping_code: shippingCode.trim() || null,
        purchase_order_code: purchaseOrderCode.trim() || null,
        partner_name: partnerName.trim() || null,
        customer_name: customerName.trim() || null,
        order_date: orderDate || null,
        order_id: orderId.trim() || null,
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
  const pasteToField = async (setter: (v: string) => void) => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        toast.error('クリップボードが空です')
        return
      }
      setter(text.trim())
      toast.success(`貼り付け: ${text.trim()}`)
    } catch {
      toast.error('クリップボードへのアクセスが許可されていません')
    }
  }

  // 商品フィルター（商品名・商品コードで検索）
  const filteredProducts = products.filter((p) => {
    if (!productSearch) return true
    const q = productSearch.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.product_code ?? '').toLowerCase().includes(q)
  })

  // 単価ラベル（入庫=仕入れ単価, 出庫=販売単価）
  const priceLabel = isIN ? '仕入れ単価' : '販売単価'

  // ページタイトル
  const pageTitle = isEdit
    ? '入出庫編集'
    : status === 'SCHEDULED'
      ? (isIN ? '新規入荷予定' : '新規出荷予定')
      : (isIN ? '新規入荷' : '新規出荷')

  return (
    <div className="page-transition space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-xl hover:bg-accent transition-colors" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold tracking-tight">{pageTitle}</h1>
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

            {/* 作業予定 / 作業履歴 トグル */}
            <div className="flex rounded-xl border border-border/60 overflow-hidden bg-muted/30 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setStatus('SCHEDULED')}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold transition-all ${
                  status === 'SCHEDULED'
                    ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                    : 'text-muted-foreground hover:text-sky-500'
                }`}
              >
                <Clock className="h-4 w-4" />
                作業予定
              </button>
              <button
                type="button"
                onClick={() => setStatus('COMPLETED')}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold transition-all ${
                  status === 'COMPLETED'
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : 'text-muted-foreground hover:text-emerald-500'
                }`}
              >
                <CheckCircle className="h-4 w-4" />
                作業履歴
              </button>
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

            {/* 管理番号（③から移動） */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Tag className="h-3 w-3 text-violet-500" />
                <Label className="text-xs text-muted-foreground">管理番号</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="手入力 or スキャン"
                  inputMode="text"
                  enterKeyHint="done"
                  className="flex-1 rounded-xl bg-white dark:bg-white/5 border-border/60"
                />
                <BarcodeScanButton
                  className="border-violet-200 dark:border-violet-800 text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950"
                  onScan={(value) => {
                    setTrackingNumber(value)
                    toast.success(`読取: ${value}`)
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-xl border-violet-200 dark:border-violet-800 text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950 transition-colors"
                  onClick={() => pasteToField(setTrackingNumber)}
                  title="貼り付け"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
              </div>
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

            {/* 商品検索 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="商品名・商品コードで検索..."
                inputMode="text"
                enterKeyHint="done"
                className="rounded-xl pl-9 pr-9 bg-white dark:bg-white/5 border-border/60"
              />
              {productSearch && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-lg text-muted-foreground/60 hover:text-foreground"
                  onClick={() => setProductSearch('')}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* 商品リスト */}
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-border/40 p-2">
              {filteredProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  該当する商品がありません
                </p>
              ) : (
                filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addItem(p)}
                    className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all ${
                      isIN
                        ? 'hover:bg-sky-50 active:bg-sky-100 dark:hover:bg-sky-950/50 dark:active:bg-sky-900/50'
                        : 'hover:bg-amber-50 active:bg-amber-100 dark:hover:bg-amber-950/50 dark:active:bg-amber-900/50'
                    }`}
                  >
                    {p.image_url ? (
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                        <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-100 dark:bg-slate-800">
                        <Package className="h-4 w-4 text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate">{p.name}</p>
                      {p.product_code && (
                        <p className="font-mono text-[11px] text-muted-foreground/70 truncate">{p.product_code}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        在庫: {p.current_stock} / {isIN ? '仕入' : '販売'}¥{Number(isIN ? (p.cost_price ?? p.default_unit_price ?? 0) : (p.selling_price ?? p.default_unit_price ?? 0)).toLocaleString()}
                      </p>
                    </div>
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  </button>
                ))
              )}
            </div>

            {/* 追加済み明細 */}
            {items.map((item, index) => (
              <div key={index} className={`flex items-center gap-2.5 rounded-2xl border p-3.5 transition-all ${
                isIN ? 'border-sky-100 bg-sky-50/30 dark:border-sky-900 dark:bg-sky-950/30' : 'border-amber-100 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/30'
              }`}>
                {item.product_image ? (
                  <div className={`h-10 w-10 shrink-0 overflow-hidden rounded border ${
                    isIN ? 'border-sky-200 dark:border-sky-800' : 'border-amber-200 dark:border-amber-800'
                  }`}>
                    <img src={item.product_image} alt={item.product_name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded ${
                    isIN ? 'bg-sky-100/50 dark:bg-sky-950/50' : 'bg-amber-100/50 dark:bg-amber-950/50'
                  }`}>
                    <Package className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate">{item.product_name}</p>
                  <div className="mt-1.5">
                    <Input
                      value={item.product_code}
                      onChange={(e) => updateItem(index, 'product_code', e.target.value)}
                      placeholder="商品コードを入力..."
                      className="h-7 rounded-lg text-[11px] font-mono bg-white dark:bg-white/5 border-border/60 px-2"
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">個数</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                        onFocus={(e) => e.target.select()}
                        className="h-11 w-full rounded-xl text-center text-base font-semibold bg-white dark:bg-white/5 border-border/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">{priceLabel}</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={item.price}
                        onChange={(e) => updateItem(index, 'price', parseInt(e.target.value) || 0)}
                        onFocus={(e) => e.target.select()}
                        className="h-11 w-full rounded-xl text-center text-base font-semibold bg-white dark:bg-white/5 border-border/60"
                      />
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
                  上の検索から商品を追加
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ③ コード・取引情報 */}
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
              <p className="text-sm font-semibold">コード・取引情報</p>
            </div>

            {/* 注文コード */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <ShoppingBag className="h-3 w-3 text-pink-500" />
                <Label className="text-xs text-muted-foreground">注文コード</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  value={orderCode}
                  onChange={(e) => setOrderCode(e.target.value)}
                  placeholder="注文ID・注文番号など"
                  inputMode="text"
                  enterKeyHint="done"
                  className="flex-1 rounded-xl bg-white dark:bg-white/5 border-border/60"
                />
                <BarcodeScanButton
                  className="border-pink-200 dark:border-pink-800 text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950"
                  onScan={(value) => {
                    setOrderCode(value)
                    toast.success(`読取: ${value}`)
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-xl border-pink-200 dark:border-pink-800 text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950 transition-colors"
                  onClick={() => pasteToField(setOrderCode)}
                  title="貼り付け"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* 追跡コード */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Truck className="h-3 w-3 text-sky-500" />
                <Label className="text-xs text-muted-foreground">追跡コード</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  value={shippingCode}
                  onChange={(e) => setShippingCode(e.target.value)}
                  placeholder="配送追跡番号など"
                  inputMode="text"
                  enterKeyHint="done"
                  className="flex-1 rounded-xl bg-white dark:bg-white/5 border-border/60"
                />
                <BarcodeScanButton
                  className="border-sky-200 dark:border-sky-800 text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950"
                  onScan={(value) => {
                    setShippingCode(value)
                    toast.success(`読取: ${value}`)
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-xl border-sky-200 dark:border-sky-800 text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950 transition-colors"
                  onClick={() => pasteToField(setShippingCode)}
                  title="貼り付け"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* 発注コード（新規） */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3 w-3 text-amber-500" />
                <Label className="text-xs text-muted-foreground">発注コード</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  value={purchaseOrderCode}
                  onChange={(e) => setPurchaseOrderCode(e.target.value)}
                  placeholder="発注番号・POナンバーなど"
                  inputMode="text"
                  enterKeyHint="done"
                  className="flex-1 rounded-xl bg-white dark:bg-white/5 border-border/60"
                />
                <BarcodeScanButton
                  className="border-amber-200 dark:border-amber-800 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950"
                  onScan={(value) => {
                    setPurchaseOrderCode(value)
                    toast.success(`読取: ${value}`)
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-xl border-amber-200 dark:border-amber-800 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors"
                  onClick={() => pasteToField(setPurchaseOrderCode)}
                  title="貼り付け"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* 取引先（④から移動） */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="partner">
                {isIN ? '取引先 (仕入先)' : '取引先'}
              </Label>
              <Input
                id="partner"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder={isIN ? '仕入先名' : '販売先名'}
                className="rounded-xl bg-white dark:bg-white/5 border-border/60"
              />
            </div>

            {/* 注文日（④から移動） */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3 text-teal-500" />
                <Label className="text-xs text-muted-foreground" htmlFor="orderDate">注文日</Label>
              </div>
              <Input
                id="orderDate"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="rounded-xl bg-white dark:bg-white/5 border-border/60"
              />
            </div>
          </CardContent>
        </Card>

        {/* ④ 顧客情報・メモ */}
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
              <p className="text-sm font-semibold">顧客情報・メモ</p>
            </div>

            {/* 顧客名 */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3 text-indigo-500" />
                <Label className="text-xs text-muted-foreground" htmlFor="customerName">顧客名</Label>
              </div>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="顧客名・購入者名"
                className="rounded-xl bg-white dark:bg-white/5 border-border/60"
              />
            </div>

            {/* 注文ID（新規） */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Hash className="h-3 w-3 text-orange-500" />
                <Label className="text-xs text-muted-foreground">注文ID</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="顧客注文ID・注文番号など"
                  inputMode="text"
                  enterKeyHint="done"
                  className="flex-1 rounded-xl bg-white dark:bg-white/5 border-border/60"
                />
                <BarcodeScanButton
                  className="border-orange-200 dark:border-orange-800 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950"
                  onScan={(value) => {
                    setOrderId(value)
                    toast.success(`読取: ${value}`)
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-xl border-orange-200 dark:border-orange-800 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950 transition-colors"
                  onClick={() => pasteToField(setOrderId)}
                  title="貼り付け"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* メモ */}
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
          {saving ? '保存中...' : isEdit ? '更新する' : status === 'SCHEDULED' ? '予定として登録する' : '登録する'}
        </Button>
      </div>
    </div>
  )
}
