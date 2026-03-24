import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/axios'
import toast from 'react-hot-toast'

/**
 * Trang cài đặt bảo mật / TOTP cho người dùng đã đăng nhập.
 * Route: /admin/security  (hoặc /store/security cho user thường)
 */
export default function SecuritySettingsPage() {
  const { user, logout } = useAuth()
  const totpEnabled = user?.totpEnabled ?? false

  // ── Setup flow ────────────────────────────────────────────────────────────
  const [setupData, setSetupData]   = useState(null)  // { secret, otpauthUrl, qrCodeImage }
  const [enableOtp, setEnableOtp]   = useState('')
  const [disableOtp, setDisableOtp] = useState('')
  const [loading, setLoading]       = useState(false)
  const [tab, setTab]               = useState('info') // 'info' | 'setup' | 'disable'

  // ── Bước 1: Lấy QR code từ BE ─────────────────────────────────────────────
  const handleSetup = async () => {
    setLoading(true)
    try {
      const res = await api.post('/api/auth/totp/setup')
      setSetupData(res.data)
      setTab('setup')
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Lỗi khởi tạo TOTP')
    } finally {
      setLoading(false)
    }
  }

  // ── Bước 2: Xác nhận OTP → bật TOTP ──────────────────────────────────────
  const handleEnable = async (e) => {
    e.preventDefault()
    if (enableOtp.length !== 6) { toast.error('Mã OTP phải 6 chữ số'); return }
    setLoading(true)
    try {
      await api.post('/api/auth/totp/enable', { otp: enableOtp })
      toast.success('🔐 TOTP đã được kích hoạt! Đăng nhập lại để áp dụng.')
      // Cập nhật user info trong localStorage
      const stored = JSON.parse(localStorage.getItem('nds_user') || '{}')
      stored.totpEnabled = true
      localStorage.setItem('nds_user', JSON.stringify(stored))
      setSetupData(null)
      setEnableOtp('')
      setTab('info')
      // Reload để AuthContext cập nhật lại user
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Mã OTP không đúng')
      setEnableOtp('')
    } finally {
      setLoading(false)
    }
  }

  // ── Tắt TOTP ──────────────────────────────────────────────────────────────
  const handleDisable = async (e) => {
    e.preventDefault()
    if (disableOtp.length !== 6) { toast.error('Mã OTP phải 6 chữ số'); return }
    setLoading(true)
    try {
      await api.post('/api/auth/totp/disable', { otp: disableOtp })
      toast.success('TOTP đã được tắt.')
      const stored = JSON.parse(localStorage.getItem('nds_user') || '{}')
      stored.totpEnabled = false
      localStorage.setItem('nds_user', JSON.stringify(stored))
      setDisableOtp('')
      setTab('info')
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Mã OTP không đúng')
      setDisableOtp('')
    } finally {
      setLoading(false)
    }
  }

  // ── Đăng xuất tất cả thiết bị ─────────────────────────────────────────────
  const handleLogoutAll = async () => {
    if (!confirm('Đăng xuất khỏi tất cả thiết bị?')) return
    try {
      await api.post('/api/auth/logout-all')
      toast.success('Đã đăng xuất tất cả thiết bị')
      logout()
    } catch {
      toast.error('Lỗi khi đăng xuất')
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">🔒 Cài đặt bảo mật</h1>

      {/* ── Thông tin tài khoản ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-gray-700">Tài khoản</h2>
        <p className="text-sm text-gray-600">
          Tên đăng nhập: <span className="font-mono font-bold">{user?.username}</span>
        </p>
        <p className="text-sm text-gray-600">
          Họ tên: <span className="font-medium">{user?.fullName || '—'}</span>
        </p>
        <p className="text-sm">
          Xác thực 2 yếu tố (TOTP):{' '}
          <span className={`font-bold ${totpEnabled ? 'text-green-600' : 'text-gray-400'}`}>
            {totpEnabled ? '✅ Đã bật' : '❌ Chưa bật'}
          </span>
        </p>
      </div>

      {/* ── TOTP Section ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-700">🔐 Xác thực hai yếu tố (TOTP)</h2>

        {/* Tab info */}
        {tab === 'info' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              TOTP (Time-based One-Time Password) bảo vệ tài khoản bằng mã 6 chữ số
              thay đổi mỗi 30 giây từ ứng dụng <strong>Google Authenticator</strong>,
              <strong> Authy</strong> hoặc <strong>Microsoft Authenticator</strong>.
            </p>
            {!totpEnabled ? (
              <button
                onClick={handleSetup}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-60"
              >
                {loading ? 'Đang tạo...' : '🔐 Bật xác thực 2 yếu tố'}
              </button>
            ) : (
              <button
                onClick={() => setTab('disable')}
                className="w-full border-2 border-red-300 text-red-600 hover:bg-red-50 font-semibold py-2.5 rounded-xl transition"
              >
                🔓 Tắt xác thực 2 yếu tố
              </button>
            )}
          </div>
        )}

        {/* Tab setup: hiển thị QR code */}
        {tab === 'setup' && setupData && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800 space-y-1">
              <p className="font-semibold">Hướng dẫn cài đặt:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Mở <strong>Google Authenticator</strong> / Authy trên điện thoại</li>
                <li>Chọn <strong>"Thêm tài khoản"</strong> → <strong>"Quét mã QR"</strong></li>
                <li>Quét mã QR bên dưới</li>
                <li>Nhập mã 6 chữ số hiển thị trong app để xác nhận</li>
              </ol>
            </div>

            {/* QR Code */}
            {setupData.qrCodeImage && (
              <div className="flex justify-center">
                <img
                  src={setupData.qrCodeImage}
                  alt="TOTP QR Code"
                  className="w-48 h-48 border-4 border-white shadow-lg rounded-xl"
                />
              </div>
            )}

            {/* Secret key (nhập tay thay thế) */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Hoặc nhập secret key thủ công:</p>
              <p className="font-mono text-sm font-bold text-gray-800 break-all select-all">
                {setupData.secret}
              </p>
            </div>

            {/* Nhập OTP xác nhận */}
            <form onSubmit={handleEnable} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nhập mã OTP từ app để xác nhận:
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={enableOtp}
                  onChange={e => setEnableOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full border rounded-lg px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="000000"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setTab('info'); setSetupData(null); setEnableOtp('') }}
                  className="flex-1 border rounded-xl py-2.5 text-gray-600 hover:bg-gray-50">
                  Hủy
                </button>
                <button type="submit" disabled={loading || enableOtp.length !== 6}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl disabled:opacity-60 transition">
                  {loading ? 'Đang xác nhận...' : '✅ Kích hoạt TOTP'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab disable */}
        {tab === 'disable' && (
          <form onSubmit={handleDisable} className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
              <p className="font-semibold">⚠️ Tắt TOTP sẽ giảm bảo mật tài khoản.</p>
              <p>Nhập mã OTP hiện tại từ app Authenticator để xác nhận.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mã OTP xác nhận:</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={disableOtp}
                onChange={e => setDisableOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full border rounded-lg px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-red-400"
                placeholder="000000"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setTab('info'); setDisableOtp('') }}
                className="flex-1 border rounded-xl py-2.5 text-gray-600 hover:bg-gray-50">
                Hủy
              </button>
              <button type="submit" disabled={loading || disableOtp.length !== 6}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl disabled:opacity-60 transition">
                {loading ? 'Đang tắt...' : '🔓 Xác nhận tắt TOTP'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Phiên đăng nhập ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-gray-700">📱 Phiên đăng nhập</h2>
        <p className="text-sm text-gray-500">
          Đăng xuất khỏi tất cả thiết bị (thu hồi toàn bộ refresh tokens).
        </p>
        <button
          onClick={handleLogoutAll}
          className="border border-red-300 text-red-600 hover:bg-red-50 font-semibold py-2 px-4 rounded-xl text-sm transition"
        >
          🚪 Đăng xuất tất cả thiết bị
        </button>
      </div>
    </div>
  )
}
