import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import path from 'path'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
        proxyTimeout: 0,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Ensure streaming endpoints don't have content-length issues
            if (req.headers['content-type']?.includes('application/json')) {
              proxyReq.setHeader('Connection', 'keep-alive')
            }
          })
        },
      },
    },
  },
})
