import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import {
  CANVAS_LIST_ID,
  canvasDue,
  canvasSectionId,
  canvasTaskId,
  parseCanvasTaskId,
  reconcileCanvasItems,
  type CanvasItem,
} from './canvas'

const NOW = '2026-10-02T00:00:00.000Z'
const WINDOW = { windowStart: '2026-09-02', windowEnd: '2027-01-30' }
const inbox: TaskList = { id: 'inbox', name: 'Inbox', color: '#000000', order: 0 }
const opts = { now: NOW, listName: 'Canvas', listColor: '#123456', timeZone: 'Asia/Tokyo', untitled: '（無題）' }

function item(id: string, patch: Partial<CanvasItem> = {}): CanvasItem {
  return {
    type: 'assignment',
    id,
    title: `レポート${id}`,
    courseId: '101',
    courseName: '経済学入門',
    url: `https://school.instructure.com/courses/101/assignments/${id}`,
    // 日本時間 10/5 23:59
    dueAt: '2026-10-05T14:59:59Z',
    done: false,
    ...patch,
  }
}

function reconcile(tasks: Task[], items: CanvasItem[], extra: Partial<typeof opts & { skipIds: Set<string> }> = {}) {
  return reconcileCanvasItems({ lists: [inbox], sections: [], tasks }, { ...WINDOW, items }, { ...opts, ...extra })
}

function imported(items: CanvasItem[]) {
  return reconcile([], items).tasks
}

describe('canvasTaskId', () => {
  it('round-trips and ignores ordinary ids', () => {
    expect(parseCanvasTaskId(canvasTaskId('discussion_topic', '42'))).toEqual({ type: 'discussion_topic', id: '42' })
    expect(parseCanvasTaskId('canvas-list')).toBeNull()
    expect(parseCanvasTaskId('canvas-course-101')).toBeNull()
  })
})

describe('canvasDue', () => {
  it('converts the UTC deadline to the app time zone', () => {
    expect(canvasDue('2026-10-05T14:59:59Z', 'Asia/Tokyo')).toEqual({ dueDate: '2026-10-05', dueTime: '23:59' })
    expect(canvasDue(null, 'Asia/Tokyo')).toEqual({ dueDate: null, dueTime: null })
  })
})

describe('reconcileCanvasItems', () => {
  it('creates the list, a section per course, and open assignments', () => {
    const r = reconcile([], [item('1'), item('2', { courseId: '202', courseName: '統計学' }), item('3', { done: true })])
    expect(r.lists.find((l) => l.id === CANVAS_LIST_ID)?.name).toBe('Canvas')
    expect(r.sections.map((s) => s.name)).toEqual(['経済学入門', '統計学'])
    expect(r.tasks.map((t) => t.id)).toEqual([canvasTaskId('assignment', '1'), canvasTaskId('assignment', '2')])
    const first = r.tasks[0]
    expect(first).toMatchObject({ listId: CANVAS_LIST_ID, sectionId: canvasSectionId('101'), dueDate: '2026-10-05', dueTime: '23:59' })
    expect(first.description).toContain('/assignments/1')
  })

  it('follows title and deadline changes on open tasks', () => {
    const tasks = imported([item('1')])
    const r = reconcile(tasks, [item('1', { title: 'レポート（改）', dueAt: '2026-10-06T14:59:59Z' })])
    expect(r.tasks[0]).toMatchObject({ title: 'レポート（改）', dueDate: '2026-10-06' })
  })

  it('completes a task once it is submitted in Canvas, and reports it as automatic', () => {
    const tasks = imported([item('1')])
    const r = reconcile(tasks, [item('1', { done: true })])
    expect(r.tasks[0].completed).toBe(true)
    expect(r.autoCompletedIds).toEqual([canvasTaskId('assignment', '1')])
  })

  it('does not reopen a task the user completed', () => {
    const tasks = imported([item('1')]).map((t) => ({ ...t, completed: true, completedAt: NOW }))
    const r = reconcile(tasks, [item('1')])
    expect(r.tasks).toBe(tasks)
  })

  it('leaves tasks waiting to be written back alone', () => {
    const tasks = imported([item('1')])
    const r = reconcile(tasks, [item('1', { done: true })], { skipIds: new Set([tasks[0].id]) })
    expect(r.tasks[0].completed).toBe(false)
  })

  it('completes assignments that vanished inside the window, but keeps old overdue ones', () => {
    const tasks = imported([item('1'), item('2', { dueAt: '2026-08-01T14:59:59Z' })])
    const r = reconcile(tasks, [])
    expect(r.tasks.find((t) => t.id === canvasTaskId('assignment', '1'))?.completed).toBe(true)
    expect(r.tasks.find((t) => t.id === canvasTaskId('assignment', '2'))?.completed).toBe(false)
  })

  it('reuses an existing course section instead of adding another', () => {
    const first = reconcile([], [item('1')])
    const r = reconcileCanvasItems(
      { lists: first.lists, sections: first.sections, tasks: first.tasks },
      { ...WINDOW, items: [item('1'), item('2')] },
      opts,
    )
    expect(r.sections).toHaveLength(1)
    expect(r.tasks).toHaveLength(2)
  })
})
