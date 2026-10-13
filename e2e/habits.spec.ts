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

test('今日の画面で習慣の枠を動かすと、その日だけ時間が変わり、読み込み直しても残る', async ({ page }) => {
  await page.goto('/?view=habits')
  await addHabit(page, 'gym')
  await page.goto('/?view=planner')
  const slot = page.locator('[data-block-id^="habit-slot::"]')
  await slot.scrollIntoViewIfNeeded()
  const before = (await slot.boundingBox())!
  // 真ん中をつかんで 2 時間ぶん下へ（端をつかむと長さを変える）
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2 + 60, { steps: 5 })
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2 + 120, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByText(/Set “gym” to 11:00–12:00 on .* only/)).toBeVisible()
  const moved = (await slot.boundingBox())!
  expect(Math.round(moved.y - before.y)).toBe(120)

  await page.reload()
  await expect(slot).toContainText('11:00')
  // 習慣の時間は変わらない
  await page.goto('/?view=habits')
  await expect(page.locator('[data-habit-row]')).toContainText('9:00')
})
