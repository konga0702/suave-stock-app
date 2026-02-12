import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Trash2, Plus, ClipboardPaste, Tag,
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
  const [trackingNumber, setTrackingNumber] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [memo, setMemo] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [products, setProducts] = useState<Product[]>([])
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
      setCategory(tx.category as TransactionCategory)
      setDate(tx.date)
      setTrackingNumber(tx.tracking_number ?? '')
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
        tracking_number: trackingNumber.trim() || null,
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
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        toast.error('クリップボードが空です')
        return
      }
      setTrackingNumber(text.trim())
      toast.success(`貼り付け: ${text.trim()}`)
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

        {/* ③ 管理番号 */}
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

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Tag className="h-3 w-3 text-violet-500" />
                <Label className="text-xs text-muted-foreground">管理番号 / 追跡番号</Label>
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
                  onClick={pasteFromClipboard}
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
