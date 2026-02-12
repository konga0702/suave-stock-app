import { BoxSelect } from 'lucide-react'

export function InventoryPage() {
  return (
    <div className="page-transition space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">個体追跡</h1>
      </div>

      <div className="flex flex-col items-center gap-3 py-16 text-center animate-fade-in">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <BoxSelect className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <p className="text-sm text-muted-foreground">
          個体追跡機能は準備中です
        </p>
        <p className="text-xs text-muted-foreground/60">
          今後のアップデートで利用可能になります
        </p>
      </div>
    </div>
  )
}
