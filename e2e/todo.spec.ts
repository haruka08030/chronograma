import { expect, test, type Page } from '@playwright/test'

/** 端末に保存したタスク（zustand の persist の保存内容） */
async function savedTasks(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('chronograma-storage')
    const tasks = raw ? (JSON.parse(raw).state.tasks as { title: string; completed: boolean }[]) : []
    return tasks.map(({ title, completed }) => ({ title, completed }))
  })
}

test('To-Do でタスクを足して完了にし、読み込み直しても残っている', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('button', { name: /^To.Do$/ }).click()

  const input = page.getByPlaceholder('Add a to-do')
  await input.fill('Buy milk')
  await input.press('Enter')

  const row = page.locator('[data-task-row]').filter({ hasText: 'Buy milk' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Mark complete' }).click()

  // 完了の欄へ移り、未完了の行には残らない
  await expect(row.getByRole('button', { name: 'Mark complete' })).toHaveCount(0)
  await expect.poll(() => savedTasks(page)).toEqual([{ title: 'Buy milk', completed: true }])

  await page.reload()

  await expect.poll(() => savedTasks(page)).toEqual([{ title: 'Buy milk', completed: true }])
  await expect(page.getByPlaceholder('Add a to-do')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark complete' })).toHaveCount(0)

  // 完了の一覧に、完了のまま出る
  await page.getByRole('button', { name: 'Completed', exact: true }).click()
  const done = page.locator('[data-task-row]').filter({ hasText: 'Buy milk' })
  await expect(done.getByRole('button', { name: 'Mark incomplete' })).toBeVisible()
})
