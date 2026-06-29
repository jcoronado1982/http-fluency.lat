import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5173,
    allowedHosts: true,
    watch: {
      usePolling: true
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      '/card_images': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      '/card_audio': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      }
    }
  }
})
