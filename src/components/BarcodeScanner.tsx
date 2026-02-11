import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Button } from '@/components/ui/button'
import { Camera, X } from 'lucide-react'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose?: () => void
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const scannerId = 'barcode-scanner-' + Date.now()
    if (containerRef.current) {
      containerRef.current.id = scannerId
    }

    const scanner = new Html5Qrcode(scannerId)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
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
    <div className="relative rounded-lg border bg-black">
      <div className="flex items-center justify-between border-b bg-background px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Camera className="h-4 w-4" />
          バーコード読み取り
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {error ? (
        <div className="p-4 text-center text-sm text-destructive">{error}</div>
      ) : (
        <div ref={containerRef} className="aspect-video w-full" />
      )}
    </div>
  )
}
