import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import {
  canvasCourseSectionsToTags,
  canvasDue,
  canvasFeedUrlProblem,
  feedItemDue,
  canvasExpiryWarning,
  CANVAS_LIST_ID,
  mergeCanvasLists,
  canvasSectionId,
  canvasTaskId,
  insideCanvasWindow,
  parseCanvasTaskId,
  reconcileCanvasItems,
  withConnections,
  type CanvasItem,
  type CanvasStatus,
} from './canvas'
import type { PulledFields } from './externalFields'
import { INBOX_ID } from '../store/storeConstants'

const NOW = '2026-10-02T00:00:00.000Z'
const CONN = 'school.instructure.com'
const WINDOW = { id: CONN, windowStart: '2026-09-02', windowEnd: '2027-01-30' }
const inbox: TaskList = { id: 'inbox', name: 'Inbox', color: '#000000', order: 0 }
const opts = {
  now: NOW,
  timeZone: 'Asia/Tokyo',
  untitled: '（無題）',
}

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

function reconcile(
  tasks: Task[],
  items: CanvasItem[],
  extra: Partial<typeof opts & { skipIds: Set<string>; pulled: Record<string, PulledFields> }> = {},
) {
  return reconcileCanvasItems({ sections: [], tasks }, { ...WINDOW, items }, { ...opts, ...extra })
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
  it('creates open assignments in To-Do, tagged with their course but not labeled', () => {
    const r = reconcile([], [item('1'), item('2', { courseId: '202', courseName: '統計学' }), item('3', { done: true })])
    expect(r.sections).toEqual([])
    expect(r.tasks.map((t) => t.id)).toEqual([canvasTaskId(CONN, 'assignment', '1'), canvasTaskId(CONN, 'assignment', '2')])
    expect(r.tasks.map((t) => t.tags)).toEqual([['経済学入門'], ['統計学']])
    expect(r.tasks.map((t) => t.color)).toEqual([null, null])
    const first = r.tasks[0]
    expect(first).toMatchObject({ listId: INBOX_ID, sectionId: null, dueDate: '2026-10-05', dueTime: '23:59' })
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

  it('keeps a title or deadline the user changed, and still follows later Canvas changes to the other field', () => {
    const first = reconcile([], [item('1')], { pulled: {} })
    const id = first.tasks[0]!.id
    // ユーザーがタイトルを書き換えた
    const edited = first.tasks.map((t) => ({ ...t, title: '自分用のメモ' }))
    const r = reconcile(edited, [item('1', { title: 'レポート（改）', dueAt: '2026-10-06T14:59:59Z' })], { pulled: first.pulled })
    expect(r.tasks[0]).toMatchObject({ id, title: '自分用のメモ', dueDate: '2026-10-06' })
    expect(r.pulled[id]).toMatchObject({ title: 'レポート（改）', dueDate: '2026-10-06' })
  })

  it('treats the current values as the last pulled ones when nothing was remembered (does not overwrite)', () => {
    const tasks = imported([item('1')]).map((t) => ({ ...t, title: '自分用のメモ' }))
    const r = reconcile(tasks, [item('1')], { pulled: {} })
    expect(r.tasks[0]!.title).toBe('自分用のメモ')
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

  it('does not complete a feed assignment due early morning Japan time just because its deadline passed (#329)', () => {
    // 今 = 2026-10-06T10:00Z。フィードは前日（UTC）から取るので windowStart は 10/5
    const feed = { id: CONN, windowStart: '2026-10-05', windowEnd: '2027-02-03', readOnly: true }
    // 日本時間 10/5 8:00 締切（UTC では 10/4 23:00）。フィードの期間の外なので返ってこない
    const tasks = reconcileCanvasItems(
      { sections: [], tasks: [] },
      { ...WINDOW, items: [item('11', { dueAt: '2026-10-04T23:00:00Z' })] },
      opts,
    ).tasks
    expect(tasks[0]).toMatchObject({ dueDate: '2026-10-05', dueTime: '08:00' })
    const r = reconcileCanvasItems({ sections: [], tasks }, { ...feed, items: [] }, { ...opts, pulled: {} })
    expect(r.autoCompletedIds).toEqual([])
    expect(r.tasks[0].completed).toBe(false)
  })

  it('still completes a feed assignment that vanished while clearly inside the window', () => {
    const feed = { id: CONN, windowStart: '2026-10-05', windowEnd: '2027-02-03', readOnly: true }
    // 日本時間 10/7 8:00 締切（UTC 10/6 23:00）
    const tasks = reconcile([], [item('12', { dueAt: '2026-10-06T23:00:00Z' })]).tasks
    const r = reconcileCanvasItems({ sections: [], tasks }, { ...feed, items: [] }, opts)
    expect(r.autoCompletedIds).toEqual([canvasTaskId(CONN, 'assignment', '12')])
  })

  it('judges the window with the deadline Canvas gave, not one the user moved', () => {
    const feed = { id: CONN, windowStart: '2026-10-05', windowEnd: '2027-02-03', readOnly: true }
    const first = reconcile([], [item('13', { dueAt: '2026-10-01T14:59:59Z' })], { pulled: {} })
    // ユーザーが期限を先へずらした。Canvas の締切は期間の前なので、返ってこなくても消えたとは限らない
    const moved = first.tasks.map((t) => ({ ...t, dueDate: '2026-10-20' }))
    const r = reconcileCanvasItems({ sections: [], tasks: moved }, { ...feed, items: [] }, { ...opts, pulled: first.pulled })
    expect(r.autoCompletedIds).toEqual([])
  })

  it('one school never completes the other’s tasks', () => {
    const OTHER = 'other.instructure.com'
    const a = reconcile([], [item('1')])
    const b = reconcileCanvasItems(
      { sections: a.sections, tasks: a.tasks },
      {
        id: OTHER,
        windowStart: WINDOW.windowStart,
        windowEnd: WINDOW.windowEnd,
        items: [item('1', { courseId: '9', courseName: 'オンライン講座' })],
      },
      opts,
    )
    expect(b.tasks.map((t) => t.tags)).toEqual([['経済学入門'], ['オンライン講座']])
    expect(b.tasks.map((t) => t.id)).toEqual([canvasTaskId(CONN, 'assignment', '1'), canvasTaskId(OTHER, 'assignment', '1')])
    // 1 校目が空で返っても、2 校目のタスクは完了にしない
    const c = reconcileCanvasItems({ sections: b.sections, tasks: b.tasks }, { ...WINDOW, items: [] }, opts)
    expect(c.tasks.map((t) => t.completed)).toEqual([true, false])
  })
})

describe('insideCanvasWindow', () => {
  const window = { windowStart: '2026-10-05', windowEnd: '2026-10-10' }

  it('compares the deadline as a UTC day, like the server window', () => {
    // 日本時間 10/6 8:00 は UTC 10/5 23:00 → 端の日なので内側に数えない
    expect(insideCanvasWindow({ dueDate: '2026-10-06', dueTime: '08:00' }, window, 'Asia/Tokyo')).toBe(false)
    // 日本時間 10/6 9:00 は UTC 10/6 0:00
    expect(insideCanvasWindow({ dueDate: '2026-10-06', dueTime: '09:00' }, window, 'Asia/Tokyo')).toBe(true)
    // ニューヨーク 10/9 21:00 は UTC 10/10 1:00 → 端の日
    expect(insideCanvasWindow({ dueDate: '2026-10-09', dueTime: '21:00' }, window, 'America/New_York')).toBe(false)
  })

  it('compares all-day deadlines as dates and leaves tasks without a deadline out', () => {
    expect(insideCanvasWindow({ dueDate: '2026-10-06', dueTime: null }, window, 'Asia/Tokyo')).toBe(true)
    expect(insideCanvasWindow({ dueDate: '2026-10-05', dueTime: null }, window, 'Asia/Tokyo')).toBe(false)
    expect(insideCanvasWindow({ dueDate: null, dueTime: null }, window, 'Asia/Tokyo')).toBe(false)
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
    expect(r.lists.map((l) => [l.id, l.name])).toEqual([
      ['inbox', 'Inbox'],
      [CANVAS_LIST_ID, '大学'],
    ])
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
      {
        sections: [
          sec(canvasSectionId(CONN, '101'), '経済学入門'),
          sec('canvas-course-77', '経済学入門', 'other-list'),
          sec('my-sec', '自分の'),
        ],
        tasks: [...tasks, mine],
      },
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

  it('Moodle の書き出しの URL も受け付け、書き出しの画面は分けて案内する（#310）', () => {
    const token = '3f2a9c0d1e4b5a6978c0d1e2f3a4b5c6'
    expect(
      canvasFeedUrlProblem(`https://moodle.example.ac.jp/calendar/export_execute.php?userid=12&authtoken=${token}&preset_what=all`),
    ).toBeNull()
    expect(canvasFeedUrlProblem(`lms.example.ac.jp/moodle/calendar/export_execute.php?userid=12&authtoken=${token}`)).toBeNull()
    expect(canvasFeedUrlProblem('https://moodle.example.ac.jp/calendar/export.php?course=1')).toBe('moodlePage')
  })
})

describe('feedItemDue（#310）', () => {
  it('終日は日付のまま、UTC の瞬間はアプリのタイムゾーンの日時に', () => {
    expect(feedItemDue({ dueAt: null, dueDate: '2026-10-18' }, 'America/Los_Angeles')).toEqual({ dueDate: '2026-10-18', dueTime: null })
    expect(feedItemDue({ dueAt: '2026-10-10T14:59:00Z' }, 'Asia/Tokyo')).toEqual({ dueDate: '2026-10-10', dueTime: '23:59' })
  })

  it('TZID 付きの壁時計は、そのタイムゾーンの瞬間としてアプリのタイムゾーンに直す', () => {
    const wall = { date: '2026-10-15', time: '23:59', timeZone: 'Asia/Tokyo' }
    expect(feedItemDue({ dueAt: null, dueWall: wall }, 'Asia/Tokyo')).toEqual({ dueDate: '2026-10-15', dueTime: '23:59' })
    // 夏時間中のロサンゼルス（UTC-7）では 10/15 7:59
    expect(feedItemDue({ dueAt: null, dueWall: wall }, 'America/Los_Angeles')).toEqual({ dueDate: '2026-10-15', dueTime: '07:59' })
  })

  it('浮動・読めない TZID（Outlook の「Tokyo Standard Time」など）はアプリのタイムゾーンの時刻として読む', () => {
    const floating = { date: '2026-10-16', time: '12:00', timeZone: null }
    expect(feedItemDue({ dueAt: null, dueWall: floating }, 'America/New_York')).toEqual({ dueDate: '2026-10-16', dueTime: '12:00' })
    const windows = { date: '2026-10-16', time: '12:00', timeZone: 'Tokyo Standard Time' }
    expect(feedItemDue({ dueAt: null, dueWall: windows }, 'Europe/London')).toEqual({ dueDate: '2026-10-16', dueTime: '12:00' })
  })

  it('Moodle の課題を、科目のタグと締切つきの To-Do として取り込む', () => {
    const conn = 'moodle.example.ac.jp'
    const r = reconcileCanvasItems(
      { sections: [], tasks: [] },
      {
        id: conn,
        windowStart: '2026-10-01',
        windowEnd: '2027-01-29',
        readOnly: true,
        items: [
          {
            type: 'assignment',
            id: '1207',
            title: 'Essay draft is due',
            courseId: null,
            courseName: 'ENG-201',
            url: 'https://moodle.example.ac.jp/calendar/view.php?view=upcoming',
            dueAt: null,
            dueWall: { date: '2026-10-15', time: '23:59', timeZone: 'Asia/Tokyo' },
            done: false,
          },
        ],
      },
      { ...opts, timeZone: 'Asia/Tokyo' },
    )
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0]).toMatchObject({
      id: 'canvas-moodle.example.ac.jp-assignment-1207',
      title: 'Essay draft is due',
      tags: ['ENG-201'],
      dueDate: '2026-10-15',
      dueTime: '23:59',
      kind: 'todo',
    })
  })
})
