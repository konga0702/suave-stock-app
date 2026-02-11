import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ScanBarcode, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { BarcodeScanner } from '@/components/BarcodeScanner'
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
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)

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
      }
    }
    load()
  }, [id])

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
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
      toast.success('商品を削除しました')
      navigate('/products')
    } catch {
      toast.error('削除に失敗しました。入出庫データが存在する可能性があります。')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">
          {isEdit ? '商品編集' : '商品登録'}
        </h1>
        {isEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>商品を削除しますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  この操作は取り消せません。入出庫データがある場合は削除できません。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>削除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">商品名 *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="商品名を入力"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="barcode">管理バーコード</Label>
          <div className="flex gap-2">
            <Input
              id="barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="バーコード番号"
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setScanning(!scanning)}
            >
              <ScanBarcode className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {scanning && (
          <BarcodeScanner
            onScan={(code) => {
              setBarcode(code)
              setScanning(false)
              toast.success(`バーコード読取: ${code}`)
            }}
            onClose={() => setScanning(false)}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="stock">現在庫数</Label>
            <Input
              id="stock"
              type="number"
              inputMode="numeric"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">単価 (円)</Label>
            <Input
              id="price"
              type="number"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="memo">メモ</Label>
          <Textarea
            id="memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="メモ"
            rows={3}
          />
        </div>

        <Button className="w-full" size="lg" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : isEdit ? '更新する' : '登録する'}
        </Button>
      </div>
    </div>
  )
}
