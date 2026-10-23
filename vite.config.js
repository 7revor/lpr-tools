import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 本地联调：另开终端运行 npm run dev:worker（wrangler dev 默认监听 8787）
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  // .claude 下有 git worktree，在主目录运行测试时不要把其他 worktree 的用例一起跑
  test: {
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
