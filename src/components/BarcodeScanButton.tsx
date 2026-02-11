import { useState } from 'react'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BarcodeScanner } from '@/components/BarcodeScanner'

interface BarcodeScanButtonProps {
  onScan: (value: string) => void
  className?: string
}

/**
 * カメラアイコンボタン → 押すとオーバーレイでリアルタイムバーコードスキャナーを表示。
 * PhotoScanner の置き換え用。html5-qrcode ベースで1次元バーコード対応。
 */
export function BarcodeScanButton({ onScan, className }: BarcodeScanButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={`shrink-0 rounded-xl border-border/60 hover:bg-accent transition-colors ${className ?? ''}`}
        onClick={() => setOpen(true)}
        title="カメラで読み取り"
      >
        <Camera className="h-4 w-4" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm">
            <BarcodeScanner
              onScan={(value) => {
                setOpen(false)
                onScan(value)
              }}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
