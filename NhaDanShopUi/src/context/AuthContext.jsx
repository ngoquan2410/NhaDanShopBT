import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

const AuthContext = createContext(null)

// ── Helpers lưu trữ token ─────────────────────────────────────────────────────
const STORAGE = {
  ACCESS_TOKEN:  'nds_access_token',
  REFRESH_TOKEN: 'nds_refresh_token',
  USER:          'nds_user',
}

function loadUser() {
  try { return JSON.parse(localStorage.getItem(STORAGE.USER)) } catch { return null }
}

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(loadUser)
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem(STORAGE.ACCESS_TOKEN))
  const refreshTimerRef = useRef(null)

  // ── Lưu token sau login ──────────────────────────────────────────────────────
  const saveTokens = useCallback((tokens, userData) => {
    localStorage.setItem(STORAGE.ACCESS_TOKEN,  tokens.accessToken)
    localStorage.setItem(STORAGE.REFRESH_TOKEN, tokens.refreshToken)
    localStorage.setItem(STORAGE.USER,          JSON.stringify(userData))
    setAccessToken(tokens.accessToken)
    setUser(userData)
    // Đặt timer auto-refresh trước khi access token hết hạn
    scheduleRefresh(tokens.expiresIn)
  }, [])

  // ── Auto-refresh access token ─────────────────────────────────────────────────
  const scheduleRefresh = useCallback((expiresInSeconds) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    // Refresh sớm 60 giây trước khi hết hạn
    const delayMs = Math.max(0, (expiresInSeconds - 60) * 1000)
    refreshTimerRef.current = setTimeout(async () => {
      const raw = localStorage.getItem(STORAGE.REFRESH_TOKEN)
      if (!raw) return
      try {
        const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
        const res = await fetch(`${API}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: raw }),
        })
        if (!res.ok) { logout(); return }
        const data = await res.json()
        localStorage.setItem(STORAGE.ACCESS_TOKEN,  data.accessToken)
        localStorage.setItem(STORAGE.REFRESH_TOKEN, data.refreshToken)
        setAccessToken(data.accessToken)
        scheduleRefresh(data.expiresIn)
      } catch {
        logout()
      }
    }, delayMs)
  }, [])

  // ── Đồng bộ giữa các tab ─────────────────────────────────────────────────────
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE.USER) {
        try { setUser(e.newValue ? JSON.parse(e.newValue) : null) } catch { setUser(null) }
      }
      if (e.key === STORAGE.ACCESS_TOKEN) {
        setAccessToken(e.newValue)
        if (!e.newValue) setUser(null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // ── Khởi động lại timer khi reload trang ──────────────────────────────────────
  useEffect(() => {
    if (accessToken && user) {
      // Giải mã JWT để lấy exp
      try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]))
        const remainingSecs = payload.exp - Math.floor(Date.now() / 1000)
        if (remainingSecs > 0) scheduleRefresh(remainingSecs)
        else logout() // token đã hết hạn → tự logout
      } catch { /* ignore */ }
    }
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current) }
  }, []) // chỉ chạy 1 lần khi mount

  // ── Login callback (gọi từ LoginPage sau khi nhận response từ BE) ────────────
  const login = useCallback((loginResponse) => {
    const userData = {
      username: loginResponse.username,
      fullName: loginResponse.fullName,
      roles:    Array.from(loginResponse.roles || []),
      totpEnabled: loginResponse.totpEnabled,
    }
    saveTokens({
      accessToken:  loginResponse.accessToken,
      refreshToken: loginResponse.refreshToken,
      expiresIn:    loginResponse.expiresIn,
    }, userData)
  }, [saveTokens])

  // ── Logout ───────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    const raw = localStorage.getItem(STORAGE.REFRESH_TOKEN)
    const at  = localStorage.getItem(STORAGE.ACCESS_TOKEN)
    // Gọi BE revoke (best-effort)
    if (raw) {
      const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
      fetch(`${API}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(at ? { Authorization: `Bearer ${at}` } : {}),
        },
        body: JSON.stringify({ refreshToken: raw }),
      }).catch(() => {})
    }
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    localStorage.removeItem(STORAGE.ACCESS_TOKEN)
    localStorage.removeItem(STORAGE.REFRESH_TOKEN)
    localStorage.removeItem(STORAGE.USER)
    setAccessToken(null)
    setUser(null)
  }, [])

  const isAdmin         = user?.roles?.includes('ROLE_ADMIN')
  const isAuthenticated = !!user && !!accessToken

  return (
    <AuthContext.Provider value={{
      user,
      accessToken,
      login,
      logout,
      isAdmin,
      isAuthenticated,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
