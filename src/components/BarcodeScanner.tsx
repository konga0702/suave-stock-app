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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const scannerId = 'barcode-scanner-' + Date.now()
    if (containerRef.current) {
      containerRef.current.id = scannerId
    }

    const scanner = new Html5Qrcode(scannerId, {
      formatsToSupport: SUPPORTED_FORMATS,
      useBarCodeDetectorIfSupported: true,
    })
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 280, height: 150 },
          aspectRatio: 1.7778,
          disableFlip: false,
        },
        (decodedText) => {
          onScan(decodedText)
          scanner.stop().catch(() => {})
        },
        () => {}
      )
      .catch((err: unknown) => {
        setError('カメラを起動できませんでした。カメラの許可を確認してください。')
        console.error('Scanner error:', err)
      })

    return () => {
      scanner.stop().catch(() => {})
    }
  }, [onScan])

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
      <div className="bg-background px-3 py-2 text-center text-[10px] text-muted-foreground">
        EAN-13 / EAN-8 / CODE-128 / CODE-39 / UPC-A / UPC-E / QR対応
      </div>
    </div>
  )
}
