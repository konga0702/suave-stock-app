import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, ArrowDownToLine, ArrowUpFromLine, AlertTriangle,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

interface Stats {
  totalProducts: number
  lowStockCount: number
  scheduledIn: number
  scheduledOut: number
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    lowStockCount: 0,
    scheduledIn: 0,
    scheduledOut: 0,
  })

  useEffect(() => {
    async function loadStats() {
      const [productsRes, lowStockRes, scheduledInRes, scheduledOutRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }).lte('current_stock', 5),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('type', 'IN').eq('status', 'SCHEDULED'),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('type', 'OUT').eq('status', 'SCHEDULED'),
      ])
      setStats({
        totalProducts: productsRes.count ?? 0,
        lowStockCount: lowStockRes.count ?? 0,
        scheduledIn: scheduledInRes.count ?? 0,
        scheduledOut: scheduledOutRes.count ?? 0,
      })
    }
    loadStats()
  }, [])

  return (
    <div className="space-y-5">
      {/* Header with gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-5 text-white shadow-lg">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <h1 className="text-lg font-bold">在庫管理</h1>
          </div>
          <p className="mt-1 text-sm text-white/80">
            今日の在庫状況をひと目で確認
          </p>
        </div>
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute -bottom-4 -right-2 h-16 w-16 rounded-full bg-white/10" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="overflow-hidden border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
                <Package className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">商品数</p>
                <p className="text-2xl font-bold tracking-tight">{stats.totalProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">在庫少</p>
                <p className="text-2xl font-bold tracking-tight text-red-500">{stats.lowStockCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                <ArrowDownToLine className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">入庫予定</p>
                <p className="text-2xl font-bold tracking-tight text-blue-500">{stats.scheduledIn}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                <ArrowUpFromLine className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">出庫予定</p>
                <p className="text-2xl font-bold tracking-tight text-amber-500">{stats.scheduledOut}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2.5 pt-1">
        <Button asChild className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-md shadow-blue-500/25 hover:from-blue-600 hover:to-indigo-600" size="lg">
          <Link to="/transactions/new?type=IN">
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            新規入庫
          </Link>
        </Button>
        <Button asChild className="w-full bg-gradient-to-r from-amber-500 to-orange-500 shadow-md shadow-amber-500/25 hover:from-amber-600 hover:to-orange-600" size="lg">
          <Link to="/transactions/new?type=OUT">
            <ArrowUpFromLine className="mr-2 h-4 w-4" />
            新規出庫
          </Link>
        </Button>
      </div>
    </div>
  )
}
