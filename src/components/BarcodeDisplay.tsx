import { useEffect, useRef } from 'react'

interface BarcodeDisplayProps {
  value: string
  label?: string
}

export function BarcodeDisplay({ value, label }: BarcodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !value) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const barWidth = 3
    const height = 120
    const padding = 40
    const chars = value.split('')
    const totalWidth = chars.length * 7 * barWidth + padding * 2 + (chars.length - 1) * barWidth

    canvas.width = totalWidth
    canvas.height = height + 40

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Simple Code128-like barcode rendering
    ctx.fillStyle = '#000000'
    let x = padding

    for (const char of chars) {
      const code = char.charCodeAt(0)
      // Generate a pattern from the character code
      const pattern = [
        (code >> 6) & 1, 1, (code >> 5) & 1, (code >> 4) & 1,
        1, (code >> 3) & 1, (code >> 2) & 1,
      ]
      for (const bit of pattern) {
        if (bit) {
          ctx.fillRect(x, 10, barWidth, height)
        }
        x += barWidth
      }
      x += barWidth // gap between chars
    }

    // Draw text below
    ctx.fillStyle = '#000000'
    ctx.font = 'bold 18px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(value, canvas.width / 2, height + 32)
  }, [value])

  return (
    <div className="flex flex-col items-center gap-2">
      {label && <p className="text-sm font-medium text-muted-foreground">{label}</p>}
      <canvas
        ref={canvasRef}
        className="max-w-full rounded border bg-white p-2"
      />
    </div>
  )
}
