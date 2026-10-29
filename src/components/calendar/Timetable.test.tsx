import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/config'
import { useTaskStore } from '../../store/taskStore'
import { makeTask } from '../../store/taskHelpers'
import { INBOX_LIST_ID } from '../../store/storeConstants'
import { DEFAULT_TIMETABLE } from '../../lib/timetable'
import { DEFAULT_ADDONS } from '../../lib/addons'
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
  useTaskStore.setState({
    tasks: [],
    recentDeletes: [],
    seriesEditScope: null,
    timetable: DEFAULT_TIMETABLE,
    timetableUpdatedAt: null,
    addons: DEFAULT_ADDONS,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

const S = () => useTaskStore.getState()
/** 今の時間割の学期（前の版の学期から作る学校の学期と同じ） */
/** 学校の 1 つめの学期 */
const term0 = () => S().addons.school!.terms[0]!
const termOf = () => ({ termStart: S().timetable.termStart!, termEnd: S().timetable.termEnd! })
const live = () =>
  S()
    .tasks.filter((t) => t.kind === 'event' && !t.deletedAt)
    .sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!))

describe('時間割のマス（#279）', () => {
  it('学期が無ければ学期を足してから。マスは「月曜 1限 空き」と読むボタンで、押して授業名を入れると学期の毎週の予定ができる', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    render(<TimetableDialog onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: '月曜 1限 空き' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '学期を追加' }))
    // 案は今日の学期（後期 10/1〜1/31）
    await user.click(within(screen.getByRole('dialog', { name: '学期を追加' })).getByRole('button', { name: '保存' }))
    expect(S().addons.school?.terms).toMatchObject([{ termStart: '2026-10-01', termEnd: '2027-01-31' }])

    const cell = screen.getByRole('button', { name: '月曜 1限 空き' })
    await user.click(cell)
    const editor = screen.getByRole('dialog', { name: '月曜 1限' })
    expect(within(editor).getByText(/10月12日〜1月31日 の毎週 09:00/)).toBeTruthy()
    await user.type(within(editor).getByLabelText('授業名'), '経済学入門')
    await user.click(within(editor).getByRole('button', { name: '保存' }))

    // 10/12〜1/25 の月曜（今日より前の回は作らない）
    expect(live()).toHaveLength(16)
    expect(live()[0]).toMatchObject({ title: '経済学入門', scheduledDate: '2026-10-12', startTime: '09:00', endTime: '10:30' })
    expect(screen.getByRole('button', { name: '月曜 1限 経済学入門' })).toBeTruthy()
  })

  it('入っているマスから名前を直す・消す（今日から後の回）', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    useTaskStore.setState({ timetable: { ...DEFAULT_TIMETABLE, termStart: '2026-10-01', termEnd: '2026-11-30' } })
    S().addTimetableClass({ weekday: 3, startTime: '10:40', endTime: '12:10', title: '英語', color: null }, termOf())
    render(<TimetableDialog onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: '水曜 2限 英語' }))
    const editor = screen.getByRole('dialog', { name: '水曜 2限' })
    const name = within(editor).getByLabelText('授業名')
    await user.clear(name)
    await user.type(name, '英語 II')
    await user.click(within(editor).getByRole('button', { name: '保存' }))
    expect(live().every((t) => t.title === '英語 II')).toBe(true)

    await user.click(screen.getByRole('button', { name: '水曜 2限 英語 II' }))
    // 確認なしで消し、「元に戻す」で戻せる（ほかの削除と同じ）
    await user.click(within(screen.getByRole('dialog', { name: '水曜 2限' })).getByRole('button', { name: '削除' }))
    expect(live()).toHaveLength(0)
    expect(screen.getByRole('button', { name: '水曜 2限 空き' })).toBeTruthy()
    expect(S().recentDeletes.at(-1)?.label).toEqual({ key: 'undo.eventsDeleted', params: { title: '英語 II', count: 7 } })
    S().undoOperation(S().recentDeletes.at(-1)!.undoId!)
    expect(live()).toHaveLength(7)
  })
})

describe('毎週の予定のカード', () => {
  function openSecond() {
    useTaskStore.setState({ timetable: { ...DEFAULT_TIMETABLE, termStart: '2026-10-01', termEnd: '2026-11-30' } })
    S().addTimetableClass({ weekday: 1, startTime: '09:00', endTime: '10:30', title: '経済学入門', color: null }, termOf())
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

describe('授業の欠席（#452）', () => {
  const popover = (taskId: string) => (
    <EventPopover taskId={taskId} anchor={{ top: 100, left: 100, right: 200, bottom: 140 }} onClose={() => {}} onOpenDetail={() => {}} />
  )

  it('今日の回のカードで欠席にでき、数と残りが出る。これからの回は数だけ', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    // 10/8（木）から 1/28 までの木曜 → 休めるのは 1/3 の 5 回
    S().saveTimetable({ ...S().timetable, termStart: '2026-10-01', termEnd: '2027-01-31' })
    S().addTimetableClass({ weekday: 4, startTime: '09:00', endTime: '10:30', title: '経済学入門', color: null }, termOf())
    const [today, next] = live()
    const view = render(popover(today!.id))
    expect(screen.getByText('欠席 0 / 5 回')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '欠席にする' }))
    expect(term0().absences).toEqual({ 経済学入門: ['2026-10-08'] })
    expect(screen.getByText('欠席 1 / 5 回')).toBeTruthy()
    expect(screen.getByRole('button', { name: '欠席を取り消す' }).getAttribute('aria-pressed')).toBe('true')
    view.unmount()

    render(popover(next!.id))
    expect(screen.getByText('欠席 1 / 5 回')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '欠席にする' })).toBeNull()
  })

  it('マスに欠席の数が出て、授業の編集で休める回数を決められる。授業名を直すと欠席も移る', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    S().saveTimetable({ ...S().timetable, termStart: '2026-10-01', termEnd: '2027-01-31' })
    S().addTimetableClass({ weekday: 4, startTime: '09:00', endTime: '10:30', title: '経済学入門', color: null }, termOf())
    S().setClassAbsent(live()[0]!.id, true)
    render(<TimetableDialog onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: '木曜 1限 経済学入門 欠席 1 / 5 回' }))
    const editor = screen.getByRole('dialog', { name: '木曜 1限' })
    await user.type(within(editor).getByLabelText(/^休める回数（学期 \d+ 回）$/), '2')
    expect(within(editor).getByText('欠席 1 / 2 回 · あと 1 回')).toBeTruthy()
    const name = within(editor).getByLabelText('授業名')
    await user.clear(name)
    await user.type(name, 'ミクロ経済学')
    await user.click(within(editor).getByRole('button', { name: '保存' }))
    expect(term0().absences).toEqual({ ミクロ経済学: ['2026-10-08'] })
    expect(term0().absenceLimits).toEqual({ ミクロ経済学: 2 })
    expect(screen.getByRole('button', { name: '木曜 1限 ミクロ経済学 欠席 1 / 2 回 · あと 1 回' })).toBeTruthy()
  })
})
