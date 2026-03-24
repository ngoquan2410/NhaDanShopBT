import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

// ── Detect FE server restart bằng BUILD_TIME ───────────────────────────────
// __BUILD_TIME__ được inject bởi Vite (vite.config.js → define)
// Mỗi lần `npm run dev` / Vite restart → giá trị này thay đổi
// HMR reload (sửa code) → Vite KHÔNG restart → BUILD_TIME giữ nguyên → session giữ
// Vite server restart → BUILD_TIME mới → xóa auth → bắt login lại
// Mở tab mới cùng browser → localStorage share → BUILD_TIME vẫn match → giữ session
;(function clearAuthOnFERestart() {
  const currentBuild = __BUILD_TIME__
  const savedBuild   = localStorage.getItem('nds_build_time')

  if (savedBuild !== currentBuild) {
    // FE server đã restart hoặc lần đầu chạy → clear auth
    localStorage.removeItem('nds_creds')
    localStorage.removeItem('nds_user')
    localStorage.setItem('nds_build_time', currentBuild)
  }
  // Nếu BUILD_TIME khớp → HMR reload hoặc mở tab mới → giữ nguyên session
})()
// ──────────────────────────────────────────────────────────────────────────


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Chỉ retry khi lỗi mạng, KHÔNG retry khi 4xx (401/403/404)
      // Tránh logout nhầm khi BE đang khởi động
      retry: (failureCount, error) => {
        const status = error?.response?.status
        if (status && status >= 400 && status < 500) return false // không retry 4xx
        return failureCount < 2 // retry tối đa 2 lần cho network errors
      },
      staleTime: 30_000,        // 30s cache trước khi stale
      refetchOnWindowFocus: false, // không refetch khi focus tab → tránh flash
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: { fontSize: '14px', maxWidth: '400px' },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
)
