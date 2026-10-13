import { act, fireEvent, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fromDateKey } from '../lib/dateKey'
import { HOUR_HEIGHT } from '../lib/timeGrid'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import { WeekCalendarView } from './WeekCalendarView'

// 日の列は 1 回描くごとに重なりの配置（layoutPlanAndLog）を 1 回呼ぶ。その回数で列の描き直しを数える
const layoutCalls = vi.hoisted(() => ({ byDay: new Map<string, number>() }))
vi.mock('../lib/overlapLayout', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/overlapLayout')>()
  return {
    ...mod,
    layoutPlanAndLog: (...args: Parameters<typeof mod.layoutPlanAndLog>) => {
      // 列ごとに予定を 1 つずつ置いてあるので、予定の id で列を見分ける
      const key = args[0][0]?.id ?? '?'
      layoutCalls.byDay.set(key, (layoutCalls.byDay.get(key) ?? 0) + 1)
      return mod.layoutPlanAndLog(...args)
    },
  }
})

const COL_W = 100
const WEEK = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']
const originalMatchMedia = window.matchMedia
const originalRect = Element.prototype.getBoundingClientRect

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.setPointerCapture ??= () => {}
  document.elementFromPoint ??= () => null
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  // jsdom には配置が無い。日の列は横に 100px ずつ、高さは 24 時間。ブロックは style の top / height
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const el = this as HTMLElement
    const col = el.closest<HTMLElement>('[data-datekey]')
    const i = col ? WEEK.indexOf(col.dataset.datekey!) : -1
    const left = i * COL_W
    const box = (top: number, height: number) =>
      ({ top, left, right: left + COL_W, bottom: top + height, width: COL_W, height, x: left, y: top, toJSON() {} }) as DOMRect
    if (el.dataset.datekey) return box(0, 24 * HOUR_HEIGHT)
    if (el.dataset.blockId) return box(parseFloat(el.style.top), parseFloat(el.style.height))
    return originalRect.call(this)
  }
})
afterAll(() => {
  Element.prototype.getBoundingClientRect = originalRect
})
beforeEach(() => {
  // PC 幅（7 日の列を並べる）。マウス
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width: 768px'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  layoutCalls.byDay.clear()
})
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

/** 10/7 の 10:00–11:00 に「読書」、ほかの日にも 1 つずつ予定 */
function seed() {
  const at = (id: string, date: string, startTime: string, endTime: string, order: number) => ({
    ...makeTask({ title: id, listId: INBOX_LIST_ID, scheduledDate: date, startTime, endTime }, order),
    id,
  })
  useTaskStore.setState({
    tasks: [
      at('p', '2026-10-07', '10:00', '11:00', 0),
      ...WEEK.filter((d) => d !== '2026-10-07').map((d, i) => at(`o${i}`, d, '14:00', '15:00', i + 1)),
    ],
  })
}

function renderWeek() {
  seed()
  const view = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" />)
  const grid = view.container.querySelector<HTMLElement>('[data-datekey]')!.parentElement!
  const block = view.container.querySelector<HTMLElement>('[data-block-id="p"]')!
  return { ...view, grid, block }
}

/** 日の列ごとの描き直しの回数（列の予定の id → 回数） */
const rendersByColumn = () => Object.fromEntries(layoutCalls.byDay)

describe('WeekCalendarView: ドラッグ中の描き直し（#265）', () => {
  const x = 2 * COL_W + 20
  const y0 = 10.5 * HOUR_HEIGHT

  it('1 px ずつ 1 時間ぶん動かしても、描き直すのは 15 分の位置が変わったとき（と動かし始め）の、置く日の列だけ', () => {
    const { grid, block } = renderWeek()
    let commits = 0
    fireEvent.pointerDown(block, { clientX: x, clientY: y0, button: 0, pointerId: 1 })
    layoutCalls.byDay.clear()
    const unsub = useTaskStore.subscribe(() => commits++)
    for (let dy = 1; dy <= HOUR_HEIGHT; dy++) fireEvent.pointerMove(grid, { clientX: x, clientY: y0 + dy, pointerId: 1 })
    unsub()
    // 前は 60 回 × 7 列 = 420 回描き直していた。今は 10/7 の列だけ、動かし始め＋15 分ごと（10:15・10:30・10:45・11:00）の 5 回
    expect(rendersByColumn()).toEqual({ p: 5 })
    // ドラッグ中はストアを変えない
    expect(commits).toBe(0)
    act(() => void fireEvent.pointerUp(grid, { clientX: x, clientY: y0 + HOUR_HEIGHT, pointerId: 1 }))
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'p')).toMatchObject({ startTime: '11:00', endTime: '12:00' })
  })

  it('隣の日へ動かすと、描き直すのは元の日と置く日の列だけ。落とすと動いた予定の列だけ描き直す', () => {
    const { grid, block } = renderWeek()
    fireEvent.pointerDown(block, { clientX: x, clientY: y0, button: 0, pointerId: 1 })
    layoutCalls.byDay.clear()
    for (let dx = 1; dx <= COL_W; dx++) fireEvent.pointerMove(grid, { clientX: x + dx, clientY: y0, pointerId: 1 })
    // 10/7（p）と 10/8（o2）だけ
    expect(Object.keys(rendersByColumn()).sort()).toEqual(['o2', 'p'])
    layoutCalls.byDay.clear()
    act(() => void fireEvent.pointerUp(grid, { clientX: x + COL_W, clientY: y0, pointerId: 1 }))
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'p')).toMatchObject({ scheduledDate: '2026-10-08', startTime: '10:00' })
    // 描き直すのは空になった 10/7（予定が無いので '?'）と、p が先頭に入った 10/8 だけ。
    // 予定の変わらない日（10/5・10/6・10/9…）の列は描き直さない（変わっていない日の配列・習慣の索引を使い回す）
    expect(rendersByColumn()).toEqual({ '?': 1, p: 1 })
  })

  it('長さを変えるドラッグも、15 分の位置が同じ間は描き直さない', () => {
    const { grid, block } = renderWeek()
    // 下の端（ブロックの下 4px）をつかむ
    const yBottom = 11 * HOUR_HEIGHT - 2
    fireEvent.pointerDown(block, { clientX: x, clientY: yBottom, button: 0, pointerId: 1 })
    layoutCalls.byDay.clear()
    for (let dy = 1; dy <= HOUR_HEIGHT / 2; dy++) fireEvent.pointerMove(grid, { clientX: x, clientY: yBottom + dy, pointerId: 1 })
    expect(Object.keys(rendersByColumn())).toEqual(['p'])
    expect(rendersByColumn().p).toBeLessThanOrEqual(3)
    act(() => void fireEvent.pointerUp(grid, { clientX: x, clientY: yBottom + HOUR_HEIGHT / 2, pointerId: 1 }))
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'p')).toMatchObject({ startTime: '10:00', endTime: '11:30' })
  })
})
