import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Package, ArrowLeftRight, LayoutDashboard } from 'lucide-react'

const navItems = [
  { path: '/', label: 'ホーム', icon: LayoutDashboard },
  { path: '/products', label: '商品', icon: Package },
  { path: '/transactions', label: '入出庫', icon: ArrowLeftRight },
]

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="flex-1 overflow-y-auto pb-20">
        <div className="mx-auto max-w-lg px-4 py-4">
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-lg items-center justify-around">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path)
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors ${
                  isActive
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
