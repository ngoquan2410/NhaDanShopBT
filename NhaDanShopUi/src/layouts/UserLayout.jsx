import { useState } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Footer from '../components/Footer'

export default function UserLayout() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/store', { replace: true })
    setMenuOpen(false)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#fef9e7' }}>
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-30 shadow-md"
        style={{ background: 'linear-gradient(90deg,#92400e 0%,#b45309 50%,#92400e 100%)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Logo */}
          <Link
            to="/store"
            className="text-base sm:text-xl font-bold tracking-wide flex items-center gap-2 text-amber-100 shrink-0"
          >
            🛒 <span className="hidden xs:inline">Anh Đan Shop</span>
            <span className="xs:hidden">Anh Đan</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-amber-200 max-w-[160px] truncate">
                  Xin chào, {user?.fullName || user?.username}
                </span>
                {isAdmin && (
                  <Link
                    to="/admin/dashboard"
                    className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition"
                  >
                    ⚙️ Quản trị
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="bg-amber-100 text-amber-900 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-white transition"
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="bg-amber-100 text-amber-900 px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-white transition"
              >
                Đăng nhập
              </Link>
            )}
          </div>

          {/* Mobile/iPad: hamburger */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white transition"
            aria-label="Menu"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div
            className="md:hidden border-t border-amber-700/40 px-4 py-3 space-y-2"
            style={{ background: 'linear-gradient(180deg,#92400e,#7c3209)' }}
          >
            {isAuthenticated ? (
              <>
                <div className="text-amber-200 text-sm py-1">
                  👤 {user?.fullName || user?.username}
                </div>
                {isAdmin && (
                  <Link
                    to="/admin/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 text-white bg-white/15 hover:bg-white/25 px-4 py-2.5 rounded-xl text-sm font-medium transition w-full"
                  >
                    ⚙️ Trang quản trị
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-amber-100 bg-amber-800/40 hover:bg-amber-800/60 px-4 py-2.5 rounded-xl text-sm font-medium transition w-full"
                >
                  🚪 Đăng xuất
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center gap-2 text-amber-900 bg-amber-100 hover:bg-white px-4 py-2.5 rounded-xl text-sm font-semibold transition w-full"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center gap-2 text-white bg-white/15 hover:bg-white/25 px-4 py-2.5 rounded-xl text-sm font-medium transition w-full"
                >
                  Đăng ký
                </Link>
              </>
            )}
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <div className="flex flex-1">
        {/* Side decorations — chỉ hiện trên desktop lớn */}
        <div
          className="hidden xl:flex flex-col w-16 shrink-0 items-center py-8 gap-5 select-none"
          style={{ background: 'linear-gradient(180deg,#fef3c7,#fde68a,#fef3c7)' }}
        >
          {['🍫','🍐','🥜','🍭','🧊','🍜'].map((e, i) => (
            <div key={i} className="text-2xl opacity-60">{e}</div>
          ))}
        </div>

        {/* Page content */}
        <main className="flex-1 min-w-0 w-full max-w-6xl mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-6 pb-20 md:pb-6">
          <Outlet />
        </main>

        {/* Side decorations right */}
        <div
          className="hidden xl:flex flex-col w-16 shrink-0 items-center py-8 gap-5 select-none"
          style={{ background: 'linear-gradient(180deg,#fef3c7,#fde68a,#fef3c7)' }}
        >
          {['🍎','🍌','🍇','🥭','🍒','🥦'].map((e, i) => (
            <div key={i} className="text-2xl opacity-60">{e}</div>
          ))}
        </div>
      </div>

      <Footer />

      {/* ── Bottom navigation bar (Mobile only) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-amber-200/60 flex"
        style={{ background: 'linear-gradient(0deg,#92400e,#b45309)' }}
      >
        <Link
          to="/store"
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition ${
            location.pathname === '/store' ? 'text-amber-200' : 'text-amber-100/70 hover:text-amber-200'
          }`}
        >
          <span className="text-xl">🏪</span>
          <span>Cửa hàng</span>
        </Link>
        {isAuthenticated ? (
          <>
            {isAdmin && (
              <Link
                to="/admin/dashboard"
                className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium text-amber-100/70 hover:text-amber-200 transition"
              >
                <span className="text-xl">⚙️</span>
                <span>Quản trị</span>
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium text-amber-100/70 hover:text-amber-200 transition"
            >
              <span className="text-xl">🚪</span>
              <span>Đăng xuất</span>
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition ${
              location.pathname === '/login' ? 'text-amber-200' : 'text-amber-100/70 hover:text-amber-200'
            }`}
          >
            <span className="text-xl">👤</span>
            <span>Đăng nhập</span>
          </Link>
        )}
      </nav>
    </div>
  )
}