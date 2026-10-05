import { expect, test } from '@playwright/test'

test('はじめて開くと今日の画面に 3 ステップが出て、やるとチェックが付き、× で閉じたら読み込み直しても出ない', async ({ page }) => {
  await page.goto('/')
  const guide = page.getByRole('region', { name: 'Getting started' })
  await expect(guide).toBeVisible()
  await expect(guide.getByRole('listitem')).toHaveCount(3)

  // 例を押すと追加欄に入り、Enter で時刻つきの To-Do になる（① と ② が済む）
  await guide.getByRole('button', { name: 'Put “3pm essay 1h” in the add field' }).click()
  const input = page.getByPlaceholder('Add', { exact: true })
  await expect(input).toHaveValue('3pm essay 1h')
  await input.press('Enter')
  await expect(guide.getByRole('listitem').filter({ hasText: 'Add one thing to do' })).toContainText('(done)')
  await expect(guide.getByRole('listitem').filter({ hasText: 'Give it a time' })).toContainText('(done)')
  await expect(guide.getByRole('listitem').filter({ hasText: 'Record it with ▶' })).not.toContainText('(done)')

  await guide.getByRole('button', { name: 'Close the guide' }).click()
  await expect(guide).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('option', { name: 'essay' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Getting started' })).toHaveCount(0)
})
