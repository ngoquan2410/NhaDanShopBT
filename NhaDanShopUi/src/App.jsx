import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/AuthContext'
import AdminLayout from './layouts/AdminLayout'
import UserLayout from './layouts/UserLayout'
import LoginPage from './pages/LoginPage'
import SignUpPage from './pages/SignUpPage'
import DashboardPage from './pages/admin/DashboardPage'
import CategoriesPage from './pages/admin/CategoriesPage'
import ProductsPage from './pages/admin/ProductsPage'
import ReceiptsPage from './pages/admin/ReceiptsPage'
import InvoicesPage from './pages/admin/InvoicesPage'
import InventoryReportPage from './pages/admin/InventoryReportPage'
import ProfitReportPage from './pages/admin/ProfitReportPage'
import RevenuePage from './pages/admin/RevenuePage'
import UsersPage from './pages/admin/UsersPage'
import SecuritySettingsPage from './pages/admin/SecuritySettingsPage'
import PromotionsPage from './pages/admin/PromotionsPage'
import CombosPage from './pages/admin/CombosPage'
import SuppliersPage from './pages/admin/SuppliersPage'
import StockAdjustmentPage from './pages/admin/StockAdjustmentPage'
import StorefrontPage from './pages/store/StorefrontPage'
import './App.css'

// Khi đã login → redirect admin về dashboard, user ở lại store
function LoginRedirect() {
  const { isAuthenticated, isAdmin } = useAuth()
  if (isAuthenticated && isAdmin) return <Navigate to="/admin/dashboard" replace />
  return <Navigate to="/store" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Trang chủ = cửa hàng, không cần đăng nhập */}
          <Route path="/" element={<Navigate to="/store" replace />} />

          {/* Login page */}
          <Route path="/login" element={<LoginPage />} />

          {/* Sign up page */}
          <Route path="/signup" element={<SignUpPage />} />

          {/* Store routes — public, không cần auth */}
          <Route path="/store" element={<UserLayout />}>
            <Route index element={<StorefrontPage />} />
          </Route>

          {/* Admin routes — phải login + có ROLE_ADMIN */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="receipts" element={<ReceiptsPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="inventory-report" element={<InventoryReportPage />} />
            <Route path="profit-report" element={<ProfitReportPage />} />
            <Route path="revenue" element={<RevenuePage />} />
            <Route path="promotions" element={<PromotionsPage />} />
            <Route path="combos" element={<CombosPage />} />
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="stock-adjustments" element={<StockAdjustmentPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="security" element={<SecuritySettingsPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/store" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
