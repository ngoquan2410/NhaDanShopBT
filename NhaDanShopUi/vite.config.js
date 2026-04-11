import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Buộc browser không cache JS/CSS trong dev mode
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
    // Vite proxy: chặn /api/* → forward đến Spring Boot
    // Browser gọi /api/products → Vite proxy → localhost:8080/api/products
    // → Không có CORS issue vì đây là server-to-server request
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('\n[Vite Proxy] ❌ Lỗi kết nối backend:', err.message)
            console.log('[Vite Proxy] → Đảm bảo Spring Boot đang chạy trên port 8080\n')
          })
        },
      },
    },
  },
  define: {
    __BUILD_TIME__: JSON.stringify(Date.now().toString()),
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'chart-vendor': ['recharts'],
          'utils-vendor': ['axios', 'dayjs', 'react-hot-toast'],
        },
      },
    },
  },
})


