import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import {
  canvasCourseSectionsToTags,
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
  it('creates the list and open assignments, tagged with their course', () => {
    const r = reconcile([], [item('1'), item('2', { courseId: '202', courseName: '統計学' }), item('3', { done: true })])
    expect(r.lists.find((l) => l.id === CANVAS_LIST_ID)?.name).toBe('Canvas')
    expect(r.sections).toEqual([])
    expect(r.tasks.map((t) => t.id)).toEqual([canvasTaskId(CONN, 'assignment', '1'), canvasTaskId(CONN, 'assignment', '2')])
    expect(r.tasks.map((t) => t.tags)).toEqual([['経済学入門'], ['統計学']])
    const first = r.tasks[0]
    expect(first).toMatchObject({ listId: CANVAS_LIST_ID, sectionId: null, dueDate: '2026-10-05', dueTime: '23:59' })
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

  it('puts two schools in one list, and one school never completes the other’s tasks', () => {
    const OTHER = 'other.instructure.com'
    const a = reconcile([], [item('1')])
    const b = reconcileCanvasItems(
      { lists: a.lists, sections: a.sections, tasks: a.tasks },
      { id: OTHER, windowStart: WINDOW.windowStart, windowEnd: WINDOW.windowEnd, items: [item('1', { courseId: '9', courseName: 'オンライン講座' })] },
      opts,
    )
    expect(b.lists.filter((l) => l.id.startsWith('canvas-list')).map((l) => l.id)).toEqual([CANVAS_LIST_ID])
    expect(b.tasks.map((t) => t.tags)).toEqual([['経済学入門'], ['オンライン講座']])
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

describe('canvasCourseSectionsToTags', () => {
  const sec = (id: string, name: string, listId = CANVAS_LIST_ID) => ({ id, listId, name, order: 0 })

  it('turns course sections into tags and removes them, leaving other sections alone', () => {
    const tasks = imported([item('1'), item('2')]).map((t, i) => ({
      ...t,
      tags: i === 0 ? [] : ['経済学入門'],
      sectionId: i === 0 ? canvasSectionId(CONN, '101') : 'canvas-course-77',
    }))
    const mine = { ...tasks[0], id: 'mine', sectionId: 'my-sec' }
    const r = canvasCourseSectionsToTags(
      { sections: [sec(canvasSectionId(CONN, '101'), '経済学入門'), sec('canvas-course-77', '経済学入門', 'other-list'), sec('my-sec', '自分の')], tasks: [...tasks, mine] },
      NOW,
    )
    expect(r.converted).toBe(true)
    expect(r.sections.map((s) => s.id)).toEqual(['my-sec'])
    expect(r.tasks.map((t) => [t.sectionId, t.tags])).toEqual([
      [null, ['経済学入門']],
      [null, ['経済学入門']],
      ['my-sec', []],
    ])
  })

  it('does nothing without course sections', () => {
    const tasks = imported([item('1')])
    const r = canvasCourseSectionsToTags({ sections: [], tasks }, NOW)
    expect(r).toMatchObject({ converted: false })
    expect(r.tasks).toBe(tasks)
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

