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
  source: HTMLCanvasElement | HTMLImageElement,
  maxSize: number
): ImageData {
  const canvas = document.createElement('canvas')
  const sw = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth
  const sh = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight
  let w = sw
  let h = sh
  if (w > maxSize || h > maxSize) {
    const ratio = Math.min(maxSize / w, maxSize / h)
    w = Math.round(w * ratio)
    h = Math.round(h * ratio)
  }
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

/**
 * File → Canvas に描画（iOS Safari 対応）
 *
 * createImageBitmap / new Image + ObjectURL の代わりに
 * FileReader で data URL を生成し Image に読み込む。
 * revokeObjectURL のタイミング問題を回避する。
 */
function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        // iPhone写真の元サイズをそのまま canvas に描画
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        resolve(canvas)
      }
      img.onerror = () => reject(new Error('画像の読み込みに失敗'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗'))
    reader.readAsDataURL(file)
  })
}

/** 1つの解像度でデコードを試行（非同期で1フレーム挟む） */
function decodeAtSize(
  source: HTMLCanvasElement,
  maxSize: number
): Promise<string | null> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      try {
        const imageData = resizeToCanvas(source, maxSize)
        const result = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        })
        resolve(result?.data ?? null)
      } catch {
        resolve(null)
      }
    })
  })
}

const TIMEOUT_MS = 10_000

/** jsQR で複数解像度を試す（タイムアウト付き） */
function tryDecode(
  source: HTMLCanvasElement
): Promise<{ result: string | null; triedSizes: string[] }> {
  return new Promise((resolve) => {
    const triedSizes: string[] = []
    const timer = setTimeout(
      () => resolve({ result: null, triedSizes: [...triedSizes, 'TIMEOUT'] }),
      TIMEOUT_MS
    )

    ;(async () => {
      for (const size of [800, 1200, 1600]) {
        const data = resizeToCanvas(source, size)
        triedSizes.push(`${size}→${data.width}x${data.height}`)

        const result = await decodeAtSize(source, size)
        if (result) {
          clearTimeout(timer)
          resolve({ result, triedSizes })
          return
        }
      }
      clearTimeout(timer)
      resolve({ result: null, triedSizes })
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
        // FileReader → data URL → Image → Canvas（iOS Safari安全ルート）
        const sourceCanvas = await fileToCanvas(file)
        const origSize = `${sourceCanvas.width}x${sourceCanvas.height}`

        const { result: decoded, triedSizes } = await tryDecode(sourceCanvas)

        if (decoded) {
          onScan(decoded)
          toast.success(`読取成功: ${decoded}`)
        } else {
          // デバッグ情報付きエラー（原因特定用）
          toast.error(
            `読み取れませんでした\n元画像: ${origSize}\n試行: ${triedSizes.join(', ')}`,
            { duration: 8000 }
          )
        }
      } catch (err) {
        toast.error(`エラー: ${err instanceof Error ? err.message : '不明'}`)
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
