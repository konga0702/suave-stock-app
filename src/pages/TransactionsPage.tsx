import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Upload, Download, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import { exportTransactionsCsv, importTransactionsCsv } from '@/lib/csv'
import { toast } from 'sonner'
import type { Transaction } from '@/types/database'

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [tab, setTab] = useState('SCHEDULED')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('status', tab)
      .order('date', { ascending: false })
    if (data) setTransactions(data)
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        await importTransactionsCsv(text)
        toast.success('インポート完了')
        load()
      } catch {
        toast.error('インポートに失敗しました')
      }
    }
    input.click()
  }

  // 管理番号の表示用ヘルパー
  const getIdDisplay = (tx: Transaction): string | null => {
    const parts: string[] = []
    if (tx.internal_id) parts.push(tx.internal_id)
    if (tx.shipping_tracking_id) parts.push(tx.shipping_tracking_id)
    if (tx.order_id) parts.push(tx.order_id)
    return parts.length > 0 ? parts.join(' / ') : null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">入出庫</h1>
        <div className="flex gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={handleImport} title="CSVインポート">
            <Upload className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => exportTransactionsCsv(transactions)} title="CSVエクスポート">
            <Download className="h-4 w-4" />
          </Button>
          <Button asChild size="icon" className="h-9 w-9 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 shadow-sm">
            <Link to="/transactions/new">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full rounded-xl bg-muted/60">
          <TabsTrigger value="SCHEDULED" className="flex-1 rounded-lg">予定</TabsTrigger>
          <TabsTrigger value="COMPLETED" className="flex-1 rounded-lg">履歴</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-2">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                {tab === 'SCHEDULED' ? (
                  <ArrowDownToLine className="h-6 w-6 text-muted-foreground/50" />
                ) : (
                  <ArrowUpFromLine className="h-6 w-6 text-muted-foreground/50" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {tab === 'SCHEDULED' ? '予定はありません' : '履歴はありません'}
              </p>
            </div>
          ) : (
            transactions.map((tx) => {
              const idDisplay = getIdDisplay(tx)
              const isIN = tx.type === 'IN'
              return (
                <Link key={tx.id} to={`/transactions/${tx.id}`}>
                  <Card className="mb-2 border-0 shadow-sm transition-all hover:shadow-md">
                    <CardContent className="flex items-center gap-3 p-3.5">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isIN ? 'bg-blue-50' : 'bg-amber-50'
                      }`}>
                        {isIN ? (
                          <ArrowDownToLine className="h-5 w-5 text-blue-500" />
                        ) : (
                          <ArrowUpFromLine className="h-5 w-5 text-amber-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge className={`text-[10px] px-1.5 py-0 ${
                            isIN
                              ? 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                              : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                          }`}>
                            {isIN ? '入庫' : '出庫'}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tx.category}</Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{tx.date}</span>
                          {tx.partner_name && <span>· {tx.partner_name}</span>}
                        </div>
                        {idDisplay && (
                          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
                            {idDisplay}
                          </p>
                        )}
                      </div>
                      <div className={`text-right font-bold ${
                        isIN ? 'text-blue-600' : 'text-amber-600'
                      }`}>
                        ¥{Number(tx.total_amount).toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
