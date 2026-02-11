import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Package, ArrowLeftRight, LayoutDashboard, ScanSearch, TrendingUp } from 'lucide-react'

const navItems = [
  { path: '/', label: 'ホーム', icon: LayoutDashboard, color: 'text-indigo-500' },
  { path: '/products', label: '商品', icon: Package, color: 'text-teal-500' },
  { path: '/transactions', label: '入出庫', icon: ArrowLeftRight, color: 'text-amber-500' },
  { path: '/inventory', label: '追跡', icon: ScanSearch, color: 'text-sky-500' },
  { path: '/profit', label: '利益', icon: TrendingUp, color: 'text-emerald-500' },
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
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-around">
          {navItems.map(({ path, label, icon: Icon, color }) => {
            const isActive = path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path)
            return (
              <Link
                key={path}
                to={path}
                className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] transition-all duration-200 ${
                  isActive
                    ? `${color} font-semibold scale-105`
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {isActive && (
                  <span className="absolute -top-0.5 h-0.5 w-8 rounded-full bg-current" />
                )}
                <Icon className={`h-5 w-5 transition-transform duration-200 ${isActive ? 'drop-shadow-sm' : ''}`} />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
