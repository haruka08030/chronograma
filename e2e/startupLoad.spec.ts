import { expect, test } from '@playwright/test'

// ログインしていない人には要らないもの（同期・Notion・Canvas・Google への送信・CSV の取り込み）。ログインしてから・使うときに import() で読む
const NOT_AT_START = [
  'components/AccountSync.tsx',
  'hooks/useSupabaseSync.ts',
  'hooks/useNotionSync.ts',
  'hooks/useCanvasSync.ts',
  'hooks/useGooglePush.ts',
  'lib/supabaseData.ts',
  'lib/syncPull.ts',
  'lib/timerSync.ts',
  'lib/notion.ts',
  'lib/canvas.ts',
  'lib/googlePushQueue.ts',
  'lib/googleDeleted.ts',
  'lib/importTasksCsv.ts',
]

test('ログインしていなければ、同期・連携・CSV の取り込みのコードを読まない', async ({ page }) => {
  const loaded: string[] = []
  page.on('request', (req) => loaded.push(new URL(req.url()).pathname))
  await page.goto('/')
  // 最初の 1 回は dev サーバーが変換するので待つ
  await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 30_000 })
  // 画面の部品・手すきの先読みまで読み終えるのを待つ
  await page.waitForLoadState('networkidle')
  // 数え漏れでないことを確かめる（起動時に読むものは拾えている）
  expect(loaded.some((p) => p.endsWith('/src/store/taskStore.ts'))).toBe(true)
  expect(loaded.filter((p) => NOT_AT_START.some((m) => p.endsWith(`/src/${m}`)))).toEqual([])
})
