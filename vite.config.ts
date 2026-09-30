import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_URL || 'http://localhost:8080',
          changeOrigin: true,
        },
        '/finnhub': {
          target: env.VITE_FINANCIAL_SERVICE_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
