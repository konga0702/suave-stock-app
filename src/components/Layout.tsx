import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Package, ArrowLeftRight, LayoutDashboard, ScanSearch, TrendingUp } from 'lucide-react'

const navItems = [
  { path: '/', label: 'ホーム', icon: LayoutDashboard },
  { path: '/products', label: '商品', icon: Package },
  { path: '/transactions', label: '入出庫', icon: ArrowLeftRight },
  { path: '/inventory', label: '追跡', icon: ScanSearch },
  { path: '/profit', label: '利益', icon: TrendingUp },
]

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="mx-auto max-w-lg px-5 py-5">
          {children}
        </div>
      </main>

      {/* Bottom Navigation - frosted glass */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass-card border-t border-border/40">
        <div className="mx-auto flex max-w-lg items-center justify-around px-2">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path)
            return (
              <Link
                key={path}
                to={path}
                className={`relative flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-medium transition-all duration-300 ${
                  isActive
                    ? 'text-slate-800 dark:text-white'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 h-[2.5px] w-7 rounded-full bg-slate-800 dark:bg-white transition-all duration-300" />
                )}
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-300 ${
                  isActive
                    ? 'bg-slate-100 dark:bg-slate-700 shadow-sm'
                    : ''
                }`}>
                  <Icon className={`h-[18px] w-[18px] transition-all duration-200 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
                </div>
                <span className={`transition-all duration-200 ${isActive ? 'font-semibold' : ''}`}>{label}</span>
              </Link>
            )
          })}
        </div>
        {/* Safe area padding for notched devices */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  )
}
