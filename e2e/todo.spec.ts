import type { Page } from '@playwright/test'
import { expect, test } from './i18n'
import { savedState } from './savedData'

/** 端末に保存したタスク（zustand の persist の保存内容） */
async function savedTasks(page: Page) {
  const tasks = ((await savedState(page))?.tasks ?? []) as { title: string; completed: boolean }[]
  return tasks.map(({ title, completed }) => ({ title, completed }))
}

test('To-Do でタスクを足して完了にし、読み込み直しても残っている', async ({ page, t, ja, isMobile }) => {
  const title = ja ? '牛乳を買う' : 'Buy milk'
  await page.goto('/')
  // 最初の 1 回は dev サーバーが変換するので待つ（WebKit は遅い）
  await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 30_000 })
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^To.Do$/ })
    .click()

  const input = page.getByPlaceholder(t('quickAdd.placeholder'))
  await input.fill(title)
  await input.press('Enter')

  // 一覧は listbox、行は option（名前はタスク名）。完了の印はタスク名つきのチェックボックス
  const complete = t('taskItem.completeItem', { title })
  const row = page.getByRole('listbox').getByRole('option', { name: title })
  await expect(row).toBeVisible()
  await row.getByRole('checkbox', { name: complete, checked: false }).click()

  // 完了の欄へ移り、未完了の行には残らない
  await expect(page.getByRole('checkbox', { name: complete, checked: false })).toHaveCount(0)
  await expect.poll(() => savedTasks(page)).toEqual([{ title, completed: true }])

  await page.reload()

  await expect.poll(() => savedTasks(page)).toEqual([{ title, completed: true }])
  await expect(page.getByPlaceholder(t('quickAdd.placeholder'))).toBeVisible()
  await expect(page.getByRole('checkbox', { name: complete, checked: false })).toHaveCount(0)

  // 完了の一覧に、完了のまま出る（スマホ幅はリストのドロワーから開く）
  if (isMobile) await page.getByRole('button', { name: t('taskList.openLists') }).click()
  await page.getByRole('button', { name: t('sidebar.views.completed'), exact: true }).click()
  const done = page.getByRole('listbox').getByRole('option', { name: title })
  await expect(done.getByRole('checkbox', { name: complete })).toBeChecked()
})
