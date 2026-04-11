import { Navigate, Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/admin/Sidebar'
import { usePendingOrders } from '../hooks/usePendingOrders'

// Bottom nav items for mobile (most used)
const BOTTOM_NAV = [
  { to: '/admin/dashboard',  icon: '🏠', label: 'Dashboard' },
  { to: '/admin/products',   icon: '📦', label: 'Sản phẩm' },
  { to: '/admin/invoices',   icon: '🧾', label: 'Hóa đơn', badge: true },
  { to: '/admin/receipts',   icon: '📥', label: 'Nhập kho' },
  { to: '/admin/inventory-report', icon: '📊', label: 'Tồn kho' },
]

export default function AdminLayout() {
  const { isAuthenticated, isAdmin } = useAuth()
  const { data: pendingOrders = [] } = usePendingOrders()
  const pendingCount = pendingOrders.filter(o => o.status === 'PENDING').length

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/store" replace />

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#fef9e7' }}>
      {/* Sidebar — hidden on mobile, shown on lg+ */}
      <Sidebar />

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-5 pt-14 lg:pt-5 pb-20 lg:pb-5">
        <Outlet />
      </main>

      {/* ── Bottom Navigation Bar (mobile only, < lg) ── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-amber-900/30 shadow-2xl"
        style={{ background: 'linear-gradient(0deg,#1c1008,#2d1a0a)' }}>
        {BOTTOM_NAV.map(({ to, icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition relative ${
                isActive ? 'text-amber-300' : 'text-amber-100/50 hover:text-amber-200'
              }`
            }
          >
            <span className="text-xl leading-none relative">
              {icon}
              {badge && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </span>
            <span className="leading-none">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
