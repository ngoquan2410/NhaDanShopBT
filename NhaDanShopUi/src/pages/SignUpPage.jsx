import { useState, useRef } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

// ── Helper: gọi API với Bearer token tùy chỉnh ───────────────────────────────
async function fetchWithToken(url, token, body) {
  return fetch(`${API}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step }) {
  const steps = ['Tạo tài khoản', 'Cài TOTP', 'Hoàn tất']
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {steps.map((label, i) => {
        const idx = i + 1
        const isActive   = idx === step
        const isDone     = idx < step
        return (
          <div key={idx} className="flex items-center">
            <div className={`flex flex-col items-center`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
                ${isDone  ? 'bg-amber-500 border-amber-500 text-white'
                : isActive ? 'bg-white border-amber-500 text-amber-600'
                           : 'bg-white border-gray-300 text-gray-400'}`}>
                {isDone ? '✓' : idx}
              </div>
              <span className={`text-xs mt-1 font-medium ${isActive ? 'text-amber-600' : isDone ? 'text-amber-500' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-10 h-0.5 mb-5 mx-1 ${isDone ? 'bg-amber-500' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function SignUpPage() {
  // ── Step 1 state ──────────────────────────────────────────────────────────
  const [username,    setUsername]    = useState('')
  const [fullName,    setFullName]    = useState('')
  const [password,    setPassword]    = useState('')
  const [confirmPw,   setConfirmPw]   = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // ── Step 2 state ──────────────────────────────────────────────────────────
  const [setupData,    setSetupData]    = useState(null)   // { secret, qrCodeImage, otpauthUrl }
  const [preAuthToken, setPreAuthToken] = useState('')     // accessToken từ /signup
  const [signupResp,   setSignupResp]   = useState(null)   // toàn bộ response signup
  const [otp,          setOtp]          = useState('')
  const otpRef = useRef(null)

  // ── Common ────────────────────────────────────────────────────────────────
  const [step,    setStep]    = useState(1)
  const [loading, setLoading] = useState(false)

  const { login, isAuthenticated, isAdmin } = useAuth()
  const navigate = useNavigate()

  if (isAuthenticated) {
    return <Navigate to={isAdmin ? '/admin/dashboard' : '/store'} replace />
  }

  const passwordsMatch = password === confirmPw
  const canSubmit = username.trim().length >= 3
    && password.length >= 6
    && confirmPw.length >= 6
    && passwordsMatch
    && !loading

  // ── Bước 1: Đăng ký tài khoản ────────────────────────────────────────────
  const handleSignUp = async (e) => {
    e.preventDefault()
    if (!passwordsMatch) { toast.error('Mật khẩu xác nhận không khớp!'); return }

    setLoading(true)
    try {
      const res = await fetch(`${API}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          fullName: fullName.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || data.detail || 'Đăng ký thất bại, vui lòng thử lại!')
        return
      }

      // Lưu token tạm để gọi TOTP setup
      const token = data.accessToken
      setPreAuthToken(token)
      setSignupResp(data)

      // Gọi setup TOTP ngay lập tức
      const setupRes = await fetchWithToken('/api/auth/totp/setup', token, {})
      const setupJson = await setupRes.json()
      if (!setupRes.ok) {
        toast.error(setupJson.message || 'Không thể khởi tạo TOTP. Vui lòng thử lại!')
        return
      }

      setSetupData(setupJson)
      setStep(2)
      toast('📱 Quét mã QR để bật xác thực 2 yếu tố bắt buộc', { icon: '🔐' })
      setTimeout(() => otpRef.current?.focus(), 200)
    } catch {
      toast.error('Không thể kết nối đến server. Vui lòng thử lại!')
    } finally {
      setLoading(false)
    }
  }

  // ── Bước 2: Xác nhận TOTP OTP → bật TOTP → login ─────────────────────────
  const handleEnableTotp = async (e) => {
    e.preventDefault()
    if (otp.length !== 6) { toast.error('Mã OTP phải có 6 chữ số'); return }

    setLoading(true)
    try {
      const res = await fetchWithToken('/api/auth/totp/enable', preAuthToken, { otp })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || data.detail || 'Mã OTP không đúng, vui lòng thử lại!')
        setOtp('')
        otpRef.current?.focus()
        return
      }

      // TOTP enabled → dùng token đầy đủ từ signupResp để login
      // Cập nhật totpEnabled = true vào signupResp rồi login
      const finalResp = { ...signupResp, totpEnabled: true }
      login(finalResp)
      setStep(3)
      toast.success('🎉 Tài khoản đã tạo và bảo mật thành công!')
      setTimeout(() => navigate('/store', { replace: true }), 1800)
    } catch {
      toast.error('Không thể kết nối đến server!')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: 'linear-gradient(135deg,#fef3c7 0%,#fde68a 40%,#fbbf24 100%)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-amber-100">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">
            {step === 1 ? '🛒' : step === 2 ? '🔐' : '🎉'}
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Nhà Đan Shop</h1>
          <p className="text-gray-500 text-sm mt-1">
            {step === 1 ? 'Tạo tài khoản mới' : step === 2 ? 'Thiết lập bảo mật bắt buộc' : 'Đăng ký hoàn tất!'}
          </p>
        </div>

        <StepBar step={step} />

        {/* ── Step 1: Điền thông tin ──────────────────────────────────────── */}
        {step === 1 && (
          <form onSubmit={handleSignUp} className="space-y-4" noValidate>
            {/* Tên đăng nhập */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tên đăng nhập <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800"
                placeholder="Ít nhất 3 ký tự"
                minLength={3}
                maxLength={100}
                required
                autoFocus
                autoComplete="username"
              />
              {username.length > 0 && username.trim().length < 3 && (
                <p className="text-xs text-red-500 mt-1">Tên đăng nhập phải có ít nhất 3 ký tự</p>
              )}
            </div>

            {/* Họ và tên */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Họ và tên
                <span className="text-gray-400 text-xs ml-1">(tuỳ chọn)</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800"
                placeholder="Nguyễn Văn A"
                maxLength={150}
                autoComplete="name"
              />
            </div>

            {/* Mật khẩu */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mật khẩu <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800"
                  placeholder="Ít nhất 6 ký tự"
                  minLength={6}
                  maxLength={100}
                  required
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm" tabIndex={-1}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
              {password.length > 0 && password.length < 6 && (
                <p className="text-xs text-red-500 mt-1">Mật khẩu phải có ít nhất 6 ký tự</p>
              )}
            </div>

            {/* Xác nhận mật khẩu */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Xác nhận mật khẩu <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  className={`w-full border rounded-lg px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 text-gray-800 ${
                    confirmPw.length > 0 && !passwordsMatch
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-gray-300 focus:ring-amber-500'
                  }`}
                  placeholder="Nhập lại mật khẩu"
                  minLength={6}
                  maxLength={100}
                  required
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm" tabIndex={-1}>
                  {showConfirm ? '🙈' : '👁️'}
                </button>
              </div>
              {confirmPw.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-500 mt-1">Mật khẩu xác nhận không khớp</p>
              )}
              {confirmPw.length > 0 && passwordsMatch && password.length >= 6 && (
                <p className="text-xs text-green-600 mt-1">✅ Mật khẩu khớp</p>
              )}
            </div>

            {/* Ghi chú bắt buộc TOTP */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex gap-2">
              <span className="text-base">🔐</span>
              <span>
                Sau khi đăng ký, bạn <strong>bắt buộc</strong> phải thiết lập xác thực 2 yếu tố (TOTP)
                bằng Google Authenticator hoặc ứng dụng tương tự để bảo vệ tài khoản.
              </span>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Đang xử lý...
                </span>
              ) : '➡️ Tiếp theo'}
            </button>
          </form>
        )}

        {/* ── Step 2: Cài đặt TOTP bắt buộc ─────────────────────────────── */}
        {step === 2 && setupData && (
          <div className="space-y-4">
            {/* Hướng dẫn */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
              <p className="font-semibold">📱 Hướng dẫn cài đặt xác thực 2 yếu tố:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Tải <strong>Google Authenticator</strong> / <strong>Authy</strong> / <strong>Microsoft Authenticator</strong></li>
                <li>Mở app → chọn <strong>"Thêm tài khoản"</strong> → <strong>"Quét mã QR"</strong></li>
                <li>Quét mã QR bên dưới</li>
                <li>Nhập mã 6 chữ số từ app để xác nhận</li>
              </ol>
            </div>

            {/* QR Code */}
            {setupData.qrCodeImage && (
              <div className="flex justify-center">
                <div className="p-3 border-4 border-amber-400 rounded-2xl shadow-lg bg-white">
                  <img
                    src={setupData.qrCodeImage}
                    alt="TOTP QR Code"
                    className="w-44 h-44"
                  />
                </div>
              </div>
            )}

            {/* Secret key */}
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Không quét được? Nhập secret key thủ công:</p>
              <p className="font-mono text-xs font-bold text-gray-800 break-all select-all bg-white border rounded px-2 py-1">
                {setupData.secret}
              </p>
            </div>

            {/* Nhập OTP xác nhận */}
            <form onSubmit={handleEnableTotp} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nhập mã OTP từ app để xác nhận: <span className="text-red-500">*</span>
                </label>
                <input
                  ref={otpRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800 text-center text-2xl font-mono tracking-[0.5em]"
                  placeholder="000000"
                  required
                  autoComplete="one-time-code"
                />
              </div>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Đang kích hoạt...
                  </span>
                ) : '✅ Xác nhận & Hoàn tất đăng ký'}
              </button>
            </form>

            <p className="text-xs text-center text-red-500 font-medium">
              ⚠️ Bạn phải hoàn thành bước này mới có thể sử dụng tài khoản
            </p>
          </div>
        )}

        {/* ── Step 3: Hoàn tất ───────────────────────────────────────────── */}
        {step === 3 && (
          <div className="text-center space-y-4 py-4">
            <div className="text-6xl">🎉</div>
            <h2 className="text-xl font-bold text-green-700">Đăng ký thành công!</h2>
            <p className="text-gray-600 text-sm">
              Tài khoản <span className="font-bold text-gray-800">{username}</span> đã được tạo và bảo mật bằng TOTP.
            </p>
            <p className="text-gray-400 text-xs">Đang chuyển đến cửa hàng...</p>
            <div className="flex justify-center">
              <svg className="animate-spin h-6 w-6 text-amber-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          </div>
        )}

        {/* Links – chỉ hiện ở step 1 */}
        {step === 1 && (
          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-gray-600">
              Đã có tài khoản?{' '}
              <Link to="/login" className="text-amber-600 hover:text-amber-800 font-semibold hover:underline">
                Đăng nhập ngay
              </Link>
            </p>
            <Link to="/store" className="block text-sm text-gray-400 hover:text-gray-600 hover:underline">
              ← Quay lại cửa hàng
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
