import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n/config'
import { useTaskStore } from '../../store/taskStore'
import { DEFAULT_ADDONS } from '../../lib/addons'
import { DEFAULT_TIMETABLE } from '../../lib/timetable'
import { appTodayKey } from '../../lib/timeZone'
import { AddonsView } from './AddonsView'
import { GoogleEventPopover } from '../timeline/GoogleEventPopover'

const S = () => useTaskStore.getState()

beforeEach(async () => {
  await i18n.changeLanguage('ja')
  useTaskStore.setState({ tasks: [], addons: DEFAULT_ADDONS, addonsUpdatedAt: null, timetable: DEFAULT_TIMETABLE, calendarEvents: [] })
})

describe('追加機能「学校」の授業の欠席（#503）', () => {
  it('オンにして授業を足し、今日欠席を付けると数と残りが出る。直すと休める回数が変わり、外すと消える', async () => {
    const user = userEvent.setup()
    const today = appTodayKey()
    render(<AddonsView />)
    await user.click(screen.getByRole('switch', { name: '学校を使う' }))
    expect(S().addons.enabled).toEqual({ school: true })
    await user.click(screen.getByRole('button', { name: '学校' }))
    const dialog = screen.getByRole('region', { name: '授業の欠席' })
    await user.click(within(dialog).getByRole('button', { name: '授業を追加' }))
    await user.type(screen.getByLabelText('授業の名前'), '統計学')
    await user.type(screen.getByLabelText('休める回数（空なら決めない）'), '2')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(S().addons.absenceCourses).toEqual(['統計学'])
    expect(S().timetable.absenceLimits).toEqual({ 統計学: 2 })

    const list = within(dialog).getByRole('list', { name: '授業の欠席' })
    expect(list.textContent).toContain('欠席 0 / 2 回')
    await user.click(within(list).getByRole('button', { name: '統計学を今日欠席にする' }))
    expect(S().timetable.absences).toEqual({ 統計学: [today] })
    expect(list.textContent).toContain('欠席 1 / 2 回 · あと 1 回')

    // 名前を直すと休んだ日も移る
    await user.click(within(list).getByRole('button', { name: /^統計学欠席/ }))
    const name = screen.getByLabelText('授業の名前')
    await user.clear(name)
    await user.type(name, '統計学 I')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(S().addons.absenceCourses).toEqual(['統計学 I'])
    expect(S().timetable.absences).toEqual({ '統計学 i': [today] })
    expect(S().timetable.absenceLimits).toEqual({ '統計学 i': 2 })

    await user.click(within(list).getByRole('button', { name: /^統計学 I欠席/ }))
    await user.click(screen.getByRole('button', { name: '一覧から外す' }))
    expect(S().addons.absenceCourses).toEqual([])
    expect(S().timetable.absences).toEqual({})
    expect(S().timetable.absenceLimits).toEqual({})
  })

  it('一覧の授業と同じ名前の Google カレンダーの予定のカードに数と「欠席にする」が出る。一覧に無い予定・オフなら出ない', async () => {
    const user = userEvent.setup()
    const ev = (id: string, summary: string) => ({
      id,
      summary,
      recurringEventId: 'r1',
      start: '2026-10-05T09:00:00+09:00',
      end: '2026-10-05T09:35:00+09:00',
      startTime: '09:00',
      endTime: '09:35',
      date: '2026-10-05',
      isAllDay: false,
    })
    S().setCalendarEvents([ev('g1', '統計学'), ev('g2', 'ゼミの打ち合わせ')])
    useTaskStore.setState({ addons: { ...DEFAULT_ADDONS, enabled: { school: true }, absenceCourses: ['統計学'] } })
    S().saveTimetable({ ...S().timetable, absenceLimits: { 統計学: 4 } })

    const anchor = { top: 100, left: 100, right: 200, bottom: 140 }
    const view = render(<GoogleEventPopover eventId="g1" anchor={anchor} onClose={() => {}} />)
    expect(screen.getByText('欠席 0 / 4 回')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '欠席にする' }))
    expect(S().timetable.absences).toEqual({ 統計学: ['2026-10-05'] })
    expect(screen.getByText('欠席 1 / 4 回')).toBeTruthy()
    view.unmount()

    const other = render(<GoogleEventPopover eventId="g2" anchor={anchor} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: '欠席にする' })).toBeNull()
    other.unmount()

    useTaskStore.setState({ addons: { ...S().addons, enabled: { school: false } } })
    render(<GoogleEventPopover eventId="g1" anchor={anchor} onClose={() => {}} />)
    expect(screen.queryByText(/^欠席 \d/)).toBeNull()
  })
})
