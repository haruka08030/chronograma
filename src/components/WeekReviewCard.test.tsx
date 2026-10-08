import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { TASK_DEFAULTS } from '../lib/taskDefaults'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { shiftReviewPeriod } from '../lib/reviewPeriod'
import { zonedNow } from '../lib/timeZone'
import type { Task } from '../types/task'
import { WeekReviewCard } from './WeekReviewCard'
import { TaskEstimateField } from './detail/TaskEstimateField'

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
    ...over,
  }) as Task

/** 今日終えた「Write ES」（見積もり 1 時間）と、▶ で始めた 2 時間の記録 */
function seed() {
  const today = toDateKey(zonedNow())
  const es = task('es', { title: 'Write ES', completed: true, completedAt: new Date().toISOString(), estimateMinutes: 60 })
  const tasks = [
    es,
    task('l1', {
      kind: 'log',
      title: 'Write ES',
      dueDate: today,
      startTime: '00:10',
      endTime: '02:10',
      completed: true,
      sourceTaskId: 'es',
    }),
  ]
  useTaskStore.setState({ tasks })
  return es
}

describe('WeekReviewCard: 見積もりと記録（#297）', () => {
  it('この週に終えた To-Do の見積もりと記録した時間を並べる', () => {
    seed()
    render(<WeekReviewCard />)
    expect(screen.getByText('Estimate vs logged')).toBeInTheDocument()
    expect(screen.getByText('Write ES')).toBeInTheDocument()
    expect(screen.getByText('Est. 1h / logged 2h')).toBeInTheDocument()
  })

  it('結び付いた記録のある完了 To-Do が無ければ出さない', () => {
    useTaskStore.setState({ tasks: [task('open', { estimateMinutes: 60 })] })
    render(<WeekReviewCard />)
    expect(screen.queryByText('Estimate vs logged')).toBeNull()
  })
})

describe('TaskEstimateField: 完了した To-Do に記録した時間を添える', () => {
  it('完了していれば記録の合計を出す', () => {
    const es = seed()
    render(<TaskEstimateField task={es} />)
    expect(screen.getByText('Time logged: 2h')).toBeInTheDocument()
  })

  it('まだやる前の To-Do には出さない', () => {
    const es = seed()
    render(<TaskEstimateField task={{ ...es, completed: false, completedAt: null }} />)
    expect(screen.queryByText(/Time logged/)).toBeNull()
  })
})

describe('WeekReviewCard: 月のふりかえり（#304）', () => {
  it('月に切り替えると、日のマスと、ラベル別の時間の前の月との差を出す。‹ で前の月へ戻れる', () => {
    const today = toDateKey(zonedNow())
    const prevMonthDay = toDateKey(shiftReviewPeriod('month', fromDateKey(today), -1))
    const study = { kind: 'log' as const, completed: true, tags: ['Study'], category: 'Study' }
    useTaskStore.setState({
      tasks: [
        task('now', { ...study, dueDate: today, startTime: '00:00', endTime: '02:00' }),
        task('prev', { ...study, dueDate: prevMonthDay, startTime: '00:00', endTime: '01:00' }),
      ],
    })
    render(<WeekReviewCard />)
    fireEvent.click(screen.getByRole('radio', { name: 'Month' }))

    expect(screen.getByText('Monthly review')).toBeInTheDocument()
    expect(screen.getByText('+1h vs last month')).toBeInTheDocument()
    expect(screen.getByText('vs last month')).toBeInTheDocument()
    expect(screen.getByText('+1h')).toBeInTheDocument()
    // 日のマス: 今日のマスに記録の合計（色だけに頼らない）
    expect(screen.getByRole('button', { name: new RegExp(`logged 2h`) })).toHaveTextContent('2h')
    // 週の棒の「予定」の凡例は月では出さない
    expect(screen.queryByText('Planned')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('Habits kept that month')).toBeInTheDocument()
    expect(screen.getAllByText('1h').length).toBeGreaterThan(0)
    // その前の月に記録が無いので差は出さない
    expect(screen.queryByText(/vs previous month/)).toBeNull()
  })
})
