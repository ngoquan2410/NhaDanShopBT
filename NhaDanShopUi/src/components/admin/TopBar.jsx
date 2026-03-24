import { Bell, LogOut, Store } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { usePendingOrders } from '../../hooks/usePendingOrders'

export default function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { data: pendingOrders = [] } = usePendingOrders()
  const pendingCount = pendingOrders.filter(o => o.status === 'PENDING').length

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const initials = (user?.fullName || user?.username || 'AD')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <header className="h-11 border-b bg-card flex items-center px-3 gap-3 shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-2">
        <Store className="h-4 w-4 text-primary shrink-0" />
        <span className="font-semibold text-sm text-foreground hidden sm:block">Nhà Đan Shop</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* Pending orders bell */}
        <button
          onClick={() => navigate('/admin/invoices')}
          className="relative flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent transition-colors"
          title="Đơn chờ xác nhận"
        >
          <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          {pendingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 bg-destructive text-destructive-foreground text-xxs rounded-full flex items-center justify-center font-bold animate-pulse">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>

        {/* Avatar */}
        <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xxs font-bold select-none">
          {initials}
        </div>

        {/* Username */}
        <span className="text-xs text-muted-foreground hidden md:block max-w-[120px] truncate">
          {user?.fullName || user?.username}
        </span>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent transition-colors"
          title="Đăng xuất"
        >
          <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </header>
  )
}
