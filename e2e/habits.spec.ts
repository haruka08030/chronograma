import { expect, test, type Page } from '@playwright/test'

/** 新しい習慣は時間なしから始まる。`timed` なら「時間を決める」で 9:00〜10:00 にする */
async function addHabit(page: Page, name: string, { timed = false } = {}) {
  await page.getByRole('button', { name: '+ Add habit' }).click()
  await page.getByPlaceholder('Name (e.g. morning stretch)').fill(name)
  if (timed) await page.getByRole('button', { name: 'Set a time' }).click()
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
  await addHabit(page, 'gym', { timed: true })
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

test('今日の画面で習慣の行をタイムラインに落とすと、予定の列はその日だけの枠、記録の列はその時間の記録になる', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T18:00:00+09:00'))
  await page.goto('/?view=habits')
  await addHabit(page, 'gym', { timed: true })
  // 続けて足すと前の習慣の時間（9:00〜10:00）を引き継ぐ
  await addHabit(page, 'read')
  await page.goto('/?view=planner')
  const column = page.locator('[data-datekey="2026-10-21"]')
  const row = (name: string) => page.locator('li[draggable="true"]', { hasText: name })
  const box = (await column.boundingBox())!
  const at = (lane: 'schedule' | 'log', hour: number) => ({
    x: box.width * (lane === 'log' ? 0.75 : 0.25),
    y: box.height * (hour / 24),
  })
  await column.scrollIntoViewIfNeeded()

  // 予定の列の 14:00 → その日だけ 14:00–15:00 の枠
  await row('read').dragTo(column, { targetPosition: at('schedule', 14) })
  await expect(page.getByText(/Set “read” to 14:00–15:00 on .* only/)).toBeVisible()

  // 記録の列の 15:00 → その時間の記録。予定の 9:00 から離れているので時間外で、まだの習慣から外れる
  await row('gym').dragTo(column, { targetPosition: at('log', 15) })
  await expect(page.getByText('Logged “gym”')).toBeVisible()
  await expect(row('gym')).toHaveCount(0)
  await page.getByRole('button', { name: /1 done/ }).click()
  await expect(page.getByText('Off time', { exact: true })).toBeVisible()
})

test('睡眠の習慣は時間帯を日をまたいで決められ、今日の画面では前の晩からの枠が 0:00 から出る', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00+09:00'))
  await page.goto('/?view=habits')
  await page.getByRole('button', { name: '+ Add habit' }).click()
  await page.getByPlaceholder('Name (e.g. morning stretch)').fill('sleep')
  await page.getByRole('button', { name: 'Set a time' }).click()
  const start = page.getByRole('combobox').nth(0)
  const end = page.getByRole('combobox').nth(1)
  await start.fill('23:00')
  await start.press('Tab')
  // 長さを保って終わりもずれる（23:59 で止めない）
  await expect(end).toHaveValue('00:00')
  await end.fill('07:00')
  await end.press('Tab')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'New habit' })).toHaveCount(0)

  // 作った日は 23:00 から日の終わりまで
  await page.goto('/?view=planner')
  const column = (key: string) => page.locator(`[data-datekey="${key}"]`)
  const firstSlot = column('2026-10-21').locator('[data-block-id^="habit-slot::"]')
  await expect(firstSlot).toHaveCount(1)
  const col = (await column('2026-10-21').boundingBox())!
  const night = (await firstSlot.boundingBox())!
  expect(Math.abs(night.y + night.height - (col.y + col.height))).toBeLessThan(2)

  // 次の日は前の晩からの枠が 0:00 から（その日の晩の枠も 23:00 から）
  await page.clock.setFixedTime(new Date('2026-10-22T12:00:00+09:00'))
  await page.reload()
  const slots = column('2026-10-22').locator('[data-block-id^="habit-slot::"]')
  await expect(slots).toHaveCount(2)
  const next = (await column('2026-10-22').boundingBox())!
  const tops = await Promise.all((await slots.all()).map(async (s) => (await s.boundingBox())!.y - next.y))
  expect(Math.min(...tops)).toBeLessThan(2)
})
