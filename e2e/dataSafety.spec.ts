import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

/** 端末に保存したタスクの題名（zustand の persist の保存内容） */
async function savedTitles(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('chronograma-storage')
    const tasks = raw ? (JSON.parse(raw).state.tasks as { title: string }[]) : []
    return tasks.map((t) => t.title).sort()
  })
}

async function openTodo(page: Page) {
  await page.goto('/')
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^To.Do$/ })
    .click()
}

async function addTodo(page: Page, title: string) {
  const input = page.getByPlaceholder('Add a to-do')
  await input.fill(title)
  await input.press('Enter')
  await expect(page.getByRole('listbox').getByRole('option', { name: title })).toBeVisible()
}

test('2 つのタブで別々に足したタスクが、どちらのタブでも両方残る', async ({ context }) => {
  const a = await context.newPage()
  const b = await context.newPage()
  await openTodo(a)
  await openTodo(b)

  await addTodo(a, 'From tab A')
  await addTodo(b, 'From tab B')
  // もう一方のタブにも出る（storage イベントで取り込む）
  await expect(a.getByRole('listbox').getByRole('option', { name: 'From tab B' })).toBeVisible()

  // 古いままのタブがもう一方の分を上書きしない
  await addTodo(a, 'From tab A again')
  await expect.poll(() => savedTitles(b)).toEqual(['From tab A', 'From tab A again', 'From tab B'])
  await expect(b.getByRole('listbox').getByRole('option', { name: 'From tab A again' })).toBeVisible()

  await a.reload()
  await expect.poll(() => savedTitles(a)).toEqual(['From tab A', 'From tab A again', 'From tab B'])
})

test('バックアップを取り込み、読み込み直したあとでも「取り込みの前に戻す」で元に戻る', async ({ browser, page }, testInfo) => {
  // 別の端末で書き出したバックアップ
  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await openTodo(otherPage)
  await addTodo(otherPage, 'Backup task')
  await otherPage.goto('/?view=settings')
  const download = otherPage.waitForEvent('download')
  await otherPage.getByRole('button', { name: 'Export', exact: true }).click()
  const file = testInfo.outputPath('backup.json')
  await (await download).saveAs(file)
  expect(JSON.parse(await readFile(file, 'utf8')).tasks.map((t: { title: string }) => t.title)).toEqual(['Backup task'])
  await other.close()

  await openTodo(page)
  await addTodo(page, 'Current task')
  await page.goto('/?view=settings')
  const chooser = page.waitForEvent('filechooser')
  // CSV の行にも「Import」があるので、バックアップの行（「Export」の隣）を押す
  await page.getByRole('button', { name: 'Export', exact: true }).locator('..').getByRole('button', { name: 'Import', exact: true }).click()
  await (await chooser).setFiles(file)
  await page.getByRole('dialog').getByRole('button', { name: 'Import', exact: true }).click()
  await expect.poll(() => savedTitles(page)).toEqual(['Backup task'])

  await page.reload()
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Restore', exact: true }).click()
  await expect.poll(() => savedTitles(page)).toEqual(['Current task'])
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(0)

  await openTodo(page)
  await expect(page.getByRole('listbox').getByRole('option', { name: 'Current task' })).toBeVisible()
  await expect(page.getByRole('listbox').getByRole('option', { name: 'Backup task' })).toHaveCount(0)
})

test('週の表示で予定をドラッグすると 15 分単位で動き、長さは変わらず、読み込み直しても残る', async ({ page }) => {
  // 「3pm」が今日の週に入るよう、水曜の朝に決める（夜や週末に走らせても同じ）
  await page.clock.setFixedTime(new Date('2026-10-07T10:00:00+09:00'))
  await openTodo(page)
  const input = page.getByPlaceholder('Add a to-do')
  await input.fill('3pm essay 1h')
  await input.press('Enter')
  const saved = () =>
    page.evaluate(() => {
      const tasks = JSON.parse(localStorage.getItem('chronograma-storage')!).state.tasks as Record<string, unknown>[]
      const t = tasks.find((x) => x.title === 'essay')!
      return { id: t.id as string, startTime: t.startTime, endTime: t.endTime, scheduledDate: t.scheduledDate }
    })
  await expect.poll(async () => (await saved()).startTime).toBe('15:00')
  const before = await saved()

  await page.goto('/?view=calendar')
  const block = page.locator(`[data-block-id="${before.id}"]`)
  await block.scrollIntoViewIfNeeded()
  const box = (await block.boundingBox())!
  const hourPx = box.height // 1 時間の予定
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  // 37 分ぶん下へ（15 分に丸めて 30 分後ろへ）
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + hourPx * 0.3, { steps: 5 })
  await page.mouse.move(x, y + (hourPx * 37) / 60, { steps: 5 })
  await page.mouse.up()

  await expect.poll(async () => (await saved()).startTime).toBe('15:30')
  expect(await saved()).toEqual({ ...before, startTime: '15:30', endTime: '16:30' })
  await page.reload()
  expect(await saved()).toEqual({ ...before, startTime: '15:30', endTime: '16:30' })
})
