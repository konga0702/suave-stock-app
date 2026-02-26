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
 *
 * 【iOS スクロールズレ対策】
 * iOS Safari では position:fixed のオーバーレイがスクロール量だけ下にズレる問題がある。
 * モーダルを開く際に body を position:fixed で固定し、閉じる際にスクロール位置を復元することで対処。
 */
export function BarcodeScanButton({ onScan, className }: BarcodeScanButtonProps) {
  const [open, setOpen] = useState(false)
  const receivedRef = useRef(false)
  const scrollYRef = useRef(0)

  /** body を固定してスクロールズレを防ぐ */
  const lockBodyScroll = () => {
    scrollYRef.current = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollYRef.current}px`
    document.body.style.width = '100%'
    document.body.style.overflowY = 'scroll'
  }

  /** body の固定を解除し、スクロール位置を復元する */
  const unlockBodyScroll = () => {
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    document.body.style.overflowY = ''
    window.scrollTo(0, scrollYRef.current)
  }

  const handleOpen = () => {
    receivedRef.current = false
    lockBodyScroll()
    setOpen(true)
  }

  const handleClose = () => {
    unlockBodyScroll()
    setOpen(false)
    console.log('[BarcodeScanButton] overlay closed')
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

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm">
            <BarcodeScanner
              onScan={handleScan}
              onClose={handleClose}
            />
          </div>
        </div>
      )}
    </>
  )
}
