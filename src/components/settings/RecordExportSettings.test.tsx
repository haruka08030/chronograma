import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordExportSettings } from './RecordExportSettings'
import { useTaskStore } from '../../store/taskStore'
import { TASK_DEFAULTS } from '../../lib/taskDefaults'
import { appTimeZone, appTodayKey } from '../../lib/timeZone'
import { exportPeriodRange } from '../../lib/recordExport'
import type { Task } from '../../types/task'

const download = vi.hoisted(() => vi.fn())
vi.mock('../../lib/downloadFile', () => ({ downloadTextFile: download }))

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    order: 0,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    timeZoneAnchor: appTimeZone(),
    ...over,
  }) as Task

/** 前の月の 1 日（今月・今週には入らない） */
const lastMonthDay = () => exportPeriodRange('lastMonth', appTodayKey()).from!

const initial = useTaskStore.getState()

beforeEach(() => {
  download.mockClear()
})

afterEach(() => {
  useTaskStore.setState({ tasks: initial.tasks, habits: initial.habits })
})

const exportRow = () => screen.getByRole('button', { name: 'Export CSV' }).parentElement!.parentElement!

describe('設定「記録を書き出す」', () => {
  it('期間に記録が無ければ「0 records」で、どちらのボタンも押せない', () => {
    useTaskStore.setState({ tasks: [task('old', { kind: 'log', dueDate: lastMonthDay(), startTime: '09:00', endTime: '10:00' })] })
    render(<RecordExportSettings />)
    expect(within(exportRow()).getByText('0 records')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export ICS' })).toBeDisabled()
  })

  it('期間を変えると件数が変わり、CSV（BOM つき）と ICS を日付入りの名前で書き出す', async () => {
    const user = userEvent.setup()
    const today = appTodayKey()
    useTaskStore.setState({
      tasks: [
        task('old', { kind: 'log', dueDate: lastMonthDay(), startTime: '09:00', endTime: '10:00', title: '先月の記録' }),
        task('sleep', { kind: 'sleep', dueDate: lastMonthDay(), startTime: '01:00', endTime: '07:00' }),
      ],
    })
    render(<RecordExportSettings />)
    await user.click(screen.getByRole('radio', { name: 'Last month' }))
    expect(within(exportRow()).getByText('1 record · 1 sleep record')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(download).toHaveBeenCalledTimes(1)
    const [csv, csvName, csvType] = download.mock.calls[0]!
    expect(csvName).toBe(`chronograma-records-${today}.csv`)
    expect(csvType).toBe('text/csv;charset=utf-8')
    expect(csv.startsWith('\uFEFFkind,date,start,end,end_date,minutes,label,title,tags,plan\r\n')).toBe(true)
    expect(csv).toContain('Record,')
    expect(csv).toContain('Sleep,')

    await user.click(screen.getByRole('button', { name: 'Export ICS' }))
    const [ics, icsName, icsType] = download.mock.calls[1]!
    expect(icsName).toBe(`chronograma-records-${today}.ics`)
    expect(icsType).toBe('text/calendar;charset=utf-8')
    expect(ics).toContain('SUMMARY:先月の記録')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
  })

  it('予定と ✓ で終えた To-Do は、スイッチを入れたときだけ CSV に入る（ICS は記録だけなので押せないまま）', async () => {
    const user = userEvent.setup()
    useTaskStore.setState({
      tasks: [task('shift', { kind: 'event', scheduledDate: lastMonthDay(), startTime: '17:00', endTime: '22:00', title: 'バイト' })],
    })
    render(<RecordExportSettings />)
    await user.click(screen.getByRole('radio', { name: 'Last month' }))
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()

    await user.click(screen.getByRole('switch', { name: 'Also put plans and checked-off to-dos in the CSV' }))
    expect(within(exportRow()).getByText('0 records · 1 plan or to-do')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export ICS' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(download.mock.calls[0]![0]).toContain('Plan,')
    expect(download.mock.calls[0]![0]).toContain(',300,,バイト,,')
  })
})
