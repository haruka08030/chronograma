import { beforeAll, describe, expect, it, vi } from 'vitest'
import { TASK_DEFAULTS } from '../lib/taskDefaults'
import type { Task } from '../types/task'

// ストアを node で読み込むための最小限の localStorage
beforeAll(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  })
})
vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? [] : k), language: 'ja' },
}))

const { useTaskStore } = await import('./taskStore')
const { buildBackupPayload, parseBackupJson } = await import('../lib/backupFormat')
const S = () => useTaskStore.getState()
const OLD = '2026-01-01T00:00:00.000Z'
const tick = () => new Promise((r) => queueMicrotask(() => r(null)))
/** トーストの「元に戻す」を押す */
const pressUndo = () => S().undoOperation(S().undoBanner!.undoId!)

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: OLD,
    updatedAt: OLD,
    order: 0,
    listId: '__inbox__',
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    ...patch,
  }
}

describe('取り消せなかった操作をトーストから戻す（#490）', () => {
  it('繰り返しを変えて外れた回はゴミ箱へ入り、「N 回分を削除しました」から戻る', async () => {
    const series = { id: 's1', weekdays: [1 as const], until: '2026-10-26', skipHolidays: false }
    const mondays = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']
    useTaskStore.setState({
      tasks: mondays.map((d, i) =>
        task(`c${i}`, {
          kind: 'event',
          scheduledDate: d,
          startTime: '09:00',
          endTime: '10:30',
          series,
          description: i === 3 ? 'メモ' : '',
        }),
      ),
      undoBanner: null,
    })
    expect(S().setEventRepeat('c0', { ...series, until: '2026-10-12' })).toBe(true)
    await tick()
    const trashed = S().tasks.filter((t) => t.deletedAt)
    expect(trashed.map((t) => t.id).sort()).toEqual(['c2', 'c3'])
    // 繰り返しの印は外す（あとで同じ日を戻しても、消した回と読み違えない）
    expect(trashed.every((t) => !t.series)).toBe(true)
    expect(S().undoBanner?.text).toEqual({ key: 'undo.occurrencesDeleted', params: { count: 2 } })
    pressUndo()
    expect(S().tasks.filter((t) => !t.deletedAt)).toHaveLength(4)
    expect(S().tasks.find((t) => t.id === 'c3')).toMatchObject({ description: 'メモ', series: { id: 's1', until: '2026-10-26' } })
  })

  it('破棄した記録はトーストから戻る。ほかの記録を始めていたら戻さない', () => {
    const timer = { taskTitle: 'ES', startedAt: '2026-10-19T09:00:00.000Z', tags: [] }
    useTaskStore.setState({ activeTimer: timer, undoBanner: null })
    S().discardActiveTimer()
    expect(S().activeTimer).toBeNull()
    expect(S().undoBanner).toMatchObject({ text: { key: 'undo.timerDiscarded', params: { title: 'ES' } }, restoreTimer: true })
    expect(S().restoreDiscardedTimer()).toBe(true)
    expect(S().activeTimer).toEqual(timer)

    S().discardActiveTimer()
    const other = { ...timer, taskTitle: 'ジム' }
    useTaskStore.setState({ activeTimer: other })
    expect(S().restoreDiscardedTimer()).toBe(false)
    expect(S().activeTimer).toEqual(other)
    useTaskStore.setState({ activeTimer: null })
  })

  it('全部外すはトーストに件数を出し、戻すとチェックが付く', async () => {
    useTaskStore.setState({ tasks: [task('a', { completed: true }), task('b', { completed: true }), task('c')], undoBanner: null })
    S().uncheckTasks(['a', 'b', 'c'])
    await tick()
    expect(S().undoBanner?.text).toEqual({ key: 'undo.tasksUnchecked', params: { count: 2 } })
    pressUndo()
    expect(
      S()
        .tasks.filter((t) => t.completed)
        .map((t) => t.id),
    ).toEqual(['a', 'b'])
  })

  it('名前を空にしたラベルも削除として数える', () => {
    useTaskStore.setState({ timeLogTagPresets: ['勉強', 'バイト'], logCategoryColors: {}, undoBanner: null })
    S().saveLogLabels([
      { from: '勉強', name: '勉強', color: '#039BE5' },
      { from: 'バイト', name: '  ', color: '#33B679' },
    ])
    expect(S().timeLogTagPresets).toEqual(['勉強'])
    expect(S().undoBanner?.text).toEqual({ key: 'undo.labelDeleted', params: { name: 'バイト' } })
  })

  it('支払いの削除・よく入れる予定・時間割も戻せる', async () => {
    const due = { id: 'd1', title: '家賃', date: '2026-10-27', repeat: 'monthly' as const, notifyDays: 3 }
    useTaskStore.setState({ addons: { ...S().addons, dues: [due] }, undoBanner: null })
    S().deleteDue('d1')
    await tick()
    expect(S().addons.dues).toEqual([])
    expect(S().undoBanner?.text).toEqual({ key: 'undo.dueDeleted', params: { name: '家賃' } })
    pressUndo()
    expect(S().addons.dues).toEqual([due])

    useTaskStore.setState({ eventTemplates: [] })
    S().saveEventTemplates([{ id: 'e', title: 'バイト 早番', startTime: '09:00', endTime: '15:00', color: null }])
    await tick()
    expect(S().undoLastOperation()).toBe(true)
    expect(S().eventTemplates).toEqual([])

    const before = S().timetable
    S().setClassAbsenceLimit('経済学入門', 4)
    await tick()
    expect(S().timetable).not.toBe(before)
    expect(S().undoLastOperation()).toBe(true)
    expect(S().timetable).toEqual(before)
  })

  it('バックアップ（取り込みの控え）にラベルの週の目安も入る', () => {
    const json = JSON.stringify(
      buildBackupPayload({
        tasks: [],
        lists: [{ id: '__inbox__', name: '未分類', color: '#33B679', order: 0 }],
        habits: [],
        sections: [],
        timeLogTagPresets: ['勉強'],
        logCategoryColors: {},
        logLabelTargets: { 勉強: 600 },
      }),
    )
    expect(parseBackupJson(json)?.logLabelTargets).toEqual({ 勉強: 600 })
  })
})
