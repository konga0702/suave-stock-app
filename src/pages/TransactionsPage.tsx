import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Upload, Download } from 'lucide-react'
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
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handleImport} title="CSVインポート">
            <Upload className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => exportTransactionsCsv(transactions)} title="CSVエクスポート">
            <Download className="h-4 w-4" />
          </Button>
          <Button asChild size="icon">
            <Link to="/transactions/new">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="SCHEDULED" className="flex-1">予定</TabsTrigger>
          <TabsTrigger value="COMPLETED" className="flex-1">履歴</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-2">
          {transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {tab === 'SCHEDULED' ? '予定はありません' : '履歴はありません'}
            </p>
          ) : (
            transactions.map((tx) => {
              const idDisplay = getIdDisplay(tx)
              return (
                <Link key={tx.id} to={`/transactions/${tx.id}`}>
                  <Card className="mb-2 transition-colors hover:bg-accent">
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant={tx.type === 'IN' ? 'default' : 'secondary'}>
                            {tx.type === 'IN' ? '入庫' : '出庫'}
                          </Badge>
                          <Badge variant="outline">{tx.category}</Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{tx.date}</span>
                          {tx.partner_name && <span>· {tx.partner_name}</span>}
                        </div>
                        {idDisplay && (
                          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                            {idDisplay}
                          </p>
                        )}
                      </div>
                      <div className="text-right font-medium">
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
