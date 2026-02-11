import { useRef, useState, useCallback } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import jsQR from 'jsqr'

interface PhotoScannerProps {
  onScan: (value: string) => void
  className?: string
}

/** 画像をリサイズして canvas に描画し ImageData を返す */
function resizeToCanvas(
  source: HTMLImageElement,
  maxSize: number
): { canvas: HTMLCanvasElement; imageData: ImageData } {
  const canvas = document.createElement('canvas')
  let { naturalWidth: w, naturalHeight: h } = source
  if (w > maxSize || h > maxSize) {
    const ratio = Math.min(maxSize / w, maxSize / h)
    w = Math.round(w * ratio)
    h = Math.round(h * ratio)
  }
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, w, h)
  return { canvas, imageData: ctx.getImageData(0, 0, w, h) }
}

/** File → HTMLImageElement に読み込む */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('画像の読み込みに失敗'))
    }
    img.src = URL.createObjectURL(file)
  })
}

/** 1つの解像度でデコードを試行（非同期で1フレーム挟む） */
function decodeAtSize(
  img: HTMLImageElement,
  maxSize: number
): Promise<string | null> {
  return new Promise((resolve) => {
    // 1フレーム待ってからデコード → UIをブロックしない
    requestAnimationFrame(() => {
      const { imageData } = resizeToCanvas(img, maxSize)
      const result = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      })
      resolve(result?.data ?? null)
    })
  })
}

const TIMEOUT_MS = 10_000

/** jsQR で複数解像度を試す（タイムアウト付き） */
function tryDecode(img: HTMLImageElement): Promise<string | null> {
  return new Promise((resolve) => {
    // タイムアウト: 万が一固まっても10秒で強制終了
    const timer = setTimeout(() => resolve(null), TIMEOUT_MS)

    ;(async () => {
      // 小さいサイズから試す（速度重視）→ 大きいサイズ（精度重視）
      for (const size of [800, 1200, 1600]) {
        const result = await decodeAtSize(img, size)
        if (result) {
          clearTimeout(timer)
          resolve(result)
          return
        }
      }
      clearTimeout(timer)
      resolve(null)
    })()
  })
}

/**
 * カメラ撮影→QR/バーコードデコード コンポーネント
 *
 * <input type="file" capture="environment"> でiOSネイティブカメラを起動。
 * 撮影画像をリサイズしてからデコードし、ブラウザのフリーズを防止。
 */
export function PhotoScanner({ onScan, className }: PhotoScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)

  const handleCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      // input をリセット
      if (inputRef.current) inputRef.current.value = ''

      setScanning(true)
      toast.info('読み取り中...')

      try {
        const img = await loadImage(file)
        const decoded = await tryDecode(img)

        if (decoded) {
          onScan(decoded)
          toast.success(`読取成功: ${decoded}`)
        } else {
          toast.error(
            'QR/バーコードを読み取れませんでした。\nQRコードを大きく映して再撮影してください。'
          )
        }
      } catch {
        toast.error('画像の処理に失敗しました')
      } finally {
        setScanning(false)
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
        disabled={scanning}
        title="カメラで読み取り"
      >
        {scanning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
      </Button>
    </>
  )
}
