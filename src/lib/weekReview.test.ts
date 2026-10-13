import { afterEach, describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import type { Habit } from '../types/habit'
import {
  compareReviews,
  foldLabelMinutes,
  getDayReviews,
  getPlanDriftCells,
  getPrevReview,
  getReview,
  getWeekReview,
  loggedMinutesVsPrevWeek,
  recentDailyLoggedMinutes,
  type LabelSource,
} from './weekReview'
import { recordLabelKey } from './logCategoryColors'
import { setAppTimeZoneSetting } from './timeZone'
import { TASK_DEFAULTS } from './taskDefaults'
import { matchPlanAndActualForDate } from './matchEvents'
import { scheduledTaskToPlannedItem } from './plannedItemUtils'

const task = (id: string, over: Partial<Task> = {}): Task => ({
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
})

// 2026-10-03 (土)
const at = (hm: string) => new Date(`2026-10-03T${hm}:00`)

describe('getWeekReview followRate', () => {
  const tasks = [task('ゼミ', { scheduledDate: '2026-10-03', startTime: '15:00', endTime: '16:30' })]

  it('does not judge a plan that has not ended yet', () => {
    const review = getWeekReview(tasks, [], at('00:30'), new Set(), at('00:30'))
    expect(review.timedPlanned).toBe(0)
    expect(review.followRate).toBeNull()
  })

  it('counts the plan once its time has passed', () => {
    const review = getWeekReview(tasks, [], at('17:00'), new Set(), at('17:00'))
    expect(review.timedPlanned).toBe(1)
    expect(review.followRate).toBe(0)
  })

  it('counts a plan already recorded before it ends', () => {
    const log = task('log', { title: 'ゼミ', kind: 'log', dueDate: '2026-10-03', startTime: '15:00', endTime: '15:40' })
    const review = getWeekReview([...tasks, log], [], at('15:45'), new Set(), at('15:45'))
    expect(review.timedPlanned).toBe(1)
    expect(review.followRate).toBe(1)
    expect(review.followed).toBe(1)
  })
})

describe('getWeekReview: ✓ で終えた予定・▶ の記録・授業などの予定（#284）', () => {
  const day = '2026-10-03'
  const tasks = [
    // ✓ で終えた時刻つきの To-Do（記録なし）
    task('baito', {
      title: 'バイト',
      scheduledDate: day,
      startTime: '09:00',
      endTime: '12:00',
      completed: true,
      completedAt: `${day}T12:00:00Z`,
    }),
    // 予定（授業）と同じ時間の記録
    task('class', { title: '授業', kind: 'event', scheduledDate: day, startTime: '13:00', endTime: '14:30' }),
    task('classLog', { title: '授業', kind: 'log', dueDate: day, startTime: '13:00', endTime: '14:30', completed: true }),
    // ▶ で始めて、止めたあとに題名を直した記録
    task('seminar', { title: 'ゼミ', scheduledDate: day, startTime: '15:00', endTime: '16:00' }),
    task('seminarLog', {
      title: '発表スライド',
      kind: 'log',
      dueDate: day,
      startTime: '15:00',
      endTime: '16:00',
      completed: true,
      sourceTaskId: 'seminar',
    }),
  ]

  it('✓ だけの To-Do と、題名を直した ▶ の記録は計画どおり。予定（授業）は分母に入れない', () => {
    const review = getWeekReview(tasks, [], at('20:00'), new Set(), at('20:00'))
    expect(review.timedPlanned).toBe(2)
    expect(review.followed).toBe(2)
  })

  it('日ごとの計画どおりの数（getDayReviews）は期間の合計と同じ。未来の日は数えない（#326）', () => {
    const days = getDayReviews(tasks, [], [at('00:00'), new Date('2026-10-04T00:00:00')], new Set(), at('20:00'))
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ dateKey: '2026-10-03', timedPlanned: 2, followed: 2 })
  })

  it('予定と同じ時間の記録は「予定に無かった記録」にならない', () => {
    const planned = tasks.map(scheduledTaskToPlannedItem).filter((p) => p != null)
    const logs = tasks.filter((t) => t.kind === 'log')
    const pairs = matchPlanAndActualForDate(planned, logs)
    expect(pairs.filter((p) => p.status === 'actual-only')).toEqual([])
    expect(pairs.find((p) => p.actual?.id === 'seminarLog')?.planned?.taskId).toBe('seminar')
  })

  it('日ごとの棒の予定の枠は、計画どおりと同じ To-Do（と習慣の枠）から。予定（授業）は入れない', () => {
    const review = getWeekReview(tasks, [], at('20:00'), new Set(), at('20:00'))
    expect(review.days.find((d) => d.dateKey === day)?.plannedMinutes).toBe(180 + 60)
  })
})

describe('foldLabelMinutes', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ tag: `l${i}`, minutes: 60 - i }))

  it('6 件までは全部出す', () => {
    expect(foldLabelMinutes(rows(6))).toEqual({ shown: rows(6), others: 0 })
  })

  it('7 件以上は上位 5 件と「その他」', () => {
    const { shown, others } = foldLabelMinutes(rows(8))
    expect(shown.map((x) => x.tag)).toEqual(['l0', 'l1', 'l2', 'l3', 'l4'])
    expect(others).toBe(55 + 54 + 53)
  })

  it('目安のある行（keep）は「その他」にまとめず、残りの枠を上位で埋める（#291）', () => {
    const { shown, others } = foldLabelMinutes(rows(8), (r) => r.tag === 'l7' || r.tag === 'l6')
    expect(shown.map((x) => x.tag)).toEqual(['l0', 'l1', 'l2', 'l6', 'l7'])
    expect(others).toBe(57 + 56 + 55)
  })
})

describe('loggedMinutesVsPrevWeek', () => {
  const log = (id: string, date: string, start: string, end: string) =>
    task(id, { kind: 'log', dueDate: date, startTime: start, endTime: end })
  // 今週（9/28〜）は土曜 10/03 まで。前の週は同じ土曜 9/26 までで比べる
  const tasks = [
    log('this', '2026-10-01', '10:00', '11:40'),
    log('prevTue', '2026-09-22', '10:00', '11:00'),
    log('prevSun', '2026-09-27', '10:00', '15:00'),
  ]

  it('前の週の同じ曜日までと比べる', () => {
    const now = at('20:00')
    const review = getWeekReview(tasks, [], now, new Set(), now)
    expect(review.loggedMinutes).toBe(100)
    expect(loggedMinutesVsPrevWeek(review.loggedMinutes, tasks, [], now, new Set(), now)).toBe(40)
  })

  it('過ぎた週どうしは丸ごと比べる', () => {
    const now = at('20:00')
    const anchor = new Date('2026-09-23T12:00:00')
    const review = getWeekReview(tasks, [], anchor, new Set(), now)
    expect(review.loggedMinutes).toBe(360)
    // 前の週（9/14〜）は記録なし
    expect(loggedMinutesVsPrevWeek(review.loggedMinutes, tasks, [], anchor, new Set(), now)).toBeNull()
    const next = new Date('2026-10-01T12:00:00')
    expect(loggedMinutesVsPrevWeek(0, tasks, [], next, new Set(), new Date('2026-10-10T12:00:00'))).toBe(-360)
  })

  it('前の週に記録が無ければ null', () => {
    const now = at('20:00')
    expect(loggedMinutesVsPrevWeek(100, [tasks[0]], [], now, new Set(), now)).toBeNull()
  })
})

describe('getReview: 月（#304）', () => {
  afterEach(() => setAppTimeZoneSetting(null))
  const log = (id: string, date: string, start: string, end: string, tag = '') =>
    task(id, { kind: 'log', dueDate: date, startTime: start, endTime: end, tags: tag ? [tag] : [] })

  it('暦の月の 1 日から今日までを数える。月をまたぐ記録は 0 時で分ける', () => {
    const now = at('20:00') // 10/3
    const tasks = [
      log('sep30', '2026-09-30', '10:00', '12:00'),
      // 9/30 23:00 → 10/1 1:00。10 月には 0 時からの 1 時間だけ
      log('overnight', '2026-09-30', '23:00', '01:00'),
      log('oct1', '2026-10-01', '10:00', '10:30'),
      log('oct3', '2026-10-03', '09:00', '10:00'),
    ]
    const review = getReview(tasks, [], 'month', now, new Set(), now)
    expect(review.days.map((d) => d.dateKey)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
    expect(review.loggedMinutes).toBe(60 + 30 + 60)
    const sep = getReview(tasks, [], 'month', new Date('2026-09-10T12:00:00'), new Set(), now)
    expect(sep.days).toHaveLength(30)
    expect(sep.loggedMinutes).toBe(120 + 60)
  })

  it('完了したタスクはアプリのタイムゾーンの完了日の月に入れる', () => {
    setAppTimeZoneSetting('Asia/Tokyo')
    const tasks = [
      task('a', { completed: true, completedAt: '2026-09-30T14:30:00Z' }), // 9/30 23:30 JST
      task('b', { completed: true, completedAt: '2026-09-30T15:30:00Z' }), // 10/1 0:30 JST
    ]
    const now = at('20:00')
    expect(getReview(tasks, [], 'month', now, new Set(), now).done).toBe(1)
    expect(getReview(tasks, [], 'month', new Date('2026-09-15T12:00:00'), new Set(), now).done).toBe(1)
  })

  it('前の月は同じ日までと比べ、ラベルごとの差も出す', () => {
    const now = at('20:00') // 10/3
    const tasks = [
      log('job', '2026-10-02', '10:00', '13:00', '就活'),
      log('work', '2026-10-02', '18:00', '19:00', 'バイト'),
      log('prevJob', '2026-09-02', '10:00', '11:00', '就活'),
      log('prevWork', '2026-09-03', '18:00', '20:00', 'バイト'),
      // 9/4 以降は今月の同じ日（3 日）より先なので比べない
      log('prevLate', '2026-09-20', '10:00', '15:00', '就活'),
    ]
    const review = getReview(tasks, [], 'month', now, new Set(), now)
    const prev = getPrevReview(tasks, [], 'month', now, new Set(), now)
    expect(prev.days.map((d) => d.dateKey)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
    const cmp = compareReviews(review, prev)
    expect(cmp.loggedDiff).toBe(240 - 180)
    expect(cmp.labelDiff.get('就活')).toBe(180 - 60)
    expect(cmp.labelDiff.get('バイト')).toBe(60 - 120)
  })

  it('過ぎた月どうしは丸ごと比べる。3 月末の前の月は 2 月まる 1 か月', () => {
    const tasks = [log('feb28', '2026-02-28', '10:00', '11:00'), log('mar31', '2026-03-31', '10:00', '12:00')]
    const mar31 = new Date('2026-03-31T20:00:00')
    const prev = getPrevReview(tasks, [], 'month', mar31, new Set(), mar31)
    expect(prev.days).toHaveLength(28)
    expect(prev.loggedMinutes).toBe(60)
    const cmp = compareReviews(getReview(tasks, [], 'month', mar31, new Set(), mar31), prev)
    expect(cmp.loggedDiff).toBe(60)
  })

  it('前の月に記録が無ければ差を出さない', () => {
    const now = at('20:00')
    const tasks = [log('oct', '2026-10-01', '10:00', '11:00', '就活')]
    const cmp = compareReviews(getReview(tasks, [], 'month', now, new Set(), now), getPrevReview(tasks, [], 'month', now, new Set(), now))
    expect(cmp).toEqual({ loggedDiff: null, labelDiff: new Map() })
  })

  it('週に◯回の習慣は、4 日以上がその月にある週で数える', () => {
    // 10/1 は木曜なので 9/28 の週は 10 月に入る。9/29・10/2 にやって週 2 回を満たした
    const h: Habit = {
      id: 'gym',
      title: 'gym',
      color: '#33B679',
      timeMode: 'none',
      startTime: null,
      endTime: null,
      frequency: { type: 'timesPerWeek', count: 2 },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      completedDates: ['2026-09-29', '2026-10-02'],
      archivedAt: null,
    }
    const now = at('20:00')
    expect(getReview([], [h], 'month', now, new Set(), now).habitRate).toBe(1)
    // 9 月には 9/28 の週を入れない（9/21 の週までの 4 週。やった日が無いので 0）
    expect(getReview([], [h], 'month', new Date('2026-09-15T12:00:00'), new Set(), now).habitRate).toBe(0)
  })
})

describe('getWeekReview: 記録なしの時間（#298）', () => {
  const log = (id: string, dueDate: string, startTime: string, endTime: string, over: Partial<Task> = {}) =>
    task(id, { kind: 'log', completed: true, dueDate, startTime, endTime, ...over })

  it('過ぎた日は記録の最初〜最後（睡眠があれば起きてから寝るまで）、今日は今までの 30 分以上の抜けを足す', () => {
    const tasks = [
      // 10/2（金）: 睡眠の記録が無いので記録の最初〜最後。10:00–12:00 が抜け
      log('a', '2026-10-02', '09:00', '10:00'),
      log('b', '2026-10-02', '12:00', '13:00'),
      // 10/3（土・今日）: 7:00 に起きて 8:00–9:00 だけ記録。今は 10:00 → 7:00–8:00 と 9:00–10:00
      log('s', '2026-10-03', '00:30', '07:00', { kind: 'sleep' }),
      log('c', '2026-10-03', '08:00', '09:00'),
    ]
    const review = getWeekReview(tasks, [], at('10:00'), new Set(), at('10:00'))
    expect(review.days.find((d) => d.dateKey === '2026-10-02')!.unrecordedMinutes).toBe(120)
    expect(review.days.find((d) => d.dateKey === '2026-10-03')!.unrecordedMinutes).toBe(120)
    expect(review.unrecordedMinutes).toBe(240)
  })

  it('月のふりかえりでも、月の日ごとの記録なしを足す（前の週の日も同じ月なら入る）', () => {
    const tasks = [
      // 9/30 は 9 月なので 10 月には入らない
      log('x', '2026-09-30', '09:00', '10:00'),
      log('y', '2026-09-30', '12:00', '13:00'),
      log('a', '2026-10-01', '09:00', '10:00'),
      log('b', '2026-10-01', '11:00', '12:00'),
      log('c', '2026-10-02', '09:00', '10:00'),
      log('d', '2026-10-02', '12:00', '13:00'),
    ]
    const review = getReview(tasks, [], 'month', at('10:00'), new Set(), at('10:00'))
    expect(review.unrecordedMinutes).toBe(60 + 120)
  })
})

describe('getReview: ラベルごとの予定と、予定に無かった記録（#275）', () => {
  const day = '2026-10-03'
  // ゼミ = sage（#33B679）、勉強 = peacock（#039BE5）。#7986CB には名前が無い
  const presets = ['ゼミ', '勉強']
  const colors = { ゼミ: 'sage', 勉強: 'peacock' }
  const labelOf = (log: LabelSource) => recordLabelKey(log, presets, colors)
  const log = (id: string, title: string, startTime: string, endTime: string, over: Partial<Task> = {}) =>
    task(id, { kind: 'log', completed: true, title, dueDate: day, startTime, endTime, ...over })
  const habit: Habit = {
    id: 'read',
    title: '読書',
    color: '#039BE5',
    timeMode: 'range',
    startTime: '21:00',
    endTime: '21:30',
    frequency: { type: 'daily' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    completedDates: [],
    archivedAt: null,
  }
  const tasks = [
    // 予定: ゼミの色の To-Do 2 時間（記録は 1 時間だけ）、名前の無い色の To-Do 1 時間、色なしの To-Do 30 分
    task('seminar', { title: 'ゼミ準備', color: '#33B679', scheduledDate: day, startTime: '09:00', endTime: '11:00' }),
    task('free', { title: '買い物', color: '#7986CB', scheduledDate: day, startTime: '11:00', endTime: '12:00' }),
    task('plain', { title: '片付け', scheduledDate: day, startTime: '12:00', endTime: '12:30' }),
    // 予定（授業）は予定した時間に入れないが、その時間の記録は「予定に無かった記録」にしない
    task('class', { title: '授業', kind: 'event', color: '#33B679', scheduledDate: day, startTime: '13:00', endTime: '14:30' }),
    log('seminarLog', 'ゼミ準備', '09:00', '10:00', { category: 'ゼミ', tags: ['ゼミ'], sourceTaskId: 'seminar' }),
    log('classLog', '授業', '13:00', '14:30', { category: 'ゼミ', tags: ['ゼミ'] }),
    // 予定に無かった記録: YouTube 2 回（ラベルなし）、ゲーム 1 回
    log('yt1', 'YouTube', '15:00', '16:00'),
    log('yt2', 'YouTube ', '17:00', '17:40'),
    log('game', 'ゲーム', '18:00', '18:30', { color: '#7986CB' }),
  ]

  it('予定のラベルはその予定から作る記録と同じ（色 → その色のラベル → 名前の無い色 → ラベルなし）。習慣の枠も入り、授業は入れない', () => {
    const review = getReview(tasks, [habit], 'week', at('23:00'), new Set(), at('23:00'), labelOf)
    // 習慣の枠（勉強の色）は 9/28（月）〜10/3（土）の 6 日
    expect(review.labelPlans).toEqual([
      { tag: '勉強', minutes: 180, endedMinutes: 180 },
      { tag: 'ゼミ', minutes: 120, endedMinutes: 120 },
      { tag: '#7986CB', minutes: 60, endedMinutes: 60 },
      { tag: '', minutes: 30, endedMinutes: 30 },
    ])
    // 棒の予定の枠・ラベル別の予定は同じ予定の集まり
    expect(review.labelPlans.reduce((a, p) => a + p.minutes, 0)).toBe(review.plannedMinutes)
  })

  it('予定に無かった記録をラベルと題名でまとめて多い順に。予定と組になった記録・授業の時間の記録は入れない', () => {
    const review = getReview(tasks, [habit], 'week', at('23:00'), new Set(), at('23:00'), labelOf)
    expect(review.unplanned).toEqual([
      { tag: '', title: 'YouTube', minutes: 100 },
      { tag: '#7986CB', title: 'ゲーム', minutes: 30 },
    ])
    expect(review.unplannedMinutes).toBe(130)
    expect(review.days.find((d) => d.dateKey === day)!.unplannedMinutes).toBe(130)
  })

  it('今日のこれからの予定は予定した時間に入れ、時間の過ぎた予定（endedMinutes）には入れない', () => {
    const review = getReview(tasks, [habit], 'week', at('11:30'), new Set(), at('11:30'), labelOf)
    expect(review.labelPlans.find((p) => p.tag === 'ゼミ')).toEqual({ tag: 'ゼミ', minutes: 120, endedMinutes: 120 })
    expect(review.labelPlans.find((p) => p.tag === '#7986CB')).toEqual({ tag: '#7986CB', minutes: 60, endedMinutes: 0 })
    // 今日の 21:00 の習慣の枠はまだ
    expect(review.labelPlans.find((p) => p.tag === '勉強')).toEqual({ tag: '勉強', minutes: 180, endedMinutes: 150 })
  })

  it('月でも同じに数える', () => {
    const review = getReview(tasks, [habit], 'month', at('23:00'), new Set(), at('23:00'), labelOf)
    expect(review.labelPlans.find((p) => p.tag === 'ゼミ')?.minutes).toBe(120)
    // 習慣の枠は 10/1〜10/3 の 3 日
    expect(review.labelPlans.find((p) => p.tag === '勉強')?.minutes).toBe(90)
    expect(review.unplanned[0]).toEqual({ tag: '', title: 'YouTube', minutes: 100 })
  })
})

describe('getPlanDriftCells: ずれやすい曜日・時間帯（#275、計算だけ）', () => {
  const plan = (id: string, date: string, startTime: string, endTime: string) =>
    task(id, { title: id, scheduledDate: date, startTime, endTime })
  const log = (id: string, title: string, date: string, startTime: string, endTime: string) =>
    task(id, { kind: 'log', completed: true, title, dueDate: date, startTime, endTime })

  it('最初の記録から 28 日たつまでは null', () => {
    const tasks = [log('l', 'x', '2026-09-20', '09:00', '10:00')]
    expect(getPlanDriftCells(tasks, [], new Set(), at('12:00'))).toBeNull()
  })

  it('昨日までの 28 日の予定を曜日 × 時間帯で数える（ずれた・記録なし）', () => {
    const tasks = [
      log('old', 'x', '2026-08-01', '09:00', '10:00'),
      // 10/2（金）朝: 30 分遅れて記録。午後: 記録なし。10/1（木）夜: 予定どおり
      plan('朝ラン', '2026-10-02', '07:00', '07:30'),
      log('run', '朝ラン', '2026-10-02', '07:30', '08:00'),
      plan('レポート', '2026-10-02', '14:00', '15:00'),
      plan('復習', '2026-10-01', '20:00', '21:00'),
      log('rev', '復習', '2026-10-01', '20:00', '21:00'),
      // 今日の予定は数えない
      plan('今日', '2026-10-03', '07:00', '08:00'),
    ]
    expect(getPlanDriftCells(tasks, [], new Set(), at('12:00'))).toEqual([
      { weekday: 3, slot: 'evening', plans: 1, drifted: 0, driftMinutes: 0, missed: 0 },
      { weekday: 4, slot: 'morning', plans: 1, drifted: 1, driftMinutes: 30, missed: 0 },
      { weekday: 4, slot: 'afternoon', plans: 1, drifted: 0, driftMinutes: 0, missed: 1 },
    ])
  })
})

describe('recentDailyLoggedMinutes（#275）', () => {
  const log = (id: string, date: string, startTime: string, endTime: string) =>
    task(id, { kind: 'log', completed: true, dueDate: date, startTime, endTime })

  it('直近 2 週（昨日まで）の、記録のある日の平均。今日と 15 日前は入れない', () => {
    const tasks = [
      log('a', '2026-10-02', '09:00', '12:00'),
      log('b', '2026-09-25', '09:00', '10:00'),
      log('today', '2026-10-03', '09:00', '11:00'),
      log('old', '2026-09-18', '09:00', '18:00'),
    ]
    expect(recentDailyLoggedMinutes(tasks, [], new Set(), at('12:00'))).toEqual({ average: 120, days: 2 })
  })

  it('記録が無ければ null', () => {
    expect(recentDailyLoggedMinutes([], [], new Set(), at('12:00'))).toBeNull()
  })
})
