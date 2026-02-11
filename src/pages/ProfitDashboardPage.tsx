import { useEffect, useState, useCallback } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Percent, CalendarDays } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'

type PeriodType = 'all' | 'month' | 'custom'

interface ProfitData {
  totalSales: number
  totalCost: number
  grossProfit: number
  profitMargin: number
  inCount: number
  outCount: number
}

export function ProfitDashboardPage() {
  const [periodType, setPeriodType] = useState<PeriodType>('month')
  const [month, setMonth] = useState(
    new Date().toISOString().slice(0, 7) // YYYY-MM
  )
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [data, setData] = useState<ProfitData>({
    totalSales: 0,
    totalCost: 0,
    grossProfit: 0,
    profitMargin: 0,
    inCount: 0,
    outCount: 0,
  })
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      let fromDate: string | null = null
      let toDate: string | null = null

      if (periodType === 'month') {
        fromDate = `${month}-01`
        const [y, m] = month.split('-').map(Number)
        const lastDay = new Date(y, m, 0).getDate()
        toDate = `${month}-${String(lastDay).padStart(2, '0')}`
      } else if (periodType === 'custom') {
        fromDate = dateFrom || null
        toDate = dateTo || null
      }

      let inQuery = supabase
        .from('transactions')
        .select('total_amount')
        .eq('type', 'IN')
        .eq('status', 'COMPLETED')
      if (fromDate) inQuery = inQuery.gte('date', fromDate)
      if (toDate) inQuery = inQuery.lte('date', toDate)
      const { data: inData } = await inQuery

      let outQuery = supabase
        .from('transactions')
        .select('total_amount')
        .eq('type', 'OUT')
        .eq('status', 'COMPLETED')
      if (fromDate) outQuery = outQuery.gte('date', fromDate)
      if (toDate) outQuery = outQuery.lte('date', toDate)
      const { data: outData } = await outQuery

      const totalCost = (inData ?? []).reduce(
        (sum, row) => sum + Number(row.total_amount),
        0
      )
      const totalSales = (outData ?? []).reduce(
        (sum, row) => sum + Number(row.total_amount),
        0
      )
      const grossProfit = totalSales - totalCost
      const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0

      setData({
        totalSales,
        totalCost,
        grossProfit,
        profitMargin,
        inCount: inData?.length ?? 0,
        outCount: outData?.length ?? 0,
      })
    } catch {
      // エラー時はゼロ表示
    } finally {
      setLoading(false)
    }
  }, [periodType, month, dateFrom, dateTo])

  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-5 text-white shadow-lg">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            <h1 className="text-lg font-bold">利益ダッシュボード</h1>
          </div>
          <p className="mt-1 text-sm text-white/80">
            売上・仕入れ・利益を一覧で確認
          </p>
        </div>
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute -bottom-4 -right-2 h-16 w-16 rounded-full bg-white/10" />
      </div>

      {/* 期間フィルター */}
      <Card className="border-0 shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-teal-500" />
            <Label className="text-sm font-semibold">期間</Label>
          </div>
          <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全期間</SelectItem>
              <SelectItem value="month">月別</SelectItem>
              <SelectItem value="custom">カスタム期間</SelectItem>
            </SelectContent>
          </Select>

          {periodType === 'month' && (
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-xl"
            />
          )}

          {periodType === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">開始日</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">終了日</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 利益カード */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">計算中...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground">総売上</p>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                    </div>
                  </div>
                  <p className="text-xl font-bold text-emerald-600">
                    ¥{data.totalSales.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    出庫 {data.outCount}件
                  </p>
                </div>
                <div className="h-1 bg-gradient-to-r from-emerald-400 to-green-400" />
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground">総仕入れ</p>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    </div>
                  </div>
                  <p className="text-xl font-bold text-red-600">
                    ¥{data.totalCost.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    入庫 {data.inCount}件
                  </p>
                </div>
                <div className="h-1 bg-gradient-to-r from-red-400 to-rose-400" />
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground">粗利</p>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
                      <DollarSign className="h-4 w-4 text-indigo-500" />
                    </div>
                  </div>
                  <p className={`text-xl font-bold ${
                    data.grossProfit >= 0 ? 'text-indigo-600' : 'text-red-600'
                  }`}>
                    ¥{data.grossProfit.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    売上 - 仕入れ
                  </p>
                </div>
                <div className={`h-1 ${
                  data.grossProfit >= 0
                    ? 'bg-gradient-to-r from-indigo-400 to-violet-400'
                    : 'bg-gradient-to-r from-red-400 to-rose-400'
                }`} />
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground">粗利益率</p>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
                      <Percent className="h-4 w-4 text-purple-500" />
                    </div>
                  </div>
                  <p className={`text-xl font-bold ${
                    data.profitMargin >= 0 ? 'text-purple-600' : 'text-red-600'
                  }`}>
                    {data.profitMargin.toFixed(1)}%
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    粗利 ÷ 売上
                  </p>
                </div>
                <div className={`h-1 ${
                  data.profitMargin >= 0
                    ? 'bg-gradient-to-r from-purple-400 to-fuchsia-400'
                    : 'bg-gradient-to-r from-red-400 to-rose-400'
                }`} />
              </CardContent>
            </Card>
          </div>

          {/* サマリー */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">総売上（出庫完了分）</span>
                  </div>
                  <span className="font-semibold text-emerald-600">
                    +¥{data.totalSales.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-muted-foreground">総仕入れ（入庫完了分）</span>
                  </div>
                  <span className="font-semibold text-red-600">
                    -¥{data.totalCost.toLocaleString()}
                  </span>
                </div>
                <div className="border-t pt-3 flex items-center justify-between font-semibold">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${data.grossProfit >= 0 ? 'bg-indigo-500' : 'bg-red-500'}`} />
                    <span>粗利益</span>
                  </div>
                  <span className={`text-base ${data.grossProfit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
                    ¥{data.grossProfit.toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
