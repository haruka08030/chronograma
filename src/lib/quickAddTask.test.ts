import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'

/**
 * 文字からタスクを足す入口（上部の追加欄・今日の計画・カレンダーのセル・予定作成カード・サブタスク）は
 * どれも `addTaskFromQuickText` を通る。欄ごとの違いは「書かなかったときの既定値」だけであることを固定する。
 */

/** 2026-09-30 は水曜 */
const NOW = new Date(2026, 8, 30, 10, 0, 0)
const TODAY = '2026-09-30'

/** 画面の状態の代わり（リスト・タスクと、追加・更新だけ） */
const store = vi.hoisted(() => {
  const s = {
    tagsEnabled: true,
    selectedListId: '__inbox__' as string | null,
    lists: [] as TaskList[],
    tasks: [] as Task[],
    showMoveBanner: vi.fn(),
    asOneUndo: (fn: () => void) => fn(),
    addTask: (title: string, listId?: string, parentId?: string) => {
      const parent = parentId ? s.tasks.find((t) => t.id === parentId) : null
      const id = `t${s.tasks.length + 1}`
      s.tasks.push({
        id,
        title,
        listId: parent?.listId ?? listId ?? s.selectedListId ?? '__inbox__',
        parentId: parentId ?? null,
        scheduledDate: null,
        dueDate: null,
        startTime: null,
        endTime: null,
        tags: [],
      } as unknown as Task)
      return id
    },
    updateTask: (id: string, patch: Partial<Task>) => {
      s.tasks = s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t))
    },
  }
  return s
})

vi.mock('../store/taskStore', () => ({ useTaskStore: { getState: () => store } }))
vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { date?: string }) => (o?.date ? `${k}:${o.date}` : k), resolvedLanguage: 'ja', getFixedT: () => () => 'M/d' },
}))
vi.mock('./timeZone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./timeZone')>()),
  appToday: () => NOW,
  appTodayKey: () => TODAY,
}))

const { addTaskFromQuickText, firstRepeatDay, quickAddSchedule } = await import('./quickAddTask')

const list = (id: string, name: string, kind: TaskList['kind'] = 'tasks') => ({ id, name, kind }) as TaskList
const added = (id: string | undefined) => store.tasks.find((t) => t.id === id)!

beforeEach(() => {
  store.selectedListId = '__inbox__'
  store.lists = [list('__inbox__', 'Inbox'), list('school', '授業'), list('someday', 'いつか', 'someday'), list('shop', '買い物', 'checklist')]
  store.tasks = []
  store.showMoveBanner.mockClear()
})

describe('quickAddSchedule（日時の決め方）', () => {
  const none = { date: null, dateIsDeadline: false, startTime: null, endTime: null }

  it('何も書かなければ既定のやる日だけ', () => {
    expect(quickAddSchedule(none, { defaultDate: '2026-10-05' }, TODAY)).toEqual({ scheduledDate: '2026-10-05' })
    expect(quickAddSchedule(none, {}, TODAY)).toEqual({})
  })

  it('書いた日付は既定のやる日より勝つ', () => {
    expect(quickAddSchedule({ ...none, date: '2026-10-01' }, { defaultDate: '2026-10-05' }, TODAY)).toEqual({
      scheduledDate: '2026-10-01',
    })
  })

  it('締切は締切だけ。やる日は既定のまま', () => {
    expect(quickAddSchedule({ ...none, date: '2026-10-02', dateIsDeadline: true }, { defaultDate: '2026-10-05' }, TODAY)).toEqual({
      scheduledDate: '2026-10-05',
      dueDate: '2026-10-02',
    })
  })

  it('既定の時間帯（ドラッグした枠）は時刻を書かなければ使い、書けば書いたほうが勝つ', () => {
    const drag = { defaultDate: '2026-10-05', defaultTime: { startTime: '09:00', endTime: '10:30' } }
    expect(quickAddSchedule(none, drag, TODAY)).toEqual({ scheduledDate: '2026-10-05', startTime: '09:00', endTime: '10:30' })
    expect(quickAddSchedule({ ...none, startTime: '15:00', endTime: '16:00' }, drag, TODAY)).toEqual({
      scheduledDate: '2026-10-05',
      startTime: '15:00',
      endTime: '16:00',
    })
  })

  it('時刻だけで日付の既定も無ければ今日の予定', () => {
    expect(quickAddSchedule({ ...none, startTime: '15:00', endTime: '16:00' }, {}, TODAY)).toEqual({
      scheduledDate: TODAY,
      startTime: '15:00',
      endTime: '16:00',
    })
  })
})

describe('カレンダーのセル（defaultDate＝そのセルの日）', () => {
  const cell = { defaultListId: '__inbox__', currentListId: '__inbox__', defaultDate: '2026-10-05' }

  it('書かなければそのセルの日がやる日', () => {
    const t = added(addTaskFromQuickText('課題', cell))
    expect(t).toMatchObject({ title: '課題', scheduledDate: '2026-10-05', startTime: null })
  })

  it('時刻を書けばそのセルの日の予定', () => {
    const t = added(addTaskFromQuickText('15時 ES 1時間', cell))
    expect(t).toMatchObject({ title: 'ES', scheduledDate: '2026-10-05', startTime: '15:00', endTime: '16:00' })
  })

  it('書いた日付・締切・@リストが勝つ', () => {
    expect(added(addTaskFromQuickText('明日 課題', cell)).scheduledDate).toBe('2026-10-01')
    expect(added(addTaskFromQuickText('金曜まで レポート', cell))).toMatchObject({
      title: 'レポート',
      scheduledDate: '2026-10-05',
      dueDate: '2026-10-02',
    })
    const t = added(addTaskFromQuickText('レポート @授業', cell))
    expect(t).toMatchObject({ listId: 'school', scheduledDate: '2026-10-05' })
    expect(store.showMoveBanner.mock.calls).toEqual([['toast.addedToDay:10/1'], ['toast.addedToList']])
  })

  it('その日のままなら知らせない', () => {
    addTaskFromQuickText('15時 ES', cell)
    addTaskFromQuickText('金曜まで レポート', cell)
    expect(store.showMoveBanner).not.toHaveBeenCalled()
  })

  it('いつか・買い物には日付を付けない', () => {
    expect(added(addTaskFromQuickText('旅行 @いつか', cell))).toMatchObject({ listId: 'someday', scheduledDate: null })
    expect(added(addTaskFromQuickText('15時 牛乳 @買い物', cell))).toMatchObject({
      listId: 'shop',
      scheduledDate: null,
      startTime: null,
    })
  })
})

describe('予定作成カード（ドラッグした日・時間帯が既定）', () => {
  const drag = {
    defaultListId: '__inbox__',
    currentListId: '__inbox__',
    defaultDate: '2026-10-05',
    defaultTime: { startTime: '09:00', endTime: '10:30' },
  }

  it('時刻を書かなければドラッグした枠のまま', () => {
    expect(added(addTaskFromQuickText('ES', drag))).toMatchObject({ scheduledDate: '2026-10-05', startTime: '09:00', endTime: '10:30' })
  })

  it('時刻・日付を書けばそちらが勝つ', () => {
    expect(added(addTaskFromQuickText('明日 16時 面接', drag))).toMatchObject({
      title: '面接',
      scheduledDate: '2026-10-01',
      startTime: '16:00',
      endTime: '17:00',
    })
  })

  it('締切を書いても予定はドラッグした枠のまま', () => {
    expect(added(addTaskFromQuickText('レポート by fri', drag))).toMatchObject({
      scheduledDate: '2026-10-05',
      startTime: '09:00',
      dueDate: '2026-10-02',
    })
  })
})

describe('サブタスク（親とリストは固定）', () => {
  beforeEach(() => {
    store.tasks = [{ id: 'p', title: '親', listId: 'school', parentId: null } as unknown as Task]
  })

  it('日付・時刻・締切は読む', () => {
    expect(added(addTaskFromQuickText('明日 下書き', { parentId: 'p' }))).toMatchObject({
      title: '下書き',
      parentId: 'p',
      listId: 'school',
      scheduledDate: '2026-10-01',
    })
    expect(added(addTaskFromQuickText('金曜まで 提出', { parentId: 'p' })).dueDate).toBe('2026-10-02')
    expect(added(addTaskFromQuickText('15時 電話', { parentId: 'p' }))).toMatchObject({ scheduledDate: TODAY, startTime: '15:00' })
  })

  it('@… はリスト指定にせず題名に残す', () => {
    const t = added(addTaskFromQuickText('資料 @買い物', { parentId: 'p' }))
    expect(t).toMatchObject({ title: '資料 @買い物', listId: 'school', parentId: 'p' })
    expect(store.showMoveBanner).not.toHaveBeenCalled()
  })

  it('親がいつかのリストなら日付を付けない', () => {
    store.tasks = [{ id: 'p', title: '親', listId: 'someday', parentId: null } as unknown as Task]
    expect(added(addTaskFromQuickText('明日 下調べ', { parentId: 'p' }))).toMatchObject({ listId: 'someday', scheduledDate: null })
  })
})

describe('繰り返し（最初の回の日が締切）', () => {
  const rep = (type: 'daily' | 'weekly' | 'monthly' | 'yearly', interval = 1, weekday: number | null = null, monthDay: number | null = null) => ({
    type,
    interval,
    weekday,
    monthDay,
  })

  describe('firstRepeatDay（最初に当たる日）', () => {
    it('曜日・日の指定が無ければその日', () => {
      expect(firstRepeatDay(rep('daily'), TODAY)).toBe(TODAY)
      expect(firstRepeatDay(rep('weekly'), TODAY)).toBe(TODAY)
    })

    it('曜日は次に来るその曜日（同じ曜日ならその日）', () => {
      // 2026-09-30 は水曜
      expect(firstRepeatDay(rep('weekly', 1, 5), TODAY)).toBe('2026-10-02')
      expect(firstRepeatDay(rep('weekly', 1, 3), TODAY)).toBe(TODAY)
      expect(firstRepeatDay(rep('weekly', 1, 1), TODAY)).toBe('2026-10-05')
    })

    it('毎月◯日は次に来るその日。無い月は飛ばす', () => {
      expect(firstRepeatDay(rep('monthly', 1, null, 15), TODAY)).toBe('2026-10-15')
      expect(firstRepeatDay(rep('monthly', 1, null, 30), TODAY)).toBe(TODAY)
      expect(firstRepeatDay(rep('monthly', 1, null, 31), TODAY)).toBe('2026-10-31')
      expect(firstRepeatDay(rep('monthly', 1, null, 31), '2026-11-01')).toBe('2026-12-31')
      expect(firstRepeatDay(rep('monthly', 1, null, 29), '2027-02-01')).toBe('2027-03-29')
    })
  })

  describe('quickAddSchedule', () => {
    const none = { date: null, dateIsDeadline: false, startTime: null, endTime: null }

    it('上部の追加欄: 今日から数えた最初の回が締切。やる日は付けない', () => {
      expect(quickAddSchedule({ ...none, repeat: rep('daily') }, {}, TODAY)).toEqual({
        dueDate: TODAY,
        recurrence: { type: 'daily', interval: 1 },
      })
      expect(quickAddSchedule({ ...none, repeat: rep('weekly', 2, 5) }, {}, TODAY)).toEqual({
        dueDate: '2026-10-02',
        recurrence: { type: 'weekly', interval: 2 },
      })
    })

    it('書いた日付が最初の回', () => {
      expect(quickAddSchedule({ ...none, date: '2026-10-09', repeat: rep('weekly') }, {}, TODAY)).toEqual({
        dueDate: '2026-10-09',
        recurrence: { type: 'weekly', interval: 1 },
      })
    })

    it('既定のやる日があればその日から数え、やる日も最初の回に置く', () => {
      expect(quickAddSchedule({ ...none, repeat: rep('weekly', 1, 5) }, { defaultDate: '2026-10-05' }, TODAY)).toEqual({
        dueDate: '2026-10-09',
        scheduledDate: '2026-10-09',
        recurrence: { type: 'weekly', interval: 1 },
      })
    })

    it('時刻つきなら最初の回の日の予定', () => {
      expect(quickAddSchedule({ ...none, startTime: '15:00', endTime: '16:00', repeat: rep('weekly', 1, 5) }, {}, TODAY)).toEqual({
        dueDate: '2026-10-02',
        scheduledDate: '2026-10-02',
        startTime: '15:00',
        endTime: '16:00',
        recurrence: { type: 'weekly', interval: 1 },
      })
    })

    it('締切として書いたら、やる日は既定のまま', () => {
      const parsed = { ...none, dateIsDeadline: true, repeat: rep('weekly', 1, 5) }
      expect(quickAddSchedule(parsed, { defaultDate: TODAY }, TODAY)).toEqual({
        dueDate: '2026-10-02',
        scheduledDate: TODAY,
        recurrence: { type: 'weekly', interval: 1 },
      })
      expect(quickAddSchedule(parsed, {}, TODAY)).toEqual({ dueDate: '2026-10-02', recurrence: { type: 'weekly', interval: 1 } })
      expect(quickAddSchedule({ ...parsed, startTime: '09:00', endTime: '10:00' }, {}, TODAY)).toMatchObject({
        dueDate: '2026-10-02',
        scheduledDate: TODAY,
        startTime: '09:00',
      })
    })
  })

  it('「毎週金 ゴミ出し」は金曜締切の毎週', () => {
    expect(added(addTaskFromQuickText('毎週金 ゴミ出し'))).toMatchObject({
      title: 'ゴミ出し',
      dueDate: '2026-10-02',
      scheduledDate: null,
      recurrence: { type: 'weekly', interval: 1 },
    })
  })

  it('「毎日 日記」は今日締切の毎日', () => {
    expect(added(addTaskFromQuickText('毎日 日記 #習慣'))).toMatchObject({
      title: '日記',
      dueDate: TODAY,
      tags: ['習慣'],
      recurrence: { type: 'daily', interval: 1 },
    })
  })

  it('「毎月15日 家賃」は次の 15 日', () => {
    expect(added(addTaskFromQuickText('毎月15日 家賃'))).toMatchObject({
      title: '家賃',
      dueDate: '2026-10-15',
      recurrence: { type: 'monthly', interval: 1 },
    })
  })

  it('「毎週月水」は繰り返しで表せないのでタイトルのまま', () => {
    expect(added(addTaskFromQuickText('毎週月水 ジム'))).toMatchObject({ title: '毎週月水 ジム', dueDate: null })
    expect(added(addTaskFromQuickText('毎週月水 ジム')).recurrence).toBeUndefined()
  })

  it('カレンダーのセルで別の日に入ったら知らせる', () => {
    const cell = { defaultListId: '__inbox__', currentListId: '__inbox__', defaultDate: '2026-10-05' }
    expect(added(addTaskFromQuickText('毎週金 ゴミ出し', cell))).toMatchObject({ scheduledDate: '2026-10-09', dueDate: '2026-10-09' })
    expect(store.showMoveBanner.mock.calls).toEqual([['toast.addedToDay:10/9']])
  })

  it('いつか・買い物には繰り返しも付けない', () => {
    const t = added(addTaskFromQuickText('毎週 牛乳 @買い物'))
    expect(t).toMatchObject({ listId: 'shop', dueDate: null })
    expect(t.recurrence).toBeUndefined()
  })
})
