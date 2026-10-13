import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PERIODS, type Timetable } from '../lib/timetable'
import { TASK_DEFAULTS } from '../lib/taskDefaults'

// ストアを node で読み込むための最小限の localStorage
beforeAll(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T12:00:00'))
})
afterAll(() => {
  vi.useRealTimers()
})
vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? [] : k), language: 'ja' },
}))

const { useTaskStore } = await import('./taskStore')
const { DATA_KEYS, TRANSIENT_KEYS } = await import('./persistKeys')

const S = () => useTaskStore.getState()
const live = () => S().tasks.filter((t) => t.kind === 'event' && !t.deletedAt)
const liveDates = () =>
  live()
    .map((t) => t.scheduledDate)
    .sort()
const tick = () => new Promise((r) => queueMicrotask(() => r(null)))
/** 後期（2026-10-01〜2027-01-31）、祝日も入れる */
const term: Timetable = { periods: [...DEFAULT_PERIODS], termStart: '2026-10-01', termEnd: '2027-01-31', skipHolidays: false }

/** 月曜 1 限の授業を入れて、いちばん早い回の id を返す */
function addMondayClass(opts: Partial<Timetable> = {}) {
  useTaskStore.setState({ timetable: { ...term, ...opts } })
  const n = S().addTimetableClass({ weekday: 1, startTime: '09:00', endTime: '10:30', title: '経済学入門', color: '#039BE5' })
  return { n, rows: live().sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!)) }
}

beforeEach(() => {
  useTaskStore.setState({ tasks: [], recentDeletes: [], seriesEditScope: null, timetable: term, timetableUpdatedAt: null })
  while (S().undoLastOperation()) {
    /* 前のテストの履歴を空にする */
  }
})

describe('時間割から授業を入れる', () => {
  it('学期の間（今日から後）の、その曜日の毎週の予定を作る。同じ印・名前・時刻・ラベルのふつうの予定', () => {
    const { n, rows } = addMondayClass()
    // 10/12〜1/25 の月曜（今日 10/8 より前の 10/5 は作らない）
    expect(n).toBe(16)
    expect(rows[0]!.scheduledDate).toBe('2026-10-12')
    expect(rows.at(-1)!.scheduledDate).toBe('2027-01-25')
    expect(new Set(rows.map((t) => t.series!.id)).size).toBe(1)
    expect(rows.every((t) => t.title === '経済学入門' && t.startTime === '09:00' && t.endTime === '10:30' && t.color === '#039BE5')).toBe(
      true,
    )
    expect(rows[0]!.series).toMatchObject({ weekdays: [1], until: '2027-01-31', skipHolidays: false })
  })

  it('祝日は授業を入れないにすると、祝日（スポーツの日・勤労感謝の日・成人の日）の回は作らない', () => {
    const { n } = addMondayClass({ skipHolidays: true })
    expect(liveDates()).not.toContain('2026-10-12')
    expect(liveDates()).not.toContain('2026-11-23')
    expect(liveDates()).not.toContain('2027-01-11')
    expect(n).toBe(13)
  })

  it('学期がまだ始まっていなければ学期の始まりから。名前が空なら作らない', () => {
    const { n, rows } = addMondayClass({ termStart: '2027-04-06', termEnd: '2027-07-31' })
    expect(rows[0]!.scheduledDate).toBe('2027-04-12')
    expect(n).toBe(16)
    expect(S().addTimetableClass({ weekday: 2, startTime: '09:00', endTime: '10:30', title: '  ', color: null })).toBe(0)
  })

  it('1 回の取り消しで全部の回が消える', () => {
    addMondayClass()
    S().undoLastOperation()
    expect(live()).toHaveLength(0)
  })

  it('マスの名前・ラベルを直すと、その回から後の回がみな変わる', () => {
    const { rows } = addMondayClass()
    S().updateTimetableClass(rows[0]!.id, { title: 'ミクロ経済学', color: null })
    expect(live().every((t) => t.title === 'ミクロ経済学' && t.color === null)).toBe(true)
  })
})

describe('毎週の予定を直す範囲', () => {
  it('選んでいないときは「この予定のみ」', () => {
    const { rows } = addMondayClass()
    S().updateTask(rows[3]!.id, { location: 'A棟 201' })
    expect(
      live()
        .filter((t) => t.location === 'A棟 201')
        .map((t) => t.id),
    ).toEqual([rows[3]!.id])
  })

  it('以降すべて: その回と日付が後の回に、名前・時刻・場所を写す（日付は回ごと）', () => {
    const { rows } = addMondayClass()
    S().setSeriesEditScope(rows[3]!.id, 'following')
    S().updateTask(rows[3]!.id, { startTime: '10:40', endTime: '12:10' })
    S().updateTask(rows[3]!.id, { scheduledDate: '2026-11-03' })
    const moved = live().filter((t) => t.startTime === '10:40')
    expect(moved).toHaveLength(rows.length - 3)
    expect(moved.every((t) => t.scheduledDate! >= '2026-11-02')).toBe(true)
    expect(live().filter((t) => t.scheduledDate === '2026-11-03')).toHaveLength(1)
    // 前の回はそのまま
    expect(live().filter((t) => t.startTime === '09:00')).toHaveLength(3)
  })

  it('すべて: 前の回にも写す。1 回の取り消しで戻る', () => {
    const { rows } = addMondayClass()
    S().setSeriesEditScope(rows[5]!.id, 'all')
    S().updateTask(rows[5]!.id, { title: '経済学入門（教室変更）' })
    expect(live().every((t) => t.title === '経済学入門（教室変更）')).toBe(true)
    S().undoLastOperation()
    expect(live().every((t) => t.title === '経済学入門')).toBe(true)
  })

  it('範囲はほかの予定には効かず、閉じたら（null）この予定のみに戻る。保存しない', () => {
    const { rows } = addMondayClass()
    S().setSeriesEditScope(rows[0]!.id, 'all')
    S().updateTask(rows[1]!.id, { location: 'B棟' })
    expect(live().filter((t) => t.location === 'B棟')).toHaveLength(1)
    S().setSeriesEditScope(rows[0]!.id, null)
    expect(S().seriesEditScope).toBeNull()
    expect(TRANSIENT_KEYS).toContain('seriesEditScope')
  })

  it('To-Do にした回は繰り返しから外れる', () => {
    const { rows } = addMondayClass()
    S().updateTask(rows[0]!.id, { kind: 'todo' })
    expect('series' in S().tasks.find((t) => t.id === rows[0]!.id)!).toBe(false)
  })
})

describe('毎週の予定を消す', () => {
  it('この予定のみ: その回だけゴミ箱へ（休講）', () => {
    const { rows } = addMondayClass()
    expect(S().deleteEventSeries(rows[2]!.id, 'one')).toBe(1)
    expect(live()).toHaveLength(rows.length - 1)
    expect(S().tasks.find((t) => t.id === rows[2]!.id)!.deletedAt).not.toBeNull()
  })

  it('以降すべて: その回から後をゴミ箱へ。取り消しで戻る', () => {
    const { rows } = addMondayClass()
    expect(S().deleteEventSeries(rows[4]!.id, 'following')).toBe(rows.length - 4)
    expect(live()).toHaveLength(4)
    S().undoLastOperation()
    expect(live()).toHaveLength(rows.length)
  })

  it('すべて: 全部の回をゴミ箱へ', () => {
    const { rows } = addMondayClass()
    expect(S().deleteEventSeries(rows[4]!.id, 'all')).toBe(rows.length)
    expect(live()).toHaveLength(0)
  })
})

describe('予定に繰り返しを付ける', () => {
  it('ふつうの予定に毎週（月・水、終わりの日つき）を付けると期間中の回ができ、やめると後の回が消える', () => {
    useTaskStore.setState({
      tasks: [
        {
          ...TASK_DEFAULTS,
          id: 'shift',
          title: '経済学入門',
          description: '',
          completed: false,
          completedAt: null,
          createdAt: '2026-10-08T00:00:00.000Z',
          updatedAt: '2026-10-08T00:00:00.000Z',
          order: 0,
          listId: '__inbox__',
          sectionId: null,
          parentId: null,
          dueDate: null,
          scheduledDate: '2026-10-12',
          startTime: '13:00',
          endTime: '14:30',
          priority: 'none',
          tags: [],
          recurrence: null,
          kind: 'event',
        },
      ],
    })
    expect(S().setEventRepeat('shift', { weekdays: [1, 3], until: '2026-10-28', skipHolidays: false })).toBe(true)
    expect(liveDates()).toEqual(['2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28'])
    const tenFourteen = live().find((t) => t.scheduledDate === '2026-10-14')!
    S().setEventRepeat(tenFourteen.id, null)
    expect(liveDates()).toEqual(['2026-10-12', '2026-10-14'])
  })
})

describe('時間割の設定', () => {
  it('データと同じ保存先に置き、変えたら時刻を付ける（端末間でどちらが新しいかを比べる）', async () => {
    expect(DATA_KEYS).toContain('timetable')
    expect(DATA_KEYS).toContain('timetableUpdatedAt')
    S().saveTimetable({ ...term, skipHolidays: true })
    await tick()
    expect(S().timetable.skipHolidays).toBe(true)
    expect(S().timetableUpdatedAt).not.toBeNull()
    const at = S().timetableUpdatedAt
    // 同じ中身なら時刻を進めない
    S().saveTimetable({ ...term, skipHolidays: true })
    await tick()
    expect(S().timetableUpdatedAt).toBe(at)
  })
})
