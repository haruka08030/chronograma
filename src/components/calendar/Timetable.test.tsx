import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/config'
import { useTaskStore } from '../../store/taskStore'
import { makeTask } from '../../store/taskHelpers'
import { INBOX_LIST_ID } from '../../store/storeConstants'
import { DEFAULT_TIMETABLE } from '../../lib/timetable'
import { TimetableDialog } from './TimetableDialog'
import { EventPopover } from '../timeline/EventPopover'
import { EventRepeatField } from '../detail/EventRepeatField'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

beforeEach(async () => {
  await i18n.changeLanguage('ja')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T09:00:00'))
  useTaskStore.setState({ tasks: [], recentDeletes: [], seriesEditScope: null, timetable: DEFAULT_TIMETABLE, timetableUpdatedAt: null })
})

afterEach(() => {
  vi.useRealTimers()
})

const S = () => useTaskStore.getState()
const live = () =>
  S()
    .tasks.filter((t) => t.kind === 'event' && !t.deletedAt)
    .sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!))

describe('時間割のマス（#279）', () => {
  it('マスは「月曜 1限 空き」と読むボタンで、押して授業名を入れると学期（案の後期）の毎週の予定ができる', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    render(<TimetableDialog onClose={() => {}} />)
    const cell = screen.getByRole('button', { name: '月曜 1限 空き' })
    await user.click(cell)
    const editor = screen.getByRole('dialog', { name: '月曜 1限' })
    expect(within(editor).getByText(/10月12日〜1月31日 の毎週 09:00/)).toBeTruthy()
    await user.type(within(editor).getByLabelText('授業名'), '経済学入門')
    await user.click(within(editor).getByRole('button', { name: '保存' }))

    // 10/12〜1/25 の月曜（今日より前の回は作らない）
    expect(live()).toHaveLength(16)
    expect(live()[0]).toMatchObject({ title: '経済学入門', scheduledDate: '2026-10-12', startTime: '09:00', endTime: '10:30' })
    // 案のままだった学期は、授業を入れたときに保存する
    expect(S().timetable).toMatchObject({ termStart: '2026-10-01', termEnd: '2027-01-31' })
    expect(screen.getByRole('button', { name: '月曜 1限 経済学入門' })).toBeTruthy()
  })

  it('入っているマスから名前を直す・消す（今日から後の回）', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    useTaskStore.setState({ timetable: { ...DEFAULT_TIMETABLE, termStart: '2026-10-01', termEnd: '2026-11-30' } })
    S().addTimetableClass({ weekday: 3, startTime: '10:40', endTime: '12:10', title: '英語', color: null })
    render(<TimetableDialog onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: '水曜 2限 英語' }))
    const editor = screen.getByRole('dialog', { name: '水曜 2限' })
    const name = within(editor).getByLabelText('授業名')
    await user.clear(name)
    await user.type(name, '英語 II')
    await user.click(within(editor).getByRole('button', { name: '保存' }))
    expect(live().every((t) => t.title === '英語 II')).toBe(true)

    await user.click(screen.getByRole('button', { name: '水曜 2限 英語 II' }))
    await user.click(within(screen.getByRole('dialog', { name: '水曜 2限' })).getByRole('button', { name: '削除' }))
    // 確かめのダイアログ
    await user.click(
      within(screen.getByRole('dialog', { name: /「英語 II」の今日から後の 7 回を消します/ })).getByRole('button', { name: '削除' }),
    )
    expect(live()).toHaveLength(0)
    expect(screen.getByRole('button', { name: '水曜 2限 空き' })).toBeTruthy()
  })
})

describe('毎週の予定のカード', () => {
  function openSecond() {
    useTaskStore.setState({ timetable: { ...DEFAULT_TIMETABLE, termStart: '2026-10-01', termEnd: '2026-11-30' } })
    S().addTimetableClass({ weekday: 1, startTime: '09:00', endTime: '10:30', title: '経済学入門', color: null })
    const second = live()[1]!
    render(
      <EventPopover
        taskId={second.id}
        anchor={{ top: 100, left: 100, right: 200, bottom: 140 }}
        onClose={() => {}}
        onOpenDetail={() => {}}
      />,
    )
    return second
  }

  it('繰り返しの 1 行と、変える範囲のピル（既定はこの予定のみ）を出す', async () => {
    const second = openSecond()
    expect(screen.getByText(/毎週 月 · 2026年11月30日まで/)).toBeTruthy()
    const scope = screen.getByRole('radiogroup', { name: '変える範囲' })
    expect(within(scope).getByRole('radio', { name: 'この予定のみ' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(scope).getByRole('radio', { name: 'これ以降すべて' }))
    expect(S().seriesEditScope).toEqual({ taskId: second.id, scope: 'following' })
  })

  it('削除は範囲を聞いてから。「これ以降すべて」でその回から後をゴミ箱へ', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    openSecond()
    const before = live().length
    await user.click(screen.getByRole('button', { name: '削除' }))
    const ask = screen.getByRole('dialog', { name: '繰り返しの予定を削除' })
    await user.click(within(ask).getByRole('radio', { name: 'これ以降すべて' }))
    await user.click(within(ask).getByRole('button', { name: '削除' }))
    expect(live()).toHaveLength(1)
    expect(before).toBeGreaterThan(2)
  })

  it('範囲を聞くダイアログで取消すと何も消さない', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    openSecond()
    const before = live().length
    await user.click(screen.getByRole('button', { name: '削除' }))
    await user.click(within(screen.getByRole('dialog', { name: '繰り返しの予定を削除' })).getByRole('button', { name: 'キャンセル' }))
    expect(live()).toHaveLength(before)
  })
})

describe('予定の繰り返しの欄', () => {
  it('毎週を選ぶと終わりの日（学期の終わり）までの回ができ、曜日を足すと増える', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    useTaskStore.setState({
      timetable: { ...DEFAULT_TIMETABLE, termStart: '2026-10-01', termEnd: '2026-10-31' },
      tasks: [
        {
          ...makeTask(
            { title: 'ゼミ', listId: INBOX_LIST_ID, scheduledDate: '2026-10-13', startTime: '16:20', endTime: '17:50', kind: 'event' },
            0,
          ),
          id: 'seminar',
        },
      ],
    })
    const view = render(<EventRepeatField task={S().tasks[0]!} date="2026-10-13" />)
    await user.selectOptions(screen.getByLabelText('繰り返し'), 'weekly')
    expect(live().map((t) => t.scheduledDate)).toEqual(['2026-10-13', '2026-10-20', '2026-10-27'])
    view.rerender(<EventRepeatField task={S().tasks.find((t) => t.id === 'seminar')!} date="2026-10-13" />)
    await user.click(within(screen.getByRole('group', { name: '繰り返す曜日' })).getByRole('button', { name: '木' }))
    expect(live().map((t) => t.scheduledDate)).toEqual(['2026-10-13', '2026-10-15', '2026-10-20', '2026-10-22', '2026-10-27', '2026-10-29'])
  })
})
