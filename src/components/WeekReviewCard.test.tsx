import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { TASK_DEFAULTS } from '../lib/taskDefaults'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { shiftReviewPeriod } from '../lib/reviewPeriod'
import { periodTargetMinutes } from '../lib/labelTargets'
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

describe('WeekReviewCard: ラベルの週の目安（#291）', () => {
  const seedTargets = (targets: Record<string, number>) => {
    const today = toDateKey(zonedNow())
    const log = (id: string, category: string, startTime: string, endTime: string) =>
      task(id, { kind: 'log', completed: true, tags: [category], category, dueDate: today, startTime, endTime })
    useTaskStore.setState({
      tasks: [log('s', 'Study', '00:00', '02:00'), log('w', 'Work', '02:00', '03:00')],
      timeLogTagPresets: ['Study', 'ES', 'Work'],
      logCategoryColors: { Study: 'sage', ES: 'tomato', Work: 'peacock' },
      logLabelTargets: targets,
    })
  }

  it('目安のあるラベルは「記録 / 目安」と細い線。記録の無い目安のラベルも 0 で並べ、目安の無いラベルは今のまま', () => {
    seedTargets({ Study: 900, ES: 300 })
    render(<WeekReviewCard />)
    expect(screen.getByText('2 / 15 h')).toHaveAttribute('aria-label', 'Logged 2h / target 15h')
    expect(screen.getByText('0 / 5 h')).toBeInTheDocument()
    // 目安の無い Work は記録した時間だけ
    const work = screen.getByText('Work').closest('li')!
    expect(work).toHaveTextContent(/1h$/)
    expect(work.textContent).not.toContain('/')
  })

  it('月は週の目安をその月の日数に合わせる', () => {
    seedTargets({ Study: 900 })
    render(<WeekReviewCard />)
    fireEvent.click(screen.getByRole('radio', { name: 'Month' }))
    const monthly = periodTargetMinutes(900, 'month', zonedNow())
    expect(screen.getByText(`2 / ${monthly / 60} h`)).toHaveAttribute(
      'aria-label',
      expect.stringContaining('weekly 15h scaled to the days in this month'),
    )
  })

  it('目安を付けていなければ表示は変わらない', () => {
    seedTargets({})
    render(<WeekReviewCard />)
    expect(screen.queryByText(/ \/ .* h$/)).toBeNull()
    expect(screen.queryByText('ES')).toBeNull()
  })
})

describe('WeekReviewCard: ラベルごとの予定と、予定に無かった記録（#275）', () => {
  const seedPlans = () => {
    const today = toDateKey(zonedNow())
    useTaskStore.setState({
      tasks: [
        // Study の色（sage）の To-Do 3 時間に、▶ で 1 時間だけ記録。ES の色の To-Do 1 時間は記録なし
        task('study', { title: 'Problem set', color: '#33B679', scheduledDate: today, startTime: '00:00', endTime: '03:00' }),
        task('es', { title: 'Write ES', color: '#D50000', scheduledDate: today, startTime: '04:00', endTime: '05:00' }),
        task('l1', {
          kind: 'log',
          completed: true,
          title: 'Problem set',
          tags: ['Study'],
          category: 'Study',
          dueDate: today,
          startTime: '00:00',
          endTime: '01:00',
          sourceTaskId: 'study',
        }),
        // どの予定とも組にならない記録
        task('yt', { kind: 'log', completed: true, title: 'YouTube', dueDate: today, startTime: '06:00', endTime: '07:30' }),
      ],
      timeLogTagPresets: ['Study', 'ES'],
      logCategoryColors: { Study: 'sage', ES: 'tomato' },
      logLabelTargets: {},
    })
  }

  it('ラベルの行に予定した時間を文字と点線の枠で並べ、予定だけのラベルも記録 0 で出す', () => {
    seedPlans()
    render(<WeekReviewCard />)
    const study = screen.getByText('Study').closest('li')!
    expect(study).toHaveTextContent('1h')
    expect(study).toHaveTextContent('Planned 3h')
    const es = screen.getByText('ES').closest('li')!
    expect(es).toHaveTextContent('Planned 1h')
  })

  it('予定に無かった記録を出す。予定の無い週には出さない', () => {
    seedPlans()
    const { unmount } = render(<WeekReviewCard />)
    const list = screen.getByRole('list', { name: 'Not in the plan' })
    expect(list).toHaveTextContent('YouTube')
    expect(list).toHaveTextContent('1h 30m')
    unmount()

    useTaskStore.setState({ tasks: useTaskStore.getState().tasks.filter((t) => t.kind === 'log') })
    render(<WeekReviewCard />)
    expect(screen.queryByText('Not in the plan')).toBeNull()
    expect(screen.queryByText(/Planned \d/)).toBeNull()
  })
})

describe('WeekReviewCard: 一言は数字から（#276）', () => {
  it('記録のある週は合計といちばん長いラベル。決まり文句は出さない', () => {
    seed()
    render(<WeekReviewCard />)
    expect(screen.getByText(/^2h logged in total; the most was .+ at 2h\.$/)).toBeInTheDocument()
    expect(screen.queryByText('Steady progress.')).toBeNull()
  })

  it('はじめの案内は一度も記録していない人だけ。記録したことがあれば、空の週は事実だけ', () => {
    useTaskStore.setState({ tasks: [] })
    const { unmount } = render(<WeekReviewCard />)
    expect(screen.getByText(/^Nothing logged this week yet\. Block time/)).toBeInTheDocument()
    unmount()

    const old = toDateKey(shiftReviewPeriod('month', zonedNow(), -3))
    useTaskStore.setState({ tasks: [task('old', { kind: 'log', completed: true, dueDate: old, startTime: '09:00', endTime: '10:00' })] })
    render(<WeekReviewCard />)
    expect(screen.getByText('Nothing logged or planned this week yet.')).toBeInTheDocument()
  })
})
