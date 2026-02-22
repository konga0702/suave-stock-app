import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { Layout } from '@/components/Layout'
import { ProductsPage } from '@/pages/ProductsPage'
import { ProductFormPage } from '@/pages/ProductFormPage'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { TransactionFormPage } from '@/pages/TransactionFormPage'
import { TransactionDetailPage } from '@/pages/TransactionDetailPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { InventoryDetailPage } from '@/pages/InventoryDetailPage'
import { NetStockPage } from '@/pages/NetStockPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ProfitDashboardPage } from '@/pages/ProfitDashboardPage'
import { TestBarcodesPage } from '@/pages/TestBarcodesPage'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/new" element={<ProductFormPage />} />
          <Route path="/products/:id/edit" element={<ProductFormPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/transactions/new" element={<TransactionFormPage />} />
          <Route path="/transactions/:id" element={<TransactionDetailPage />} />
          <Route path="/transactions/:id/edit" element={<TransactionFormPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/inventory/:productId" element={<InventoryDetailPage />} />
          <Route path="/net-stock" element={<NetStockPage />} />
          <Route path="/profit" element={<ProfitDashboardPage />} />
          <Route path="/test-barcodes" element={<TestBarcodesPage />} />
        </Routes>
      </Layout>
      <Toaster position="top-center" richColors />
    </BrowserRouter>
  )
}
