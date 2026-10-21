import type { Page } from '@playwright/test'
import { expect, test } from './i18n'
import { savedState } from './savedData'

// 日本語の画面（Chromium の回もこのファイルだけ日本語で開く。iPhone の Safari の回は元から日本語）
test.use({ locale: 'ja-JP' })

type SavedTask = { title: string; dueDate: string | null; scheduledDate: string | null }
async function savedTasks(page: Page): Promise<SavedTask[]> {
  return (((await savedState(page))?.tasks ?? []) as SavedTask[]).map(({ title, dueDate, scheduledDate }) => ({
    title,
    dueDate,
    scheduledDate,
  }))
}

/** 変換中のキー（Safari は変換の確定・取り消しのキーを isComposing=false・keyCode 229 で送ることがある） */
async function pressDuringComposition(page: Page, key: 'Enter' | 'Escape') {
  await page.evaluate((k) => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
    Object.defineProperty(event, 'keyCode', { get: () => 229 })
    document.activeElement?.dispatchEvent(event)
  }, key)
}

async function openTodo(page: Page, t: (key: string) => string) {
  await page.goto('/')
  // 最初の 1 回は dev サーバーが変換するので待つ（WebKit は遅い）
  await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 30_000 })
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^To.Do$/ })
    .click()
  return page.getByPlaceholder(t('quickAdd.placeholder'))
}

test('クイック追加の「10/3 レポート」は、題名「レポート」で 10/3 の日付が付く', async ({ page, t }) => {
  const input = await openTodo(page, t)
  await input.fill('10/3 レポート')
  await input.press('Enter')
  await expect(page.getByRole('listbox').getByRole('option', { name: 'レポート' })).toBeVisible()
  await expect
    .poll(async () => {
      const [task] = await savedTasks(page)
      return task && { title: task.title, date: (task.dueDate ?? task.scheduledDate)?.slice(5) }
    })
    .toEqual({ title: 'レポート', date: '10-03' })
})

test('題名を変換中の Esc・Enter（keyCode 229）では、打った字が消えず、追加もしない', async ({ page, t }) => {
  const input = await openTodo(page, t)
  await input.fill('れぽーと')
  await pressDuringComposition(page, 'Escape')
  await expect(input).toHaveValue('れぽーと')
  await expect(input).toBeFocused()
  await pressDuringComposition(page, 'Enter')
  await expect(input).toHaveValue('れぽーと')
  expect(await savedTasks(page)).toEqual([])

  // 変換を終えた Enter で追加する
  await input.press('Enter')
  await expect(page.getByRole('listbox').getByRole('option', { name: 'れぽーと' })).toBeVisible()

  // 変換していない Esc は欄を空にする（上の 229 の Esc と違うことを確かめる）
  await input.fill('メモ')
  await input.press('Escape')
  await expect(input).toHaveValue('')
})
