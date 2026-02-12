import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2, Package, Barcode, Boxes, JapaneseYen, FileText, ClipboardPaste, Camera, ImagePlus, X } from 'lucide-react'
import { BarcodeScanButton } from '@/components/BarcodeScanButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export function ProductFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const [name, setName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [stock, setStock] = useState('0')
  const [price, setPrice] = useState('0')
  const [memo, setMemo] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    async function load() {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single()
      if (data) {
        setName(data.name)
        setBarcode(data.internal_barcode ?? '')
        setStock(String(data.current_stock))
        setPrice(String(data.default_unit_price))
        setMemo(data.memo ?? '')
        setImageUrl(data.image_url ?? null)
        setImagePreview(data.image_url ?? null)
      }
    }
    load()
  }, [id])

  const uploadImage = async (file: File): Promise<string | null> => {
    setUploading(true)
    try {
      // ファイルサイズチェック（5MB上限）
      if (file.size > 5 * 1024 * 1024) {
        toast.error('画像は5MB以下にしてください')
        return null
      }

      const ext = file.name.split('.').pop() || 'jpg'
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const filePath = `products/${fileName}`

      const { error } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (error) throw error

      // 公開URLを取得
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath)

      return urlData.publicUrl
    } catch (err) {
      console.error('Image upload error:', err)
      toast.error('画像のアップロードに失敗しました')
      return null
    } finally {
      setUploading(false)
    }
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // ローカルプレビュー表示
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImagePreview(ev.target?.result as string)
    }
    reader.readAsDataURL(file)

    // Supabase Storage にアップロード
    const url = await uploadImage(file)
    if (url) {
      setImageUrl(url)
      toast.success('画像をアップロードしました')
    } else {
      // アップロード失敗時はプレビューをクリア
      setImagePreview(imageUrl)
    }

    // input をリセット
    e.target.value = ''
  }

  const handleRemoveImage = async () => {
    // 古い画像をStorageから削除
    if (imageUrl) {
      try {
        const path = imageUrl.split('/product-images/')[1]
        if (path) {
          await supabase.storage.from('product-images').remove([path])
        }
      } catch {
        // 削除失敗は無視（古いURLの場合など）
      }
    }
    setImageUrl(null)
    setImagePreview(null)
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('商品名を入力してください')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        internal_barcode: barcode.trim() || null,
        image_url: imageUrl,
        current_stock: parseInt(stock) || 0,
        default_unit_price: parseInt(price) || 0,
        memo: memo.trim() || null,
      }
      if (isEdit) {
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', id)
        if (error) throw error
        toast.success('商品を更新しました')
      } else {
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw error
        toast.success('商品を登録しました')
      }
      navigate('/products')
    } catch {
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      // 画像も削除
      if (imageUrl) {
        try {
          const path = imageUrl.split('/product-images/')[1]
          if (path) {
            await supabase.storage.from('product-images').remove([path])
          }
        } catch {
          // 無視
        }
      }
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
      toast.success('商品を削除しました')
      navigate('/products')
    } catch {
      toast.error('削除に失敗しました。入出庫データが存在する可能性があります。')
    }
  }

  return (
    <div className="page-transition space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-xl hover:bg-accent transition-colors" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold tracking-tight">
          {isEdit ? '商品編集' : '商品登録'}
        </h1>
        {isEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto rounded-xl text-destructive hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>商品を削除しますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  この操作は取り消せません。入出庫データがある場合は削除できません。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-rose-500 hover:bg-rose-600 rounded-xl">削除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* ヘッダーバナー */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500 p-5 text-white shadow-lg shadow-slate-700/15">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight">{isEdit ? '商品情報を編集' : '新しい商品を登録'}</p>
            <p className="text-[13px] text-white/60">商品名・画像・バーコード・在庫数・単価</p>
          </div>
        </div>
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/[0.06]" />
        <div className="absolute -bottom-4 right-6 h-16 w-16 rounded-full bg-white/[0.04]" />
      </div>

      <div className="space-y-3">
        {/* 商品名 */}
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="p-5 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                <Package className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </div>
              <Label htmlFor="name" className="text-sm font-semibold">商品名 *</Label>
            </div>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="商品名を入力"
              className="rounded-xl bg-white dark:bg-white/5 border-border/60"
            />
          </CardContent>
        </Card>

        {/* 商品画像 */}
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="p-5 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-950">
                <ImagePlus className="h-4 w-4 text-sky-500" />
              </div>
              <Label className="text-sm font-semibold">商品画像</Label>
            </div>

            {imagePreview ? (
              <div className="relative">
                <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-slate-50 dark:bg-slate-900">
                  <img
                    src={imagePreview}
                    alt="商品画像"
                    className="w-full h-48 object-contain"
                  />
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-2xl">
                      <div className="flex items-center gap-2 text-white text-sm font-medium">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        アップロード中...
                      </div>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-white dark:bg-slate-800 shadow-md border-rose-200 dark:border-rose-800 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
                  onClick={handleRemoveImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-24 rounded-2xl border-dashed border-2 border-border/60 hover:border-sky-300 hover:bg-sky-50/50 dark:hover:bg-sky-950/30 transition-all flex flex-col gap-1.5"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Camera className="h-6 w-6 text-sky-500" />
                  <span className="text-xs text-muted-foreground">カメラで撮影</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-24 rounded-2xl border-dashed border-2 border-border/60 hover:border-violet-300 hover:bg-violet-50/50 dark:hover:bg-violet-950/30 transition-all flex flex-col gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <ImagePlus className="h-6 w-6 text-violet-500" />
                  <span className="text-xs text-muted-foreground">ライブラリから選択</span>
                </Button>
              </div>
            )}

            {/* 画像がある場合の差し替えボタン */}
            {imagePreview && !uploading && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-xl text-xs border-border/60"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="mr-1.5 h-3.5 w-3.5" />
                  撮り直す
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-xl text-xs border-border/60"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                  別の画像を選択
                </Button>
              </div>
            )}

            {/* 隠しファイル入力 */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageSelect}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
          </CardContent>
        </Card>

        {/* バーコード */}
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="p-5 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950">
                <Barcode className="h-4 w-4 text-violet-500" />
              </div>
              <Label htmlFor="barcode" className="text-sm font-semibold">管理バーコード</Label>
            </div>
            <div className="flex gap-2">
              <Input
                id="barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="手入力 or 貼り付け"
                inputMode="text"
                enterKeyHint="done"
                className="flex-1 rounded-xl font-mono bg-white dark:bg-white/5 border-border/60"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-xl border-violet-200 dark:border-violet-800 text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950 transition-colors"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText()
                    if (text.trim()) {
                      setBarcode(text.trim())
                      toast.success(`貼り付け: ${text.trim()}`)
                    } else {
                      toast.error('クリップボードが空です')
                    }
                  } catch {
                    toast.error('クリップボードへのアクセスが許可されていません')
                  }
                }}
                title="貼り付け"
              >
                <ClipboardPaste className="h-4 w-4" />
              </Button>
              <BarcodeScanButton
                onScan={(code) => {
                  setBarcode(code)
                  toast.success(`バーコード読取: ${code}`)
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* 在庫数 & 単価 */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
            <CardContent className="p-5 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950">
                  <Boxes className="h-4 w-4 text-emerald-500" />
                </div>
                <Label htmlFor="stock" className="text-sm font-semibold">現在庫数</Label>
              </div>
              <Input
                id="stock"
                type="number"
                inputMode="numeric"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="rounded-xl text-center text-lg font-bold num-display bg-white dark:bg-white/5 border-border/60"
              />
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
            <CardContent className="p-5 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950">
                  <JapaneseYen className="h-4 w-4 text-amber-500" />
                </div>
                <Label htmlFor="price" className="text-sm font-semibold">単価 (円)</Label>
              </div>
              <Input
                id="price"
                type="number"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="rounded-xl text-center text-lg font-bold num-display bg-white dark:bg-white/5 border-border/60"
              />
            </CardContent>
          </Card>
        </div>

        {/* メモ */}
        <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
          <CardContent className="p-5 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <Label htmlFor="memo" className="text-sm font-semibold">メモ</Label>
            </div>
            <Textarea
              id="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="メモ"
              rows={3}
              className="rounded-xl bg-white dark:bg-white/5 border-border/60"
            />
          </CardContent>
        </Card>

        {/* 保存ボタン */}
        <Button
          className="w-full rounded-2xl shadow-lg h-12 text-[13px] font-semibold bg-slate-800 text-white shadow-slate-800/20 hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 transition-all duration-300"
          size="lg"
          onClick={handleSave}
          disabled={saving || uploading}
        >
          {uploading ? '画像アップロード中...' : saving ? '保存中...' : isEdit ? '更新する' : '登録する'}
        </Button>
      </div>
    </div>
  )
}
