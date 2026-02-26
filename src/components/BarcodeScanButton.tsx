import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
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
 *
 * 【iOS スクロールズレの根本原因と対策】
 * Layout.tsx の <main className="overflow-y-auto"> 内に position:fixed を置くと、
 * iOS Safari では固定がビューポート基準ではなくスクロールコンテナ基準になるため、
 * スクロール量だけオーバーレイが下にズレて表示される。
 *
 * → createPortal で <body> 直下にオーバーレイをレンダリングすることで
 *   overflow:auto な親コンテナの影響を完全に回避する。
 * → 加えて、開いている間は <main> のスクロールを止めて背景が動かないようにする。
 */
export function BarcodeScanButton({ onScan, className }: BarcodeScanButtonProps) {
  const [open, setOpen] = useState(false)
  const receivedRef = useRef(false)
  const mainScrollTopRef = useRef(0)

  /** スクロールコンテナ（<main>）を取得する */
  const getMainEl = (): HTMLElement | null =>
    document.querySelector('main')

  /** カメラを開く：<main> のスクロールを止める */
  const handleOpen = () => {
    receivedRef.current = false
    const main = getMainEl()
    if (main) {
      mainScrollTopRef.current = main.scrollTop
      main.style.overflow = 'hidden'
    }
    setOpen(true)
  }

  /** カメラを閉じる：<main> のスクロールを復元する */
  const handleClose = () => {
    const main = getMainEl()
    if (main) {
      main.style.overflow = ''
      main.scrollTop = mainScrollTopRef.current
    }
    setOpen(false)
  }

  const handleScan = (value: string) => {
    if (receivedRef.current) return
    receivedRef.current = true

    console.log('[BarcodeScanButton] received:', value)

    try {
      onScan(value)
      console.log('[BarcodeScanButton] onScan 完了')
    } catch (e) {
      console.error('[BarcodeScanButton] onScan error:', e)
    }

    // 100ms 待ってからオーバーレイを閉じる
    setTimeout(() => {
      handleClose()
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

      {/* createPortal で <body> 直下にマウント → overflow:auto な親の影響を受けない */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm">
            <BarcodeScanner
              onScan={handleScan}
              onClose={handleClose}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
