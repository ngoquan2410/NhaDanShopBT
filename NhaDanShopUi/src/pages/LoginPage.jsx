﻿import { useState, useRef } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { API_BASE as API } from '../lib/axios'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)

  // ── TOTP Step 2 ───────────────────────────────────────────────────────────
  const [totpStep, setTotpStep]         = useState(false)  // đang ở bước nhập OTP?
  const [preAuthToken, setPreAuthToken] = useState('')
  const [otp, setOtp]                   = useState('')
  const otpInputRef = useRef(null)

  const { login, isAuthenticated, isAdmin } = useAuth()
  const navigate = useNavigate()

  if (isAuthenticated) {
    return <Navigate to={isAdmin ? '/admin/dashboard' : '/store'} replace />
  }

  // ── Bước 1: Login username/password ────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.message || data.detail || 'Sai tên đăng nhập hoặc mật khẩu!')
        return
      }

      if (data.totpRequired) {
        // TOTP bật → lưu pre-auth token rồi chuyển sang bước 2
        setPreAuthToken(data.accessToken)   // accessToken chứa preAuthToken
        setTotpStep(true)
        toast('🔐 Vui lòng nhập mã xác thực từ ứng dụng Authenticator', { icon: '📱' })
        setTimeout(() => otpInputRef.current?.focus(), 100)
        return
      }

      // Không có TOTP → đăng nhập hoàn tất
      login(data)
      toast.success('Đăng nhập thành công!')
      navigate(data.roles?.includes('ROLE_ADMIN') ? '/admin/dashboard' : '/store', { replace: true })
    } catch {
      toast.error('Không thể kết nối đến server. Vui lòng thử lại!')
    } finally {
      setLoading(false)
    }
  }

  // ── Bước 2: Xác thực TOTP ─────────────────────────────────────────────────
  const handleVerifyTotp = async (e) => {
    e.preventDefault()
    if (otp.length !== 6) { toast.error('Mã OTP phải có 6 chữ số'); return }
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/auth/verify-totp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preAuthToken, otp }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.message || data.detail || 'Mã OTP không đúng hoặc đã hết hạn!')
        setOtp('')
        otpInputRef.current?.focus()
        return
      }

      login(data)
      toast.success('Đăng nhập thành công!')
      navigate(data.roles?.includes('ROLE_ADMIN') ? '/admin/dashboard' : '/store', { replace: true })
    } catch {
      toast.error('Không thể kết nối đến server!')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{background:'linear-gradient(135deg,#fef3c7 0%,#fde68a 40%,#fbbf24 100%)'}}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-amber-100">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">{totpStep ? '🔐' : '🛒'}</div>
          <h1 className="text-2xl font-bold text-gray-800">Nhã Đan Shop</h1>
          <p className="text-gray-500 text-sm mt-1">
            {totpStep ? 'Xác thực hai yếu tố (2FA)' : 'Đăng nhập để tiếp tục'}
          </p>
        </div>

        {/* ── Bước 1: username / password ──────────────────────────────────── */}
        {!totpStep && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-800"
                placeholder="Nhập tên đăng nhập"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-800"
                placeholder="Nhập mật khẩu"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-60 mt-2"
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        )}

        {/* ── Bước 2: nhập TOTP OTP ────────────────────────────────────────── */}
        {totpStep && (
          <form onSubmit={handleVerifyTotp} className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
              <p className="font-semibold mb-1">📱 Mở ứng dụng Authenticator</p>
              <p>Nhập mã 6 chữ số từ Google Authenticator / Authy / Microsoft Authenticator.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mã xác thực (OTP)</label>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-800 text-center text-2xl font-mono tracking-[0.5em]"
                placeholder="000000"
                required
                autoComplete="one-time-code"
              />
            </div>
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {loading ? 'Đang xác thực...' : '✅ Xác nhận'}
            </button>
            <button
              type="button"
              onClick={() => { setTotpStep(false); setOtp(''); setPreAuthToken('') }}
              className="w-full text-gray-500 hover:text-gray-700 text-sm py-1"
            >
              ← Quay lại đăng nhập
            </button>
          </form>
        )}

        <div className="mt-5 text-center space-y-2">
          <p className="text-sm text-gray-600">
            Chưa có tài khoản?{' '}
            <Link to="/signup" className="text-amber-600 hover:text-amber-800 font-semibold hover:underline">
              Đăng ký ngay
            </Link>
          </p>
          <Link to="/store" className="block text-sm text-green-700 hover:text-green-900 hover:underline">
            ← Quay lại cửa hàng
          </Link>
        </div>
      </div>
    </div>
  )
}
