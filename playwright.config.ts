import { defineConfig, devices } from '@playwright/test'

const PORT = 5190

/**
 * 画面を通しで動かすテスト（e2e/）。この作業ツリーの dev サーバーを起こして開く。
 * - chromium: PC の Chrome・英語。全部のテスト
 * - webkit-ja: iPhone の Safari（WebKit）・日本語。はじめの案内・To-Do・日本語の入力（`japanese.spec.ts`）だけ。
 *   文言は `e2e/i18n.ts` の `t()` で、その回の言語の鍵から引く
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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'webkit-ja',
      use: { ...devices['iPhone 14'], locale: 'ja-JP' },
      testMatch: ['onboarding.spec.ts', 'todo.spec.ts', 'japanese.spec.ts'],
    },
  ],
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
