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
 *
 * 【重要】BarcodeScanner は onScan を呼ぶ前に scanner.stop() を完了させている。
 * この handleScan が呼ばれた時点ではカメラは既に停止済みなので、
 * 安全にオーバーレイを閉じて (setOpen(false)) コンポーネントをアンマウントできる。
 * 念のため 100ms の遅延を入れて React 描画サイクルとの干渉を防ぐ。
 */
export function BarcodeScanButton({ onScan, className }: BarcodeScanButtonProps) {
  const [open, setOpen] = useState(false)
  const receivedRef = useRef(false)

  const handleOpen = () => {
    receivedRef.current = false
    setOpen(true)
  }

  const handleScan = (value: string) => {
    // 二重呼び出し防止
    if (receivedRef.current) return
    receivedRef.current = true

    console.log('[BarcodeScanButton] received:', value)

    // この時点で BarcodeScanner 内のカメラは既に stop() 完了済み。
    // 1) まず値を親コンポーネントの State にセット
    try {
      onScan(value)
      console.log('[BarcodeScanButton] onScan 完了')
    } catch (e) {
      console.error('[BarcodeScanButton] onScan error:', e)
    }

    // 2) 100ms 待ってからオーバーレイを閉じる (アンマウント)
    //    → BarcodeScanner の cleanup が走っても scanner は既に停止済みなので安全
    setTimeout(() => {
      setOpen(false)
      console.log('[BarcodeScanButton] overlay closed')
    }, 100)
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
