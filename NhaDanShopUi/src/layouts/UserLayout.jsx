import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Footer from '../components/Footer'
export default function UserLayout() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const handleLogout = () => {
    logout()
    navigate('/store', { replace: true })
  }
  return (
    <div className="min-h-screen flex flex-col" style={{background:'#fef9e7'}}>
      {/* Header */}
      <header className="relative z-10 shadow-md" style={{background:'linear-gradient(90deg,#92400e 0%,#b45309 50%,#92400e 100%)'}}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/store" className="text-xl font-bold tracking-wide flex items-center gap-2 text-amber-100">
            {'\uD83D\uDED2'} {"\u0041\u006E\u0068 \u0110an Shop"}
          </Link>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-amber-200 hidden sm:inline">
                  {"\u0058in ch\u00E0o"}, {user?.fullName || user?.username}
                </span>
                {isAdmin && (
                  <Link to="/admin/dashboard"
                    className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded text-sm font-medium transition">
                    {"\u2699\uFE0F Qu\u1EA3n tr\u1ECB"}
                  </Link>
                )}
                <button onClick={handleLogout}
                  className="bg-amber-100 text-amber-900 px-3 py-1 rounded text-sm font-medium hover:bg-white transition">
                  {"\u0110\u0103ng xu\u1EA5t"}
                </button>
              </>
            ) : (
              <Link to="/login"
                className="bg-amber-100 text-amber-900 px-4 py-1.5 rounded text-sm font-semibold hover:bg-white transition">
                {"\u0110\u0103ng nh\u1EADp"}
              </Link>
            )}
          </div>
        </div>
      </header>
      {/* Main layout with side decorations */}
      <div className="flex flex-1">
        {/* Left decoration panel */}
        <div className="hidden xl:flex flex-col w-40 shrink-0 items-center py-8 gap-6 select-none"
          style={{background:'linear-gradient(180deg,#fef3c7,#fde68a,#fef3c7)'}}>
          <div className="text-center space-y-4 text-4xl opacity-70">
            <div>{'\uD83C\uDF6B'}</div>
            <div>{'\uD83C\uDF50'}</div>
            <div>{'\uD83E\uDD5C'}</div>
            <div>{'\uD83C\uDF6D'}</div>
            <div>{'\uD83E\uDED9'}</div>
            <div>{'\uD83C\uDF5C'}</div>
          </div>
          <div className="mt-auto text-center space-y-4 text-4xl opacity-70">
            <div>{'\uD83C\uDF63'}</div>
            <div>{'\uD83E\uDDC5'}</div>
            <div>{'\uD83C\uDF6E'}</div>
          </div>
        </div>
        {/* Content */}
        <main className="flex-1 min-w-0 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
          <Outlet />
        </main>
        {/* Right decoration panel */}
        <div className="hidden xl:flex flex-col w-40 shrink-0 items-center py-8 gap-6 select-none"
          style={{background:'linear-gradient(180deg,#fef3c7,#fde68a,#fef3c7)'}}>
          <div className="text-center space-y-4 text-4xl opacity-70">
            <div>{'\uD83C\uDF4E'}</div>
            <div>{'\uD83C\uDF4C'}</div>
            <div>{'\uD83C\uDF47'}</div>
            <div>{'\uD83E\uDD6D'}</div>
            <div>{'\uD83C\uDF51'}</div>
            <div>{'\uD83C\uDF5D'}</div>
          </div>
          <div className="mt-auto text-center space-y-4 text-4xl opacity-70">
            <div>{'\uD83E\uDD5D'}</div>
            <div>{'\uD83C\uDF52'}</div>
            <div>{'\uD83E\uDD66'}</div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}