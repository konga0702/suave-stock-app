import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Button } from '@/components/ui/button'
import { Camera, X } from 'lucide-react'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose?: () => void
}

// 対応フォーマットを明示的に指定
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
]

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scannedRef = useRef(false)
  const mountedRef = useRef(true)
  const [error, setError] = useState<string | null>(null)
  const [lastValue, setLastValue] = useState<string>('')

  useEffect(() => {
    mountedRef.current = true

    const scannerId = 'barcode-scanner-' + Date.now()
    if (containerRef.current) {
      containerRef.current.id = scannerId
    }

    scannedRef.current = false

    let scanner: Html5Qrcode | null = null

    try {
      scanner = new Html5Qrcode(scannerId, {
        formatsToSupport: SUPPORTED_FORMATS,
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      })
      scannerRef.current = scanner

      scanner
        .start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 280, height: 150 },
            aspectRatio: 1.7778,
            disableFlip: false,
          },
          // ── onScanSuccess ──
          (decodedText: string) => {
            try {
              // 1) 二重発火を防止
              if (scannedRef.current) return
              scannedRef.current = true

              // 2) 値を整形（URLならパス末尾だけ取る）
              let value = decodedText.trim()
              if (/^https?:\/\//i.test(value)) {
                try {
                  const u = new URL(value)
                  const seg = u.pathname.split('/').filter(Boolean)
                  value = seg.length > 0 ? seg[seg.length - 1] : value
                } catch {
                  // パース失敗ならそのまま
                }
              }

              // 3) デバッグ: console.log
              console.log('[BarcodeScanner] 読取成功:', value)

              // 4) デバッグ表示を更新
              if (mountedRef.current) {
                setLastValue(value)
              }

              // 5) スキャナー停止
              if (scanner) {
                scanner.stop().catch(() => {})
              }

              // 6) alert で通知 → その後に値を親へ渡す
              //    alert はブロッキングなのでスキャナー停止後に実行
              setTimeout(() => {
                try {
                  alert('読取成功: ' + value)
                } catch {
                  // alert が失敗しても続行
                }
                try {
                  onScan(value)
                } catch (e) {
                  console.error('[BarcodeScanner] onScan error:', e)
                  alert('エラー: ' + String(e))
                }
              }, 200)
            } catch (e) {
              console.error('[BarcodeScanner] handleSuccess error:', e)
              alert('スキャン処理エラー: ' + String(e))
            }
          },
          // ── onScanFailure (毎フレーム呼ばれるので無視) ──
          () => {}
        )
        .catch((err: unknown) => {
          if (mountedRef.current) {
            setError('カメラを起動できませんでした。カメラの許可を確認してください。')
          }
          console.error('[BarcodeScanner] start error:', err)
        })
    } catch (e) {
      console.error('[BarcodeScanner] init error:', e)
      if (mountedRef.current) {
        setError('スキャナーの初期化に失敗しました: ' + String(e))
      }
    }

    return () => {
      mountedRef.current = false
      if (scanner) {
        scanner.stop().catch(() => {})
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-black shadow-lg">
      <div className="flex items-center justify-between border-b bg-background px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
            <Camera className="h-3.5 w-3.5 text-indigo-500" />
          </div>
          バーコード読み取り
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-red-50 hover:text-red-500" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {error ? (
        <div className="p-6 text-center text-sm text-destructive">{error}</div>
      ) : (
        <div ref={containerRef} className="aspect-video w-full" />
      )}
      {/* デバッグ: 最後に読み取った値 */}
      <div className="bg-background px-3 py-2 text-center">
        <div className="text-[10px] text-muted-foreground">
          EAN-13 / EAN-8 / CODE-128 / CODE-39 / UPC-A / UPC-E / QR対応
        </div>
        <div className="mt-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-mono">
          最後に読み取った値：[ {lastValue || '---'} ]
        </div>
      </div>
    </div>
  )
}
