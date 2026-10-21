import { expect, test } from '@playwright/test'

test('はじめて開くと今日の画面に 3 ステップの案内が出て、進むと次のステップに変わり、× で閉じたら読み込み直しても出ない', async ({
  page,
}) => {
  await page.goto('/')
  const guide = page.getByRole('region', { name: 'Getting started' })
  await expect(guide).toBeVisible()
  await expect(guide).toContainText('Step 1 of 3: Add one thing to do')

  // 追加欄の例を押すと欄に入り、Enter で時刻つきの To-Do になる（① と ② が済む）
  await page.getByRole('button', { name: 'Put “3pm essay 1h” in the add field' }).click()
  const input = page.getByPlaceholder(/^e\.g\. /)
  await expect(input).toHaveValue('3pm essay 1h')
  await input.press('Enter')
  await expect(guide).toContainText('Step 3 of 3: Press ▶ on the row when you start')

  await guide.getByRole('button', { name: 'Close the guide' }).click()
  await expect(guide).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('option', { name: 'essay' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Getting started' })).toHaveCount(0)
})
