import { useState, useRef } from 'react'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BarcodeScanner } from '@/components/BarcodeScanner'

interface BarcodeScanButtonProps {
  onScan: (value: string) => void
  className?: string
}

/**
 * カメラアイコンボタン → 押すとオーバーレイでリアルタイムバーコードスキャナーを表示。
 * スキャン成功 → alert → 値をStateにセット → オーバーレイを閉じる。
 * ページ遷移・API呼び出しは一切行わない。
 */
export function BarcodeScanButton({ onScan, className }: BarcodeScanButtonProps) {
  const [open, setOpen] = useState(false)
  const receivedRef = useRef(false)

  const handleOpen = () => {
    receivedRef.current = false
    setOpen(true)
  }

  const handleScan = (value: string) => {
    try {
      // 二重呼び出し防止
      if (receivedRef.current) return
      receivedRef.current = true

      console.log('[BarcodeScanButton] received:', value)

      // 1) 値を親に渡す（= input の State にセットするだけ）
      onScan(value)

      // 2) オーバーレイを閉じる
      setOpen(false)
    } catch (e) {
      console.error('[BarcodeScanButton] handleScan error:', e)
      alert('BarcodeScanButton エラー: ' + String(e))
      setOpen(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={`shrink-0 rounded-xl border-border/60 hover:bg-accent transition-colors ${className ?? ''}`}
        onClick={handleOpen}
        title="カメラで読み取り"
      >
        <Camera className="h-4 w-4" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm">
            <BarcodeScanner
              onScan={handleScan}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
