import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventTemplate } from '../lib/eventTemplates'
import { TASK_DEFAULTS } from '../lib/taskDefaults'

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
const { DATA_KEYS } = await import('./persistKeys')

const late: EventTemplate = { id: 'late', title: 'バイト 遅番', startTime: '17:00', endTime: '22:00', color: '#039BE5' }
const early: EventTemplate = { id: 'early', title: 'バイト 早番', startTime: '09:00', endTime: '15:00', color: null }
const DAYS = ['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-15', '2026-10-21']
const tick = () => new Promise((r) => queueMicrotask(() => r(null)))
const S = () => useTaskStore.getState()
const activeEvents = () => S().tasks.filter((t) => t.kind === 'event' && !t.deletedAt)

/** 月表示で日を続けて押す（`useEventTemplateStamp` と同じ呼び方） */
function tapDays(templateId: string, session: string, days: string[], created = new Set<string>()) {
  for (const d of days) {
    S().asUndoSession(session, () => {
      const r = S().toggleEventTemplateDay(templateId, d, created)
      if (r?.kind === 'added') created.add(r.taskId)
    })
  }
  return created
}

beforeEach(() => {
  useTaskStore.setState({ tasks: [], recentDeletes: [], eventTemplates: [late, early] })
  while (S().undoLastOperation()) {
    /* 前のテストの履歴を空にする */
  }
})

describe('よく入れる予定の登録', () => {
  it('端末に保存し（データと同じ保存先）、変えたら時刻を付ける（端末間でどちらが新しいかを比べる）', () => {
    expect(DATA_KEYS).toContain('eventTemplates')
    expect(DATA_KEYS).toContain('eventTemplatesUpdatedAt')
    useTaskStore.setState({ eventTemplatesUpdatedAt: null })
    S().saveEventTemplates([late])
    expect(S().eventTemplates).toEqual([late])
    expect(S().eventTemplatesUpdatedAt).not.toBeNull()
  })

  it('足す・直す・消すは保存でまとめて置き換える。名前が空の行は入れない', () => {
    S().saveEventTemplates([
      { ...late, title: '遅番' },
      early,
      { id: 'new', title: ' ', startTime: '10:00', endTime: '11:00', color: null },
    ])
    expect(S().eventTemplates.map((t) => t.title)).toEqual(['遅番', 'バイト 早番'])
    S().saveEventTemplates([early])
    expect(S().eventTemplates).toEqual([early])
  })

  it('同じ中身を保存し直しても時刻を付けない（同期で送り直さない）', () => {
    S().saveEventTemplates([late, early])
    const before = S().eventTemplatesUpdatedAt
    const ref = S().eventTemplates
    S().saveEventTemplates([{ ...late }, { ...early }])
    expect(S().eventTemplates).toBe(ref)
    expect(S().eventTemplatesUpdatedAt).toBe(before)
  })
})

describe('月表示で日を押して入れる', () => {
  it('日を 5 つ押すと、その 5 日に同じ時刻・ラベルの予定が入る（ふつうの予定・未分類）', () => {
    tapDays('late', 's1', DAYS)
    const events = activeEvents()
    expect(events.map((t) => t.scheduledDate).sort()).toEqual(DAYS)
    for (const t of events) {
      expect(t).toMatchObject({
        kind: 'event',
        title: 'バイト 遅番',
        startTime: '17:00',
        endTime: '22:00',
        color: '#039BE5',
        listId: '__inbox__',
        dueDate: null,
        completed: false,
      })
    }
  })

  it('もう一度押すと外れる。続けて押している間に入れたものはゴミ箱に残さない', () => {
    const created = tapDays('late', 's1', DAYS.slice(0, 2))
    tapDays('late', 's1', [DAYS[0]!], created)
    expect(activeEvents().map((t) => t.scheduledDate)).toEqual([DAYS[1]])
    expect(S().tasks).toHaveLength(1)
  })

  it('前から入っていた同じ予定を押すとゴミ箱へ（消えたまま残らないよう戻せる）', () => {
    tapDays('late', 's1', [DAYS[0]!])
    tapDays('late', 's2', [DAYS[0]!])
    expect(activeEvents()).toHaveLength(0)
    expect(S().tasks).toHaveLength(1)
    expect(S().tasks[0]!.deletedAt).not.toBeNull()
  })

  it('同じ日でも別の「よく入れる予定」は別に入る', () => {
    tapDays('late', 's1', [DAYS[0]!])
    tapDays('early', 's2', [DAYS[0]!])
    expect(
      activeEvents()
        .map((t) => t.title)
        .sort(),
    ).toEqual(['バイト 早番', 'バイト 遅番'])
  })

  it('登録に無い id は何もしない', () => {
    expect(S().toggleEventTemplateDay('nope', DAYS[0]!)).toBeNull()
    expect(S().tasks).toHaveLength(0)
  })
})

describe('続けて押した分は 1 回の取り消しで戻る', () => {
  it('5 日押したあと ⌘Z 1 回で 5 件とも消え、やり直しで 5 件とも戻る', async () => {
    tapDays('late', 's1', DAYS)
    await tick()
    expect(S().undoLastOperation()).toBe(true)
    expect(activeEvents()).toHaveLength(0)
    expect(S().redoLastOperation()).toBe(true)
    expect(activeEvents()).toHaveLength(5)
  })

  it('押して外したものも含めて、押す前に戻る（前からあった予定はゴミ箱から戻る）', async () => {
    tapDays('late', 'old', [DAYS[0]!])
    await tick()
    const created = tapDays('late', 's1', DAYS.slice(1, 3))
    tapDays('late', 's1', [DAYS[0]!, DAYS[1]!], created)
    await tick()
    expect(activeEvents().map((t) => t.scheduledDate)).toEqual([DAYS[2]])
    S().undoLastOperation()
    expect(activeEvents().map((t) => t.scheduledDate)).toEqual([DAYS[0]])
  })

  it('間にほかの操作をしたら、その後に押した分は別の回', async () => {
    tapDays('late', 's1', DAYS.slice(0, 2))
    await tick()
    S().saveEventTemplates([late, early, { id: 'x', title: '授業', startTime: '10:40', endTime: '12:10', color: null }])
    S().addTask('メモ')
    await tick()
    tapDays('late', 's1', DAYS.slice(2, 4))
    await tick()
    S().undoLastOperation()
    expect(activeEvents()).toHaveLength(2)
    S().undoLastOperation()
    expect(S().tasks.some((t) => t.title === 'メモ')).toBe(false)
    S().undoLastOperation()
    expect(activeEvents()).toHaveLength(0)
  })

  it('押している間に同期で届いた行は、取り消しで消さない', async () => {
    tapDays('late', 's1', [DAYS[0]!])
    await tick()
    const remote = {
      ...TASK_DEFAULTS,
      id: 'remote',
      title: '他の端末の予定',
      description: '',
      completed: false,
      completedAt: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      order: 0,
      listId: '__inbox__',
      sectionId: null,
      parentId: null,
      dueDate: null,
      startTime: null,
      endTime: null,
      priority: 'none' as const,
      tags: [],
      recurrence: null,
    }
    useTaskStore.setState((s) => ({ tasks: [...s.tasks, remote] }))
    tapDays('late', 's1', [DAYS[1]!])
    await tick()
    S().undoLastOperation()
    expect(activeEvents()).toHaveLength(0)
    expect(S().tasks.some((t) => t.id === 'remote')).toBe(true)
  })
})
