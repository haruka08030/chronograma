import { expect, test, type Page } from '@playwright/test'

/** 今日の画面の予定の列（左半分）で、時刻（分）から時刻までドラッグする。`up` しなければ押したまま */
async function dragPlan(page: Page, fromMin: number, toMin: number, { up = true } = {}) {
  const column = page.locator('[data-datekey]').first()
  const box = (await column.boundingBox())!
  const x = box.x + box.width / 4
  const y = (min: number) => box.y + (min / 60) * (box.height / 24)
  await page.mouse.move(x, y(fromMin))
  await page.mouse.down()
  await page.mouse.move(x, y(toMin), { steps: 8 })
  if (up) await page.mouse.up()
  return { x, y }
}

test('ドラッグで作る枠は下の予定の始まりでいったん止まり、さらに引くと合わせる（#599）', async ({ page }) => {
  await page.goto('/?view=planner')
  await page.getByText('20:00', { exact: true }).first().scrollIntoViewIfNeeded()

  await dragPlan(page, 20 * 60, 21 * 60)
  const title = page.locator('input:focus')
  await title.fill('Block')
  await title.press('Enter')
  await expect(page.getByRole('button', { name: 'Block 20:00 – 21:00' })).toBeVisible()

  const { x, y } = await dragPlan(page, 19 * 60, 20 * 60 + 10, { up: false })
  await expect(page.getByText('19:00 – 20:00')).toBeVisible()
  await page.mouse.move(x, y(20 * 60 + 40), { steps: 4 })
  await expect(page.getByText('19:00 – 20:45')).toBeVisible()
  await page.mouse.move(x, y(20 * 60 + 5), { steps: 4 })
  await expect(page.getByText('19:00 – 20:00')).toBeVisible()
  await page.mouse.up()
})
