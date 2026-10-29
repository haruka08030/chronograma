import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { makeTask } from '../../store/taskHelpers'
import { INBOX_LIST_ID } from '../../store/storeConstants'
import { appTodayKey } from '../../lib/timeZone'
import { toDateKey, fromDateKey } from '../../lib/dateKey'
import { addDays } from 'date-fns'
import i18n from '../../i18n/config'
import { QuickCreatePopover } from './QuickCreatePopover'

const anchor = { top: 100, left: 100, right: 200, bottom: 140 }
// 今日は各テストの中で読む（ファイルを読んだときに決めると、0 時をまたいで走ったときに明日がずれる）
const today = () => appTodayKey()
const tomorrow = () => toDateKey(addDays(fromDateKey(today()), 1))

function open(estimateMinutes: number) {
  useTaskStore.setState({
    tasks: [{ ...makeTask({ title: 'レポート', listId: INBOX_LIST_ID, dueDate: tomorrow(), estimateMinutes }, 0), id: 'r' }],
  })
  const onClose = vi.fn()
  const view = render(
    <QuickCreatePopover
      anchor={anchor}
      dateKey={today()}
      startTime="10:40"
      endTime="11:40"
      onTimesChange={() => {}}
      onClose={onClose}
      onCreated={() => {}}
    />,
  )
  return { view, onClose }
}

describe('QuickCreatePopover: 枠に入る To-Do を置く', () => {
  beforeEach(() => localStorage.clear())

  it('60 分の枠に、見積もり 45 分・締切 明日の To-Do を置く 1 行が出て、押すと 45 分の予定になる', () => {
    const { view, onClose } = open(45)
    const row = view.getByRole('button', { name: /レポート.*45m.*due tomorrow/i })
    fireEvent.click(row)
    expect(useTaskStore.getState().tasks.find((x) => x.id === 'r')).toMatchObject({
      scheduledDate: today(),
      startTime: '10:40',
      endTime: '11:25',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('見積もりが枠より長ければ何も出さない', () => {
    const { view } = open(90)
    expect(view.queryByRole('button', { name: /レポート/ })).toBeNull()
  })

  it('タイトルを書き始めたら消える', () => {
    const { view } = open(45)
    fireEvent.change(view.getByPlaceholderText(i18n.t('quickCreate.titlePlaceholder')), { target: { value: '新しい' } })
    expect(view.queryByRole('button', { name: /レポート/ })).toBeNull()
  })
})

describe('QuickCreatePopover: 記録の列の「＋ 記録なし」', () => {
  beforeEach(() => localStorage.clear())

  const openLog = () => {
    const log = (id: string, title: string, category: string | null) => ({
      ...makeTask({ title, listId: INBOX_LIST_ID, dueDate: today(), startTime: '08:00', endTime: '09:00' }, 0),
      id,
      kind: 'log' as const,
      completed: true,
      category,
      tags: category ? [category] : [],
    })
    useTaskStore.setState({ tasks: [log('l1', '授業', '授業'), log('l2', '授業', '授業'), log('l3', 'メール返信', null)] })
    const onClose = vi.fn()
    const view = render(
      <QuickCreatePopover
        anchor={anchor}
        dateKey={today()}
        startTime="07:00"
        endTime="10:00"
        asLog
        onTimesChange={() => {}}
        onClose={onClose}
        onCreated={() => {}}
      />,
    )
    return { view, onClose }
  }

  it('書く前は、よく記録するもののチップを出し、押すとその時間をその名前とラベルで記録する', () => {
    const { view, onClose } = openLog()
    fireEvent.click(view.getByRole('button', { name: /07:00.*10:00.*授業/ }))
    expect(useTaskStore.getState().tasks.find((x) => x.startTime === '07:00')).toMatchObject({
      title: '授業',
      endTime: '10:00',
      tags: ['授業'],
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('名前を書き始めたらチップは消える', () => {
    const { view } = openLog()
    fireEvent.change(view.getByPlaceholderText(i18n.t('quickCreate.logPlaceholder')), { target: { value: 'ジ' } })
    expect(document.querySelector('[data-recent-log-chips]')).toBeNull()
  })
})

describe('QuickCreatePopover: 予定の作成先を名前から選ぶ（#626）', () => {
  beforeEach(() => {
    localStorage.clear()
    // 前回は予定を Google に作った
    localStorage.setItem('chronograma-quick-create-v1', JSON.stringify({ kind: 'event', eventToGoogle: true }))
    useTaskStore.setState({
      googleConnected: true,
      googleCanWrite: true,
      addons: { ...useTaskStore.getState().addons, googleSkip: ['面接対策'] },
      calendarEvents: [
        { id: 'g1', summary: 'ゼミ', start: '', end: '', date: '2026-10-01', startTime: '10:00', endTime: '11:00', isAllDay: false },
      ],
      tasks: [
        {
          ...makeTask({ title: '移動', listId: INBOX_LIST_ID, scheduledDate: '2026-10-01', startTime: '09:00', endTime: '09:30' }, 0),
          id: 'm',
          kind: 'event',
        },
      ],
    })
  })

  const openCard = () =>
    render(
      <QuickCreatePopover
        anchor={anchor}
        dateKey={today()}
        startTime="10:00"
        endTime="11:00"
        onTimesChange={() => {}}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    )
  const google = () => i18n.t('googleEdit.destGoogle')
  const selectedText = (view: ReturnType<typeof openCard>) => {
    const select = view.getByRole('combobox') as HTMLSelectElement
    return select.options[select.selectedIndex].textContent
  }

  it('アプリの予定の名前ならリスト、Google の予定の名前なら Google、分からなければ前回のまま', () => {
    const view = openCard()
    const input = view.getByPlaceholderText(i18n.t('quickCreate.titlePlaceholder'))
    expect(selectedText(view)).toBe(google())
    fireEvent.change(input, { target: { value: ' 移動' } })
    expect(selectedText(view)).not.toBe(google())
    fireEvent.change(input, { target: { value: 'ゼミ' } })
    expect(selectedText(view)).toBe(google())
    fireEvent.change(input, { target: { value: '面接対策' } })
    expect(selectedText(view)).not.toBe(google())
    fireEvent.change(input, { target: { value: '買い物' } })
    expect(selectedText(view)).toBe(google())
  })

  it('自分で選び直したら、その名前の間は名前から変えない', () => {
    const view = openCard()
    const input = view.getByPlaceholderText(i18n.t('quickCreate.titlePlaceholder'))
    fireEvent.change(input, { target: { value: '移動' } })
    const select = view.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '__google__' } })
    expect(selectedText(view)).toBe(google())
  })

  it('アプリの予定の名前で保存すると Google ではなくアプリの予定になる', () => {
    const view = openCard()
    fireEvent.change(view.getByPlaceholderText(i18n.t('quickCreate.titlePlaceholder')), { target: { value: '移動' } })
    fireEvent.click(view.getByRole('button', { name: i18n.t('common.save') }))
    expect(useTaskStore.getState().tasks.filter((x) => x.title === '移動' && x.kind === 'event')).toHaveLength(2)
  })
})

describe('QuickCreatePopover: 習慣の名前の候補（#667）', () => {
  beforeEach(() => localStorage.clear())

  it('題名に名前の合う習慣を出し、押すと予定は作らずその日の習慣の枠をこの時間に置く', () => {
    const weekday = ((fromDateKey(today()).getDay() + 6) % 7) + 1
    // 今日を決めた曜日に入れない習慣（今日は「この日もやる」日になる）
    const other = (weekday % 7) + 1
    useTaskStore.setState({
      tasks: [],
      habits: [
        {
          id: 'gym',
          title: 'Gym',
          color: '#33B679',
          timeMode: 'range',
          startTime: '18:00',
          endTime: '19:00',
          frequency: { type: 'weekly', weekdays: [other as 1] },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          completedDates: [],
          archivedAt: null,
        },
      ],
    })
    const onClose = vi.fn()
    const view = render(
      <QuickCreatePopover
        anchor={anchor}
        dateKey={today()}
        startTime="07:00"
        endTime="08:00"
        onTimesChange={() => {}}
        onClose={onClose}
        onCreated={() => {}}
      />,
    )
    fireEvent.change(view.getByPlaceholderText(i18n.t('quickCreate.titlePlaceholder')), { target: { value: 'gym' } })
    fireEvent.click(view.getByRole('button', { name: /Put habit.*Gym/ }))
    expect(useTaskStore.getState().habits[0]!.timeOverrides?.[today()]).toEqual({ startTime: '07:00', endTime: '08:00', extra: true })
    expect(useTaskStore.getState().tasks).toHaveLength(0)
    expect(onClose).toHaveBeenCalled()
  })
})
