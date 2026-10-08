import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/config'
import { useTaskStore } from '../../store/taskStore'
import type { EventTemplate } from '../../lib/eventTemplates'
import { CalendarHubView } from '../CalendarHubView'

const late: EventTemplate = { id: 'late', title: 'バイト 遅番', startTime: '17:00', endTime: '22:00', color: '#039BE5' }

const originalMatchMedia = window.matchMedia

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(async () => {
  await i18n.changeLanguage('ja')
  // PC 幅（マウス）
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width') || query.includes('hover: hover') || query.includes('pointer: fine'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as unknown as typeof window.matchMedia
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-01T09:00:00'))
  useTaskStore.setState({ calendarMode: 'month', selectedCalendarDateKey: '2026-10-01' })
})

afterEach(() => {
  vi.useRealTimers()
  window.matchMedia = originalMatchMedia
})

afterAll(() => i18n.changeLanguage('en'))

const events = () => useTaskStore.getState().tasks.filter((t) => t.kind === 'event' && !t.deletedAt)
const dayCell = (day: number, on = false) =>
  screen.getByRole('button', { name: new RegExp(`^10月${day}日.*${on ? '入っています' : '押すと'}`) })

describe('月表示で「よく入れる予定」を入れる（#311）', () => {
  it('1 つ選んで日を 5 つ押すと、その 5 日に同じ時刻・ラベルの予定が入る。もう一度押すと外れ、完了で抜ける', async () => {
    useTaskStore.setState({ eventTemplates: [late] })
    const user = userEvent.setup()
    render(<CalendarHubView />)

    await user.click(screen.getByRole('button', { name: /よく入れる予定/ }))
    await user.click(screen.getByRole('menuitem', { name: /バイト 遅番/ }))
    const bar = screen.getByRole('status')
    expect(within(bar).getByText('バイト 遅番')).toBeInTheDocument()

    for (const d of [5, 7, 12, 15, 21]) await user.click(dayCell(d))
    expect(
      events()
        .map((t) => t.scheduledDate)
        .sort(),
    ).toEqual(['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-15', '2026-10-21'])
    expect(events().every((t) => t.startTime === '17:00' && t.endTime === '22:00' && t.color === '#039BE5')).toBe(true)
    expect(dayCell(5, true)).toHaveAttribute('aria-pressed', 'true')
    // トーストには入れた日の数（そこからまとめて取り消せる）
    expect(useTaskStore.getState().undoBanner?.text).toEqual({
      key: 'eventTemplates.addedToast',
      params: { title: 'バイト 遅番', count: 5 },
    })

    // 押し間違い: もう一度押すと外れる（ゴミ箱にも残らない）
    await user.click(dayCell(21, true))
    expect(events()).toHaveLength(4)
    expect(useTaskStore.getState().tasks).toHaveLength(4)

    // マスの中の予定を押しても開かずに外れる
    await user.click(within(dayCell(15, true)).getByText('バイト 遅番'))
    expect(events()).toHaveLength(3)

    await user.click(within(bar).getByRole('button', { name: '完了' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^10月5日/ })).not.toBeInTheDocument()

    // 続けて押した分は 1 回の取り消しで戻る
    expect(useTaskStore.getState().undoLastOperation()).toBe(true)
    expect(events()).toHaveLength(0)
  })

  it('まだ 1 つも無いときは登録の画面が開き、保存したらそのまま日を押して入れられる', async () => {
    const user = userEvent.setup()
    render(<CalendarHubView />)
    await user.click(screen.getByRole('button', { name: /よく入れる予定/ }))
    const dialog = screen.getByRole('dialog', { name: 'よく入れる予定' })
    await user.type(within(dialog).getByRole('textbox', { name: '名前' }), 'バイト 早番')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(useTaskStore.getState().eventTemplates).toMatchObject([{ title: 'バイト 早番', startTime: '09:00', endTime: '17:00' }])
    expect(within(screen.getByRole('status')).getByText('バイト 早番')).toBeInTheDocument()
    await user.click(dayCell(8))
    expect(events().map((t) => t.scheduledDate)).toEqual(['2026-10-08'])
  })

  it('登録の画面: 終わりが始まりより前だと保存できず、理由を出す。削除して保存すると消える', async () => {
    useTaskStore.setState({ eventTemplates: [late] })
    const user = userEvent.setup()
    render(<CalendarHubView />)
    await user.click(screen.getByRole('button', { name: /よく入れる予定/ }))
    await user.click(screen.getByRole('menuitem', { name: '登録・編集' }))
    const dialog = screen.getByRole('dialog', { name: 'よく入れる予定' })
    const end = within(dialog).getByRole('combobox', { name: '終わり' })
    await user.clear(end)
    await user.type(end, '16:00{Enter}')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('終わりは始まりより後にしてください')
    expect(within(dialog).getByRole('button', { name: '保存' })).toBeDisabled()

    await user.click(within(dialog).getByRole('button', { name: '削除' }))
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(useTaskStore.getState().eventTemplates).toEqual([])
  })
})
