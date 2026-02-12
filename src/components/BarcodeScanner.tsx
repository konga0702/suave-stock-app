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
  const stoppedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [lastValue, setLastValue] = useState<string>('')
  const [status, setStatus] = useState<string>('カメラ起動中...')

  useEffect(() => {
    let mounted = true
    const scannerId = 'barcode-scanner-' + Date.now()
    if (containerRef.current) {
      containerRef.current.id = scannerId
    }

    scannedRef.current = false
    stoppedRef.current = false

    let scanner: Html5Qrcode | null = null

    // ── 安全にスキャナーを停止するヘルパー ──
    const safeStop = async (s: Html5Qrcode): Promise<void> => {
      if (stoppedRef.current) return
      stoppedRef.current = true
      try {
        console.log('[BarcodeScanner] stop 開始')
        await s.stop()
        console.log('[BarcodeScanner] stop 完了')
      } catch {
        console.log('[BarcodeScanner] stop 失敗 (既に停止済み)')
      }
      try {
        s.clear()
        console.log('[BarcodeScanner] clear 完了')
      } catch {
        // clear 失敗は無視
      }
    }

    try {
      scanner = new Html5Qrcode(scannerId, {
        formatsToSupport: SUPPORTED_FORMATS,
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      })
      scannerRef.current = scanner

      console.log('[BarcodeScanner] scanner 初期化完了')

      scanner
        .start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 280, height: 150 },
            aspectRatio: 1.7778,
            disableFlip: false,
          },
          // ── onScanSuccess: 非同期で安全に処理 ──
          (decodedText: string) => {
            // 二重発火を防止
            if (scannedRef.current) return
            scannedRef.current = true

            console.log('[BarcodeScanner] スキャン成功 raw:', decodedText)

            // 値を整形（URLならパス末尾だけ取る）
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

            console.log('[BarcodeScanner] 整形後の値:', value)

            // デバッグ表示を更新
            if (mounted) {
              setLastValue(value)
              setStatus('読取成功! カメラ停止中...')
            }

            // ── 非同期で安全に終了 ──
            // 1) まず scanner.stop() の Promise 完了を待つ
            // 2) 完了後に setTimeout で一息ついてから onScan を呼ぶ
            const finalize = async () => {
              try {
                console.log('[BarcodeScanner] カメラ停止開始')
                if (scanner) {
                  await safeStop(scanner)
                }
                console.log('[BarcodeScanner] カメラ停止完了 → 値セット開始')

                if (mounted) {
                  setStatus('値セット完了: ' + value)
                }

                // stop() 完了後、少し待ってから親に値を渡す
                // (React の描画サイクルとの競合を回避)
                setTimeout(() => {
                  try {
                    console.log('[BarcodeScanner] onScan 呼び出し:', value)
                    onScan(value)
                    console.log('[BarcodeScanner] onScan 完了')
                  } catch (e) {
                    console.error('[BarcodeScanner] onScan エラー:', e)
                  }
                }, 300)
              } catch (e) {
                console.error('[BarcodeScanner] finalize エラー:', e)
                // エラーでも値だけは渡す
                setTimeout(() => {
                  try { onScan(value) } catch { /* 最終手段 */ }
                }, 300)
              }
            }

            finalize()
          },
          // ── onScanFailure (毎フレーム呼ばれるので無視) ──
          () => {}
        )
        .then(() => {
          console.log('[BarcodeScanner] カメラ起動成功')
          if (mounted) setStatus('スキャン待機中...')
        })
        .catch((err: unknown) => {
          console.error('[BarcodeScanner] start error:', err)
          if (mounted) {
            setError('カメラを起動できませんでした。カメラの許可を確認してください。')
          }
        })
    } catch (e) {
      console.error('[BarcodeScanner] init error:', e)
      if (mounted) {
        setError('スキャナーの初期化に失敗しました: ' + String(e))
      }
    }

    // ── クリーンアップ: 確実に stop を実行 ──
    return () => {
      mounted = false
      console.log('[BarcodeScanner] クリーンアップ開始')
      if (scanner) {
        safeStop(scanner)
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
      {/* デバッグ: ステータス & 最後に読み取った値 */}
      <div className="bg-background px-3 py-2 text-center space-y-1">
        <div className="text-[10px] text-muted-foreground">
          {status}
        </div>
        <div className="rounded-lg bg-muted px-3 py-1.5 text-xs font-mono">
          最後に読み取った値：[ {lastValue || '---'} ]
        </div>
        <div className="text-[9px] text-muted-foreground/50">
          EAN-13 / EAN-8 / CODE-128 / CODE-39 / UPC-A / UPC-E / QR
        </div>
      </div>
    </div>
  )
}
