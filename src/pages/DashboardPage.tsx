import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, ArrowDownToLine, ArrowUpFromLine, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <div className="space-y-4">
      <h1 className="text-xl font-bold">在庫管理</h1>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">商品数</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">在庫少</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.lowStockCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">入庫予定</CardTitle>
            <ArrowDownToLine className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{stats.scheduledIn}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">出庫予定</CardTitle>
            <ArrowUpFromLine className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.scheduledOut}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2 pt-2">
        <Button asChild className="w-full" size="lg">
          <Link to="/transactions/new?type=IN">
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            新規入庫
          </Link>
        </Button>
        <Button asChild className="w-full" size="lg" variant="outline">
          <Link to="/transactions/new?type=OUT">
            <ArrowUpFromLine className="mr-2 h-4 w-4" />
            新規出庫
          </Link>
        </Button>
      </div>
    </div>
  )
}
