import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, ArrowDownToLine, ArrowUpFromLine,
  BarChart3,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

interface Stats {
  totalProducts: number
  netStock: number
  scheduledIn: number
  scheduledOut: number
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    netStock: 0,
    scheduledIn: 0,
    scheduledOut: 0,
  })

  useEffect(() => {
    async function loadStats() {
      const [productsRes, scheduledInRes, scheduledOutRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('type', 'IN').eq('status', 'SCHEDULED'),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('type', 'OUT').eq('status', 'SCHEDULED'),
      ])

      // 純在庫数を計算: 入荷商品数 - 出荷商品数（COMPLETED取引の明細から集計）
      const { data: inItems } = await supabase
        .from('transaction_items')
        .select('quantity, transaction:transactions!inner(type, status)')
        .eq('transaction.type' as string, 'IN')
        .eq('transaction.status' as string, 'COMPLETED')

      const { data: outItems } = await supabase
        .from('transaction_items')
        .select('quantity, transaction:transactions!inner(type, status)')
        .eq('transaction.type' as string, 'OUT')
        .eq('transaction.status' as string, 'COMPLETED')

      const totalIn = (inItems ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0)
      const totalOut = (outItems ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0)

      setStats({
        totalProducts: productsRes.count ?? 0,
        netStock: totalIn - totalOut,
        scheduledIn: scheduledInRes.count ?? 0,
        scheduledOut: scheduledOutRes.count ?? 0,
      })
    }
    loadStats()
  }, [])

  const statCards = [
    {
      label: '商品数',
      value: stats.totalProducts,
      icon: Package,
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      iconColor: 'text-slate-600 dark:text-slate-300',
      valueColor: '',
      href: '/products',
    },
    {
      label: '純在庫数',
      value: stats.netStock,
      icon: Package,
      iconBg: 'bg-emerald-50 dark:bg-emerald-950',
      iconColor: 'text-emerald-500',
      valueColor: 'text-emerald-600 dark:text-emerald-400',
      href: '/net-stock',
    },
    {
      label: '入庫予定',
      value: stats.scheduledIn,
      icon: ArrowDownToLine,
      iconBg: 'bg-sky-50 dark:bg-sky-950',
      iconColor: 'text-sky-500',
      valueColor: 'text-sky-600 dark:text-sky-400',
      href: '/transactions?tab=IN',
    },
    {
      label: '出庫予定',
      value: stats.scheduledOut,
      icon: ArrowUpFromLine,
      iconBg: 'bg-amber-50 dark:bg-amber-950',
      iconColor: 'text-amber-500',
      valueColor: 'text-amber-600 dark:text-amber-400',
      href: '/transactions?tab=OUT',
    },
  ]

  return (
    <div className="page-transition space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-700 to-slate-600 p-6 text-white shadow-xl shadow-slate-900/10 dark:from-slate-700 dark:via-slate-600 dark:to-slate-500">
        <div className="relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">在庫管理</h1>
              <p className="text-[13px] text-white/60">
                今日の在庫状況をひと目で確認
              </p>
            </div>
          </div>
        </div>
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/[0.06]" />
        <div className="absolute -bottom-6 right-8 h-20 w-20 rounded-full bg-white/[0.04]" />
        <div className="absolute left-1/2 top-0 h-12 w-12 rounded-full bg-white/[0.03]" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map(({ label, value, icon: Icon, iconBg, iconColor, valueColor, href }) => (
          <Link key={label} to={href} className="block">
            <Card className="overflow-hidden border-0 shadow-sm shadow-slate-200/50 dark:shadow-none transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <CardContent className="p-0">
                <div className="flex items-center gap-3 p-4">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconBg}`}>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground tracking-wide">{label}</p>
                    <p className={`text-2xl font-bold tracking-tight num-display ${valueColor}`}>{value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 pt-1">
        <Button
          asChild
          className="group w-full h-12 bg-slate-800 text-white shadow-lg shadow-slate-800/20 hover:bg-slate-700 hover:shadow-xl hover:shadow-slate-800/25 dark:bg-slate-200 dark:text-slate-900 dark:shadow-none dark:hover:bg-slate-300 transition-all duration-300 rounded-2xl text-[13px] font-semibold"
          size="lg"
        >
          <Link to="/transactions/new?type=IN">
            <ArrowDownToLine className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5" />
            新規入庫
          </Link>
        </Button>
        <Button
          asChild
          className="group w-full h-12 bg-amber-500 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 hover:shadow-xl hover:shadow-amber-500/25 dark:bg-amber-600 dark:hover:bg-amber-500 transition-all duration-300 rounded-2xl text-[13px] font-semibold"
          size="lg"
        >
          <Link to="/transactions/new?type=OUT">
            <ArrowUpFromLine className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5" />
            新規出庫
          </Link>
        </Button>
      </div>
    </div>
  )
}
