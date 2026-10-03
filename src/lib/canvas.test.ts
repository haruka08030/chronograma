import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import {
  canvasDue,
  canvasFeedUrlProblem,
  canvasExpiryWarning,
  CANVAS_LIST_ID,
  mergeCanvasLists,
  canvasSectionId,
  canvasTaskId,
  parseCanvasTaskId,
  reconcileCanvasItems,
  withConnections,
  type CanvasItem,
  type CanvasStatus,
} from './canvas'

const NOW = '2026-10-02T00:00:00.000Z'
const CONN = 'school.instructure.com'
const WINDOW = { id: CONN, windowStart: '2026-09-02', windowEnd: '2027-01-30' }
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
    expect(parseCanvasTaskId(canvasTaskId('my-school.instructure.com', 'discussion_topic', '42'))).toEqual({
      connectionId: 'my-school.instructure.com',
      type: 'discussion_topic',
      id: '42',
    })
    expect(parseCanvasTaskId(CANVAS_LIST_ID)).toBeNull()
    expect(parseCanvasTaskId(canvasSectionId(CONN, '101'))).toBeNull()
  })
})

describe('canvasDue', () => {
  it('converts the UTC deadline to the app time zone', () => {
    expect(canvasDue('2026-10-05T14:59:59Z', 'Asia/Tokyo')).toEqual({ dueDate: '2026-10-05', dueTime: '23:59' })
    expect(canvasDue(null, 'Asia/Tokyo')).toEqual({ dueDate: null, dueTime: null })
  })
})

describe('canvasExpiryWarning', () => {
  const now = Date.parse(NOW)
  it('warns only within 14 days of expiry', () => {
    expect(canvasExpiryWarning('2026-10-10T00:00:00Z', now)?.toISOString()).toBe('2026-10-10T00:00:00.000Z')
    expect(canvasExpiryWarning('2026-12-25T00:00:00Z', now)).toBeNull()
    expect(canvasExpiryWarning(null, now)).toBeNull()
  })
})

describe('reconcileCanvasItems', () => {
  it('creates the list, a section per course, and open assignments', () => {
    const r = reconcile([], [item('1'), item('2', { courseId: '202', courseName: '統計学' }), item('3', { done: true })])
    expect(r.lists.find((l) => l.id === CANVAS_LIST_ID)?.name).toBe('Canvas')
    expect(r.sections.map((s) => s.name)).toEqual(['経済学入門', '統計学'])
    expect(r.tasks.map((t) => t.id)).toEqual([canvasTaskId(CONN, 'assignment', '1'), canvasTaskId(CONN, 'assignment', '2')])
    const first = r.tasks[0]
    expect(first).toMatchObject({ listId: CANVAS_LIST_ID, sectionId: canvasSectionId(CONN, '101'), dueDate: '2026-10-05', dueTime: '23:59' })
    expect(first.description).toContain('/assignments/1')
  })

  it('keeps all-day feed deadlines as a date without a time', () => {
    const r = reconcile([], [item('1', { dueAt: null, dueDate: '2026-10-10' })])
    expect(r.tasks[0]).toMatchObject({ dueDate: '2026-10-10', dueTime: null })
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
    expect(r.autoCompletedIds).toEqual([canvasTaskId(CONN, 'assignment', '1')])
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
    expect(r.tasks.find((t) => t.id === canvasTaskId(CONN, 'assignment', '1'))?.completed).toBe(true)
    expect(r.tasks.find((t) => t.id === canvasTaskId(CONN, 'assignment', '2'))?.completed).toBe(false)
  })

  it('brings assignments that fell into the inbox back to their course, even done ones', () => {
    const [open, done] = imported([item('1'), item('2')])
    const stray = [
      { ...open, listId: '__inbox__', sectionId: null },
      { ...done, listId: '__inbox__', sectionId: null, completed: true },
    ]
    const r = reconcile(stray, [item('1'), item('2')])
    for (const t of r.tasks) expect(t).toMatchObject({ listId: CANVAS_LIST_ID, sectionId: canvasSectionId(CONN, '101') })
    expect(r.tasks[1].completed).toBe(true)
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

  it('puts two schools in one list, and one school never completes the other’s tasks', () => {
    const OTHER = 'other.instructure.com'
    const a = reconcile([], [item('1')])
    const b = reconcileCanvasItems(
      { lists: a.lists, sections: a.sections, tasks: a.tasks },
      { id: OTHER, windowStart: WINDOW.windowStart, windowEnd: WINDOW.windowEnd, items: [item('1', { courseId: '9', courseName: 'オンライン講座' })] },
      opts,
    )
    expect(b.lists.filter((l) => l.id.startsWith('canvas-list')).map((l) => l.id)).toEqual([CANVAS_LIST_ID])
    expect(b.sections.map((x) => x.name)).toEqual(['経済学入門', 'オンライン講座'])
    expect(b.tasks.map((t) => t.id)).toEqual([canvasTaskId(CONN, 'assignment', '1'), canvasTaskId(OTHER, 'assignment', '1')])
    // 1 校目が空で返っても、2 校目のタスクは完了にしない
    const c = reconcileCanvasItems({ lists: b.lists, sections: b.sections, tasks: b.tasks }, { ...WINDOW, items: [] }, opts)
    expect(c.tasks.map((t) => t.completed)).toEqual([true, false])
  })
})

describe('mergeCanvasLists', () => {
  const list = (id: string, name: string, order: number): TaskList => ({ id, name, color: '#111111', order })
  const sec = (id: string, listId: string, order: number) => ({ id, listId, name: id, order })

  it('moves tasks and sections of per-school lists into one list, keeping the first list’s name', () => {
    const tasks = imported([item('1')]).map((t) => ({ ...t, listId: 'canvas-list-a.edu' }))
    const r = mergeCanvasLists(
      {
        lists: [inbox, list('canvas-list-b.edu', 'Canvas（b）', 3), list('canvas-list-a.edu', '大学', 2)],
        sections: [sec('s-b1', 'canvas-list-b.edu', 0), sec('s-a1', 'canvas-list-a.edu', 0), sec('s-a2', 'canvas-list-a.edu', 1)],
        tasks,
      },
      NOW,
    )!
    expect(r.lists.map((l) => [l.id, l.name])).toEqual([['inbox', 'Inbox'], [CANVAS_LIST_ID, '大学']])
    expect(r.sections.map((s) => [s.id, s.listId, s.order])).toEqual([
      ['s-b1', CANVAS_LIST_ID, 2],
      ['s-a1', CANVAS_LIST_ID, 0],
      ['s-a2', CANVAS_LIST_ID, 1],
    ])
    expect(r.tasks.every((t) => t.listId === CANVAS_LIST_ID)).toBe(true)
    expect(r.mergedIds.sort()).toEqual(['canvas-list-a.edu', 'canvas-list-b.edu'])
  })

  it('does nothing when there is nothing to merge', () => {
    expect(mergeCanvasLists({ lists: [inbox], sections: [], tasks: [] }, NOW)).toBeNull()
  })
})

describe('a course section moved to another list', () => {
  it('gets the course’s new assignments in that list', () => {
    const first = reconcile([], [item('1')])
    const moved = first.sections.map((s) => ({ ...s, listId: 'my-list' }))
    const r = reconcileCanvasItems({ lists: first.lists, sections: moved, tasks: first.tasks }, { ...WINDOW, items: [item('1'), item('2')] }, opts)
    expect(r.tasks.find((t) => t.id === canvasTaskId(CONN, 'assignment', '2'))).toMatchObject({ listId: 'my-list', sectionId: canvasSectionId(CONN, '101') })
  })
})

describe('withConnections', () => {
  it('古い 1 校だけの応答でも、学校の一覧は空の配列になる', () => {
    const old = { ok: true, connected: true, baseUrl: 'https://school.instructure.com' } as unknown as CanvasStatus
    expect(withConnections(old).connections).toEqual([])
  })

  it('一覧があればそのまま', () => {
    const c = { id: CONN, baseUrl: `https://${CONN}` } as CanvasStatus['connections'][number]
    expect(withConnections({ connections: [c] }).connections).toEqual([c])
  })
})

describe('canvasFeedUrlProblem', () => {
  it('accepts the feed URL and tells the calendar page apart from other URLs', () => {
    expect(canvasFeedUrlProblem('https://canvas.ucsc.edu/feeds/calendars/user_AbC123xyz.ics')).toBeNull()
    expect(canvasFeedUrlProblem('https://canvas.ucsc.edu/calendar#view_name=month&view_start=2026-10-02')).toBe('calendarPage')
    expect(canvasFeedUrlProblem('https://canvas.ucsc.edu/courses/77')).toBe('notFeed')
    expect(canvasFeedUrlProblem('')).toBeNull()
  })
})
