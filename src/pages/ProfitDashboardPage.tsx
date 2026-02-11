import { useEffect, useState, useCallback } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
      // 期間条件を設定
      let fromDate: string | null = null
      let toDate: string | null = null

      if (periodType === 'month') {
        fromDate = `${month}-01`
        // 月末日の計算
        const [y, m] = month.split('-').map(Number)
        const lastDay = new Date(y, m, 0).getDate()
        toDate = `${month}-${String(lastDay).padStart(2, '0')}`
      } else if (periodType === 'custom') {
        fromDate = dateFrom || null
        toDate = dateTo || null
      }

      // 完了済み入庫（仕入れ）の合計
      let inQuery = supabase
        .from('transactions')
        .select('total_amount')
        .eq('type', 'IN')
        .eq('status', 'COMPLETED')
      if (fromDate) inQuery = inQuery.gte('date', fromDate)
      if (toDate) inQuery = inQuery.lte('date', toDate)
      const { data: inData } = await inQuery

      // 完了済み出庫（売上）の合計
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
    <div className="space-y-4">
      <h1 className="text-xl font-bold">利益ダッシュボード</h1>

      {/* 期間フィルター */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="space-y-1">
            <Label className="text-xs">期間</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全期間</SelectItem>
                <SelectItem value="month">月別</SelectItem>
                <SelectItem value="custom">カスタム期間</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {periodType === 'month' && (
            <div className="space-y-1">
              <Label className="text-xs">月を選択</Label>
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
          )}

          {periodType === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">開始日</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">終了日</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
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
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">総売上</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ¥{data.totalSales.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  出庫 {data.outCount}件
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">総仕入れ</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  ¥{data.totalCost.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  入庫 {data.inCount}件
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">粗利</CardTitle>
                <DollarSign className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${
                  data.grossProfit >= 0 ? 'text-blue-600' : 'text-red-600'
                }`}>
                  ¥{data.grossProfit.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  売上 - 仕入れ
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">粗利益率</CardTitle>
                <Percent className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${
                  data.profitMargin >= 0 ? 'text-purple-600' : 'text-red-600'
                }`}>
                  {data.profitMargin.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  粗利 ÷ 売上
                </p>
              </CardContent>
            </Card>
          </div>

          {/* サマリー */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">総売上（出庫完了分）</span>
                  <span className="font-medium text-green-600">
                    +¥{data.totalSales.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">総仕入れ（入庫完了分）</span>
                  <span className="font-medium text-red-600">
                    -¥{data.totalCost.toLocaleString()}
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>粗利益</span>
                  <span className={data.grossProfit >= 0 ? 'text-blue-600' : 'text-red-600'}>
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
