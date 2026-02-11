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

  const metricCards = [
    {
      label: '総売上',
      value: `¥${data.totalSales.toLocaleString()}`,
      sub: `出庫 ${data.outCount}件`,
      icon: TrendingUp,
      iconBg: 'bg-emerald-50 dark:bg-emerald-950',
      iconColor: 'text-emerald-500',
      valueColor: 'text-emerald-600 dark:text-emerald-400',
      accentColor: 'bg-emerald-500',
    },
    {
      label: '総仕入れ',
      value: `¥${data.totalCost.toLocaleString()}`,
      sub: `入庫 ${data.inCount}件`,
      icon: TrendingDown,
      iconBg: 'bg-rose-50 dark:bg-rose-950',
      iconColor: 'text-rose-500',
      valueColor: 'text-rose-600 dark:text-rose-400',
      accentColor: 'bg-rose-500',
    },
    {
      label: '粗利',
      value: `¥${data.grossProfit.toLocaleString()}`,
      sub: '売上 - 仕入れ',
      icon: DollarSign,
      iconBg: 'bg-sky-50 dark:bg-sky-950',
      iconColor: 'text-sky-500',
      valueColor: data.grossProfit >= 0 ? 'text-sky-600 dark:text-sky-400' : 'text-rose-600 dark:text-rose-400',
      accentColor: data.grossProfit >= 0 ? 'bg-sky-500' : 'bg-rose-500',
    },
    {
      label: '粗利益率',
      value: `${data.profitMargin.toFixed(1)}%`,
      sub: '粗利 ÷ 売上',
      icon: Percent,
      iconBg: 'bg-violet-50 dark:bg-violet-950',
      iconColor: 'text-violet-500',
      valueColor: data.profitMargin >= 0 ? 'text-violet-600 dark:text-violet-400' : 'text-rose-600 dark:text-rose-400',
      accentColor: data.profitMargin >= 0 ? 'bg-violet-500' : 'bg-rose-500',
    },
  ]

  return (
    <div className="page-transition space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-500 p-5 text-white shadow-lg shadow-emerald-700/15">
        <div className="relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">利益ダッシュボード</h1>
              <p className="text-[13px] text-white/60">
                売上・仕入れ・利益を一覧で確認
              </p>
            </div>
          </div>
        </div>
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/[0.06]" />
        <div className="absolute -bottom-4 right-6 h-16 w-16 rounded-full bg-white/[0.04]" />
      </div>

      {/* 期間フィルター */}
      <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
        <CardContent className="space-y-3.5 p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-950">
              <CalendarDays className="h-4 w-4 text-teal-500" />
            </div>
            <Label className="text-sm font-semibold">期間</Label>
          </div>
          <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
            <SelectTrigger className="rounded-xl bg-white dark:bg-white/5 border-border/60">
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
              className="rounded-xl bg-white dark:bg-white/5 border-border/60"
            />
          )}

          {periodType === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">開始日</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-xl bg-white dark:bg-white/5 border-border/60"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">終了日</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-xl bg-white dark:bg-white/5 border-border/60"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 利益カード */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-emerald-300 border-t-emerald-600 animate-spin" />
            <p className="text-sm text-muted-foreground">計算中...</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {metricCards.map(({ label, value, sub, icon: Icon, iconBg, iconColor, valueColor, accentColor }) => (
              <Card key={label} className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                <CardContent className="p-0">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-medium text-muted-foreground tracking-wide">{label}</p>
                      <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${iconBg}`}>
                        <Icon className={`h-4 w-4 ${iconColor}`} />
                      </div>
                    </div>
                    <p className={`text-xl font-bold num-display ${valueColor}`}>
                      {value}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {sub}
                    </p>
                  </div>
                  <div className={`h-1 ${accentColor} opacity-80`} />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* サマリー */}
          <Card className="border-0 shadow-sm shadow-slate-200/50 dark:shadow-none">
            <CardContent className="p-5">
              <div className="space-y-3.5 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">総売上（出庫完了分）</span>
                  </div>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 num-display">
                    +¥{data.totalSales.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                    <span className="text-muted-foreground">総仕入れ（入庫完了分）</span>
                  </div>
                  <span className="font-semibold text-rose-600 dark:text-rose-400 num-display">
                    -¥{data.totalCost.toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-border/50 pt-3.5 flex items-center justify-between font-semibold">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-2.5 w-2.5 rounded-full ${data.grossProfit >= 0 ? 'bg-sky-500' : 'bg-rose-500'}`} />
                    <span>粗利益</span>
                  </div>
                  <span className={`text-base num-display ${data.grossProfit >= 0 ? 'text-sky-600 dark:text-sky-400' : 'text-rose-600 dark:text-rose-400'}`}>
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
