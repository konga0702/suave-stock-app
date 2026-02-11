import { useRef, useCallback } from 'react'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import jsQR from 'jsqr'
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser'
import { DecodeHintType } from '@zxing/library'

interface PhotoScannerProps {
  onScan: (value: string) => void
  className?: string
}

// ZXing reader をモジュールスコープで1度だけ生成
const hints = new Map<DecodeHintType, unknown>()
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
])
hints.set(DecodeHintType.TRY_HARDER, true)
const zxingReader = new BrowserMultiFormatReader(hints)

/**
 * カメラ撮影→QR/バーコードデコード コンポーネント
 *
 * <input type="file" capture="environment"> を使うことで
 * iPhone Safari / PWA でもネイティブカメラを直接起動でき、
 * getUserMedia の互換性問題を完全に回避する。
 */
export function PhotoScanner({ onScan, className }: PhotoScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      // input をリセット（同じファイルを連続で選んでも onChange が発火するように）
      if (inputRef.current) inputRef.current.value = ''

      try {
        // ① 画像を読み込み
        const bitmap = await createImageBitmap(file)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(bitmap, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

        // ② jsQR で QR コードを試行
        const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        })
        if (qrResult?.data) {
          onScan(qrResult.data)
          toast.success(`読取成功: ${qrResult.data}`)
          bitmap.close()
          return
        }

        // ③ QR 失敗 → ZXing で 1D バーコードを試行
        // canvas から直接デコード
        try {
          const zxResult = zxingReader.decodeFromCanvas(canvas)
          if (zxResult?.getText()) {
            onScan(zxResult.getText())
            toast.success(`読取成功: ${zxResult.getText()}`)
            bitmap.close()
            return
          }
        } catch {
          // ZXing もデコード失敗
        }

        // ④ 両方失敗
        toast.error('QR/バーコードを読み取れませんでした。もう一度撮影してください。')
        bitmap.close()
      } catch {
        toast.error('画像の処理に失敗しました')
      }
    },
    [onScan]
  )

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
        aria-hidden="true"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={`shrink-0 rounded-xl border-border/60 hover:bg-accent transition-colors ${className ?? ''}`}
        onClick={() => inputRef.current?.click()}
        title="カメラで読み取り"
      >
        <Camera className="h-4 w-4" />
      </Button>
    </>
  )
}
