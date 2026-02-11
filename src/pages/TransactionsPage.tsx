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
    <div className="page-transition space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">入出庫</h1>
        <div className="flex gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors" onClick={handleImport} title="CSVインポート">
            <Upload className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-border/60 hover:bg-accent transition-colors" onClick={() => exportTransactionsCsv(transactions)} title="CSVエクスポート">
            <Download className="h-4 w-4" />
          </Button>
          <Button asChild size="icon" className="h-9 w-9 rounded-xl bg-slate-800 text-white shadow-sm hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 transition-all">
            <Link to="/transactions/new">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full rounded-xl bg-muted/50 p-1">
          <TabsTrigger value="SCHEDULED" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-700 transition-all">予定</TabsTrigger>
          <TabsTrigger value="COMPLETED" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-700 transition-all">履歴</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-2">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center animate-fade-in">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                {tab === 'SCHEDULED' ? (
                  <ArrowDownToLine className="h-7 w-7 text-muted-foreground/40" />
                ) : (
                  <ArrowUpFromLine className="h-7 w-7 text-muted-foreground/40" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {tab === 'SCHEDULED' ? '予定はありません' : '履歴はありません'}
              </p>
            </div>
          ) : (
            transactions.map((tx, index) => {
              const idDisplay = getIdDisplay(tx)
              const isIN = tx.type === 'IN'
              return (
                <Link key={tx.id} to={`/transactions/${tx.id}`}>
                  <Card className={`mb-2 border-0 shadow-sm shadow-slate-200/50 dark:shadow-none transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
                    index % 2 === 1 ? 'bg-slate-50/50 dark:bg-white/[0.02]' : ''
                  }`}>
                    <CardContent className="flex items-center gap-3.5 p-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                        isIN ? 'bg-sky-50 dark:bg-sky-950' : 'bg-amber-50 dark:bg-amber-950'
                      }`}>
                        {isIN ? (
                          <ArrowDownToLine className="h-5 w-5 text-sky-500" />
                        ) : (
                          <ArrowUpFromLine className="h-5 w-5 text-amber-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border-0 ${
                            isIN
                              ? 'bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-900 dark:text-sky-300'
                              : 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-300'
                          }`}>
                            {isIN ? '入庫' : '出庫'}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-md border-border/60">{tx.category}</Badge>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{tx.date}</span>
                          {tx.partner_name && <span className="opacity-60">·</span>}
                          {tx.partner_name && <span>{tx.partner_name}</span>}
                        </div>
                        {idDisplay && (
                          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/50">
                            {idDisplay}
                          </p>
                        )}
                      </div>
                      <div className={`text-right font-bold num-display text-[15px] ${
                        isIN ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'
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
