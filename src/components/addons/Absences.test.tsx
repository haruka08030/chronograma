import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n/config'
import { useTaskStore } from '../../store/taskStore'
import { DEFAULT_ADDONS } from '../../lib/addons'
import { emptyTerm } from '../../lib/schoolTerms'
import { DEFAULT_TIMETABLE, suggestTerm } from '../../lib/timetable'
import { appTodayKey } from '../../lib/timeZone'
import { TASK_DEFAULTS } from '../../lib/taskDefaults'
import type { Task } from '../../types/task'
import { AddonsView } from './AddonsView'
import { GoogleEventPopover } from '../timeline/GoogleEventPopover'

const S = () => useTaskStore.getState()
const term0 = () => S().addons.school!.terms[0]!

beforeEach(async () => {
  await i18n.changeLanguage('ja')
  useTaskStore.setState({
    tasks: [],
    addons: DEFAULT_ADDONS,
    addonsUpdatedAt: null,
    timetable: DEFAULT_TIMETABLE,
    calendarEvents: [],
    courseLinks: [],
  })
})

describe('追加機能「学校」の学期と授業（#503・#622）', () => {
  it('学期を足し、授業を足して今日欠席を付けると数が出る。授業のページで休める回数・名前を直し、外すと消える', async () => {
    const user = userEvent.setup()
    const today = appTodayKey()
    render(<AddonsView />)
    await user.click(screen.getByRole('switch', { name: '学校を使う' }))
    await user.click(screen.getByRole('button', { name: '学校' }))
    await user.click(screen.getByRole('button', { name: '学期を追加' }))
    await user.click(within(screen.getByRole('dialog', { name: '学期を追加' })).getByRole('button', { name: '保存' }))
    expect(S().addons.school?.terms).toMatchObject([suggestTerm(today)])

    await user.click(screen.getByRole('button', { name: '授業を追加' }))
    await user.type(screen.getByLabelText('授業の名前'), '統計学')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(term0().courses).toEqual(['統計学'])

    const list = screen.getByRole('list', { name: '授業' })
    expect(list.textContent).toContain('欠席 0 回')
    await user.click(within(list).getByRole('button', { name: '統計学を今日欠席にする' }))
    expect(term0().absences).toEqual({ 統計学: [today] })

    // 授業のページ
    await user.click(within(list).getByRole('button', { name: /^統計学欠席 1 回/ }))
    expect(screen.getByRole('heading', { level: 1, name: '統計学' })).toBeTruthy()
    await user.type(screen.getByLabelText('休める回数（空なら決めない）'), '2')
    await user.tab()
    expect(term0().absenceLimits).toEqual({ 統計学: 2 })
    expect(screen.getByText('欠席 1 / 2 回 · あと 1 回')).toBeTruthy()

    const name = screen.getByLabelText('授業の名前')
    await user.clear(name)
    await user.type(name, '統計学 I')
    await user.tab()
    expect(term0().courses).toEqual(['統計学 I'])
    expect(term0().absences).toEqual({ '統計学 i': [today] })
    expect(screen.getByRole('heading', { level: 1, name: '統計学 I' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '一覧から外す' }))
    expect(term0().courses).toEqual([])
    expect(term0().absences).toEqual({})
    // 一覧へ戻る
    expect(screen.getByRole('heading', { level: 1, name: '学校' })).toBeTruthy()
  })

  it('学期の編集は閉じても書きかけが残り、削除は確認なしで「元に戻す」で戻る', async () => {
    const user = userEvent.setup()
    render(<AddonsView />)
    await user.click(screen.getByRole('switch', { name: '学校を使う' }))
    await user.click(screen.getByRole('button', { name: '学校' }))
    await user.click(screen.getByRole('button', { name: '学期を追加' }))
    await user.click(within(screen.getByRole('dialog', { name: '学期を追加' })).getByRole('button', { name: '保存' }))
    expect(S().addons.school?.terms).toHaveLength(1)

    // 書きかけのまま Esc で閉じ、開き直すと続きから
    await user.click(screen.getByRole('button', { name: '学期を編集' }))
    await user.type(within(screen.getByRole('dialog', { name: '学期を編集' })).getByLabelText('名前'), '2026 後期')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '学期を編集' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '学期を編集' }))
    const editor = screen.getByRole('dialog', { name: '学期を編集' })
    expect(within(editor).getByLabelText('名前')).toHaveValue('2026 後期')

    await user.click(within(editor).getByRole('button', { name: '学期を消す' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(S().addons.school?.terms).toHaveLength(0)
    expect(S().undoBanner?.text).toMatchObject({ key: 'undo.termDeleted' })
    S().undoOperation(S().undoBanner!.undoId!)
    expect(S().addons.school?.terms).toHaveLength(1)
  })

  it('学期の間に課題のある Canvas・Moodle の科目は授業として並び、授業のページに未完了の課題が出る', async () => {
    const user = userEvent.setup()
    const today = appTodayKey()
    const term = emptyTerm('t1', suggestTerm(today), '後期')
    const lms = (id: string, title: string, extra: Partial<Task> = {}) =>
      ({
        ...TASK_DEFAULTS,
        id: `canvas-s1-assignment-${id}`,
        title,
        tags: ['econ'],
        dueDate: today,
        parentId: null,
        completed: false,
        createdAt: today,
        updatedAt: today,
        ...extra,
      }) as Task
    useTaskStore.setState({
      tasks: [lms('1', 'レポート 1'), lms('2', 'レポート 0', { completed: true })],
      addons: { ...DEFAULT_ADDONS, enabled: { school: true }, school: { terms: [term] } },
    })
    render(<AddonsView />)
    await user.click(screen.getByRole('button', { name: '学校' }))
    const list = screen.getByRole('list', { name: '授業' })
    expect(list.textContent).toContain('econ')
    expect(list.textContent).toContain('課題 1')
    await user.click(within(list).getByRole('button', { name: /^econ欠席/ }))
    const section = screen.getByRole('region', { name: '課題' })
    expect(section.textContent).toContain('レポート 1')
    expect(section.textContent).not.toContain('レポート 0')
    // 要らない科目は外せる（外した印が残り、並ばない）
    await user.click(screen.getByRole('button', { name: '一覧から外す' }))
    expect(term0().hidden).toEqual(['econ'])
    expect(screen.getByRole('list', { name: '授業' }).textContent).not.toContain('econ')
  })

  it('学期の授業と同じ名前の Google カレンダーの予定のカードに数と「欠席にする」が出る。授業でない予定・オフなら出ない', async () => {
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
    const term = {
      ...emptyTerm('t1', { termStart: '2026-10-01', termEnd: '2027-01-31' }),
      courses: ['統計学'],
      absenceLimits: { 統計学: 4 },
    }
    useTaskStore.setState({ addons: { ...DEFAULT_ADDONS, enabled: { school: true }, school: { terms: [term] } } })

    const anchor = { top: 100, left: 100, right: 200, bottom: 140 }
    const view = render(<GoogleEventPopover eventId="g1" anchor={anchor} onClose={() => {}} />)
    expect(screen.getByText('欠席 0 / 4 回')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '欠席にする' }))
    expect(term0().absences).toEqual({ 統計学: ['2026-10-05'] })
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
