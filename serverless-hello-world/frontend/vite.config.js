import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

const port = process.env.PORT || 3000;
const backend_port = process.env.BACKEND_PORT || 3001;

export default defineConfig({
  server: {
    port: port,
    https: true,
    address: 'localhost',
    proxy: {
      '/api': {
        target: `http://localhost:${backend_port}`,
        changeOrigin: true,
        pathRewrite: {
          '^/api': ''
        },
      }
    }
  },
  plugins: [mkcert(),react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
  },
})
