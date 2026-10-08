import { expect, test, type Page } from '@playwright/test'

async function addHabit(page: Page, name: string) {
  await page.getByRole('button', { name: '+ Add habit' }).click()
  await page.getByPlaceholder('Name (e.g. morning stretch)').fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
}

test('習慣を足すとカードが閉じ、表に新しい行が見え、次に開くと名前は空で続けて足せる', async ({ page }) => {
  await page.goto('/?view=habits')
  await addHabit(page, 'stretch')
  await expect(page.getByRole('heading', { name: 'New habit' })).toHaveCount(0)
  await expect(page.locator('[data-habit-row]').filter({ hasText: 'stretch' })).toBeInViewport()

  await page.getByRole('button', { name: '+ Add habit' }).click()
  await expect(page.getByPlaceholder('Name (e.g. morning stretch)')).toHaveValue('')
  await page.getByPlaceholder('Name (e.g. morning stretch)').fill('read')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('[data-habit-row]')).toHaveCount(2)
})

for (const size of [
  { name: 'PC', width: 1280, height: 800 },
  { name: 'スマホ', width: 390, height: 844 },
]) {
  test(`${size.name}: 達成の丸が曜日・日付の見出しの真下にそろう`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto('/?view=habits')
    await addHabit(page, 'stretch')
    const row = page.locator('[data-habit-row]').first()
    const cells = row.locator('button[aria-pressed]')
    const heads = page.getByText('Mon', { exact: true }).locator('..').locator('..').locator('> div')
    await expect(heads).toHaveCount(7)
    await expect(cells).toHaveCount(7)
    for (let i = 0; i < 7; i++) {
      const h = (await heads.nth(i).boundingBox())!
      const c = (await cells.nth(i).boundingBox())!
      expect(Math.abs(h.x + h.width / 2 - (c.x + c.width / 2))).toBeLessThan(1)
    }
  })
}
