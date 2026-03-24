import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // Timestamp lúc Vite server khởi động — thay đổi mỗi lần restart
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
