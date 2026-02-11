import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

interface QRCardProps {
  label: string
  value: string
  use: string
}

function QRCard({ label, value, use }: QRCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, value, {
      width: 200,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
  }, [value])

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm text-center">
      <span className="inline-block rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 mb-2">
        QR CODE
      </span>
      <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
      <p className="font-mono text-sm font-bold text-indigo-600 mb-3">{value}</p>
      <canvas ref={canvasRef} className="mx-auto" />
      <p className="text-[10px] text-muted-foreground mt-2">{use}</p>
    </div>
  )
}

interface BarcodeCardProps {
  format: string
  label: string
  value: string
  use: string
  type: 'code128' | 'ean13'
}

function BarcodeCard({ format, label, value, use, type }: BarcodeCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (type === 'code128') {
      drawCode128(canvasRef.current, value)
    } else {
      drawEAN13(canvasRef.current, value)
    }
  }, [value, type])

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm text-center">
      <span className="inline-block rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 mb-2">
        {format}
      </span>
      <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
      <p className="font-mono text-sm font-bold text-indigo-600 mb-3">{value}</p>
      <canvas ref={canvasRef} className="mx-auto" />
      <p className="text-[10px] text-muted-foreground mt-2">{use}</p>
    </div>
  )
}

// CODE-128B encoder
function drawCode128(canvas: HTMLCanvasElement, text: string) {
  const ctx = canvas.getContext('2d')!
  const CODE128B: Record<string, number> = {}
  const chars = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'
  for (let i = 0; i < chars.length; i++) CODE128B[chars[i]] = i

  const PATTERNS = [
    '11011001100','11001101100','11001100110','10010011000','10010001100',
    '10001001100','10011001000','10011000100','10001100100','11001001000',
    '11001000100','11000100100','10110011100','10011011100','10011001110',
    '10111001100','10011101100','10011100110','11001110010','11001011100',
    '11001001110','11011100100','11001110100','11101101110','11101001100',
    '11100101100','11100100110','11101100100','11100110100','11100110010',
    '11011011000','11011000110','11000110110','10100011000','10001011000',
    '10001000110','10110001000','10001101000','10001100010','11010001000',
    '11000101000','11000100010','10110111000','10110001110','10001101110',
    '10111011000','10111000110','10001110110','11101110110','11010001110',
    '11000101110','11011101000','11011100010','11011101110','11101011000',
    '11101000110','11100010110','11101101000','11101100010','11100011010',
    '11101111010','11001000010','11110001010','10100110000','10100001100',
    '10010110000','10010000110','10000101100','10000100110','10110010000',
    '10110000100','10011010000','10011000010','10000110100','10000110010',
    '11000010010','11001010000','11110111010','11000010100','10001111010',
    '10100111100','10010111100','10010011110','10111100100','10011110100',
    '10011110010','11110100100','11110010100','11110010010','11011011110',
    '11011110110','11110110110','10101111000','10100011110','10001011110',
    '10111101000','10111100010','11110101000','11110100010','10111011110',
    '10111101110','11101011110','11110101110',
    '11010000100',
    '1100011101011',
  ]

  let encoded = PATTERNS[104] // Start B
  let checksum = 104
  for (let i = 0; i < text.length; i++) {
    const val = CODE128B[text[i]]
    if (val === undefined) continue
    encoded += PATTERNS[val]
    checksum += val * (i + 1)
  }
  checksum = checksum % 103
  encoded += PATTERNS[checksum]
  encoded += PATTERNS[PATTERNS.length - 1] // Stop

  const barWidth = 2
  const height = 70
  const width = encoded.length * barWidth + 20
  canvas.width = width
  canvas.height = height + 24
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, canvas.height)
  ctx.fillStyle = '#000000'
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '1') ctx.fillRect(10 + i * barWidth, 4, barWidth, height)
  }
  ctx.fillStyle = '#333'
  ctx.font = '12px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText(text, width / 2, height + 18)
}

// EAN-13 encoder
function drawEAN13(canvas: HTMLCanvasElement, digits: string) {
  const ctx = canvas.getContext('2d')!
  const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
  const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111']
  const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100']
  const FD = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']

  const d = digits.split('').map(Number)
  const pat = FD[d[0]]
  let enc = '101'
  for (let i = 0; i < 6; i++) enc += pat[i] === 'L' ? L[d[i+1]] : G[d[i+1]]
  enc += '01010'
  for (let i = 0; i < 6; i++) enc += R[d[i+7]]
  enc += '101'

  const barWidth = 2
  const height = 80
  const width = enc.length * barWidth + 30
  canvas.width = width
  canvas.height = height + 24
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, canvas.height)
  ctx.fillStyle = '#000000'
  for (let i = 0; i < enc.length; i++) {
    if (enc[i] === '1') ctx.fillRect(15 + i * barWidth, 4, barWidth, height)
  }
  ctx.fillStyle = '#333'
  ctx.font = '13px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText(digits, width / 2, height + 18)
}

export function TestBarcodesPage() {
  return (
    <div className="space-y-4 pb-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-5 text-white shadow-lg">
        <div className="relative z-10">
          <p className="text-lg font-bold">テスト用バーコード＆QR</p>
          <p className="text-sm text-white/80">別画面に表示してスキャンテストに使用</p>
        </div>
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
      </div>

      <p className="text-xs text-center text-muted-foreground">
        QRコード・バーコードをスマホカメラで読み取ってテスト
      </p>

      {/* QR Codes */}
      <QRCard
        label="店舗管理番号"
        value="SHOP-2025-0001"
        use="→ 入出庫フォーム「店舗管理番号」スキャン用"
      />
      <QRCard
        label="配送追跡番号"
        value="JP1234567890"
        use="→ 入出庫フォーム「配送追跡番号」スキャン用"
      />
      <QRCard
        label="注文ID"
        value="ORD-20250211-001"
        use="→ 入出庫フォーム「注文ID」スキャン用"
      />
      <QRCard
        label="商品バーコード（QR形式）"
        value="4901234567894"
        use="→ 商品マスタ「管理バーコード」スキャン用"
      />

      {/* 1D Barcodes */}
      <BarcodeCard
        format="CODE-128"
        label="店舗管理番号（バーコード）"
        value="SHOP-2025-0001"
        use="→ 入出庫フォーム「店舗管理番号」スキャン用"
        type="code128"
      />
      <BarcodeCard
        format="EAN-13"
        label="商品バーコード"
        value="4901234567894"
        use="→ 商品マスタ「管理バーコード」スキャン用"
        type="ean13"
      />
    </div>
  )
}
