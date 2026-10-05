import { defineConfig, devices } from '@playwright/test'

const PORT = 5190

/**
 * 画面を通しで動かすテスト（e2e/）。この作業ツリーの dev サーバーを起こして Chromium で開く。
 * Supabase の設定は空にして、ログインなし（端末だけに保存）の状態で動かす。
 * 実行中の変数は .env より優先されるので、手元に .env があっても本番には繋がない。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
})
