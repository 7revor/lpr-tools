import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 本地联调：另开终端运行 npm run dev:worker（wrangler dev 默认监听 8787）
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
})
