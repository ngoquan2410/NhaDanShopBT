import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { usePendingOrders } from '../../hooks/usePendingOrders'

const links = [
  { to: '/admin/dashboard',        label: 'Dashboard',       icon: '🏠' },
  { to: '/admin/categories',       label: 'Danh mục',        icon: '📂' },
  { to: '/admin/products',         label: 'Sản phẩm',        icon: '📦' },
  { to: '/admin/receipts',         label: 'Phiếu nhập kho',  icon: '📥' },
  { to: '/admin/invoices',         label: 'Hóa đơn bán',     icon: '🧾', badge: true },
  { to: '/admin/inventory-report', label: 'Tồn kho',         icon: '📊'},
  { to: '/admin/profit-report',    label: 'Lợi nhuận',       icon: '💰' },
  { to: '/admin/revenue',          label: 'Doanh thu',        icon: '📈' },
  { to: '/admin/promotions',       label: 'Khuyến mãi',       icon: '🎉' },
  { to: '/admin/combos',            label: 'Combo sản phẩm',        icon: '📦' },
  { to: '/admin/customers',         label: 'Khách hàng',            icon: '👤' },
  { to: '/admin/suppliers',         label: 'Nhà cung cấp',          icon: '🏭' },
  { to: '/admin/stock-adjustments', label: 'Kiểm kê / Điều chỉnh',  icon: '⚖️' },
  { to: '/admin/users',             label: 'Người dùng',            icon: '👥' },
  { to: '/admin/security',         label: 'Bảo mật / 2FA',   icon: '🔐' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { data: pendingOrders = [] } = usePendingOrders()
  const pendingCount = pendingOrders.filter(o => o.status === 'PENDING').length
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-amber-900/40 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-amber-400">🛒 Nhã Đan Shop</h1>
          <p className="text-xs text-amber-600/80 mt-1">Quản trị hệ thống</p>
        </div>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-amber-300 hover:text-white text-2xl leading-none">&times;</button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {links.map(({ to, label, icon, badge }) => (
          <NavLink key={to} to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-3 text-sm transition-all ${
                isActive
                  ? 'bg-amber-500 text-white font-semibold shadow-inner'
                  : 'text-amber-200/80 hover:bg-amber-900/40 hover:text-amber-100'
              }`
            }
          >
            <span className="text-lg">{icon}</span>
            <span className="flex-1">{label}</span>
            {badge && pendingCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center animate-pulse">
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User info & logout */}
      <div className="px-6 py-4 border-t border-amber-900/40">
        <p className="text-xs text-amber-600/70 mb-1">Đăng nhập với</p>
        <p className="text-sm font-medium text-amber-200 truncate">{user?.fullName || user?.username}</p>
        <button onClick={handleLogout}
          className="mt-3 w-full text-left text-xs text-red-400 hover:text-red-300 transition">
          ← Đăng xuất
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 bg-amber-800 text-white p-2 rounded-lg shadow-lg"
        aria-label="Mở menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - desktop: always visible, mobile: drawer */}
      <aside
        className={`flex flex-col shadow-xl z-50 transition-transform duration-300
          fixed lg:static inset-y-0 left-0 w-64
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{background:'linear-gradient(180deg,#1c1008 0%,#2d1a0a 60%,#1c1008 100%)'}}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
