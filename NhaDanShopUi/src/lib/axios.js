import axios from 'axios'
import toast from 'react-hot-toast'

// ── Quy tắc xác định baseURL ──────────────────────────────────────────────────
//
//  VITE_API_BASE_URL được set  → dùng giá trị đó (AWS production)
//  VITE_API_BASE_URL KHÔNG set → dùng '' (relative URL)
//    • Dev local : /api/* → Vite proxy (vite.config.js) → localhost:8080
//    • Production: /api/* → Nginx proxy → backend container
//
const _envBase = import.meta.env.VITE_API_BASE_URL ?? ''
const _rawBase = _envBase.trim().replace(/\/api\/?$/, '').replace(/\/$/, '')

// Sanity check: nếu đang chạy ở localhost:5173 mà env vẫn chứa localhost:8080
// → reset về '' để dùng Vite proxy, tránh gọi thẳng backend bypass proxy
export const API_BASE = (
  typeof window !== 'undefined' &&
  window.location.hostname === 'localhost' &&
  _rawBase === 'http://localhost:8080'
) ? '' : _rawBase

// _resolvedBase = API_BASE (alias nội bộ)
const _resolvedBase = API_BASE

const api = axios.create({
  baseURL: _resolvedBase,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
})

// ── Request interceptor: đính kèm Bearer token ────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nds_access_token')
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor: auto-refresh khi 401 ───────────────────────────────
let isRefreshing = false
let failedQueue = []  // các request bị 401 đang chờ refresh

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token)
  })
  failedQueue = []
}

let redirecting = false

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config
    const status = err.response?.status

    // ── 401: thử refresh token một lần ──────────────────────────────────────
    if (status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('nds_refresh_token')

      if (!refreshToken) {
        // Không có refresh token → redirect login
        if (!redirecting) {
          redirecting = true
          window.location.href = '/login'
          setTimeout(() => { redirecting = false }, 3000)
        }
        return Promise.reject(err)
      }

      if (isRefreshing) {
        // Đang refresh → xếp hàng chờ
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(token => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`
          return api(originalRequest)
        }).catch(e => Promise.reject(e))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await axios.post(`${_resolvedBase}/api/auth/refresh`, { refreshToken })
        const { accessToken, refreshToken: newRefresh } = res.data

        localStorage.setItem('nds_access_token',  accessToken)
        localStorage.setItem('nds_refresh_token', newRefresh)

        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
        originalRequest.headers['Authorization'] = `Bearer ${accessToken}`

        processQueue(null, accessToken)
        return api(originalRequest)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        // Refresh thất bại → xóa tokens và redirect login
        localStorage.removeItem('nds_access_token')
        localStorage.removeItem('nds_refresh_token')
        localStorage.removeItem('nds_user')
        if (!redirecting) {
          redirecting = true
          toast.error('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại!')
          setTimeout(() => {
            redirecting = false
            window.location.href = '/login'
          }, 1500)
        }
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    // ── 403: không có quyền — chỉ hiện toast khi đã đăng nhập (bỏ qua trang công khai)
    if (status === 403) {
      const token = localStorage.getItem('nds_access_token')
      // Chỉ báo lỗi khi đang đăng nhập (có token), tránh spam toast ở trang cửa hàng công khai
      if (token) {
        toast.error('Bạn không có quyền thực hiện thao tác này!')
      }
    }

    return Promise.reject(err)
  }
)

export default api
