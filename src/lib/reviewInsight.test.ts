import { describe, expect, it } from 'vitest'
import i18next, { type TFunction } from 'i18next'
import ja from '../locales/ja'
import en from '../locales/en'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import {
  compareReviews,
  getPrevReview,
  getReview,
  pickReviewInsight,
  reviewInsightText,
  type ReviewInsight,
  type WeekReview,
  type WeekReviewDay,
} from './weekReview'
import type { ReviewPeriod } from './reviewPeriod'

// 週のふりかえりの一言（#276）。数字から 1 つ選び（pickReviewInsight）、ja / en の文にする（reviewInsightText）

const i18n = i18next.createInstance()
void i18n.init({ resources: { ja: { translation: ja }, en: { translation: en } }, lng: 'ja', interpolation: { escapeValue: false } })
const tOf = (lng: 'ja' | 'en') => i18n.getFixedT(lng) as TFunction

/** 時間の書き方（画面の formatDuration と同じ形を言語ごとに） */
const durationOf = (lng: 'ja' | 'en') => (m: number) => {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (lng === 'ja') return h === 0 ? `${min}分` : min === 0 ? `${h}時間` : `${h}時間${min}分`
  return h === 0 ? `${min}m` : min === 0 ? `${h}h` : `${h}h ${min}m`
}

const text = (insight: ReviewInsight, lng: 'ja' | 'en' = 'ja', period: ReviewPeriod = 'week', current = true) =>
  reviewInsightText(insight, {
    t: tOf(lng),
    period,
    current,
    duration: durationOf(lng),
    label: (tag) => tag || (lng === 'ja' ? 'ラベルなし' : 'No label'),
    day: (key) => (lng === 'ja' ? `${key.slice(5)}（水）` : `Wed, ${key.slice(5)}`),
  })

const day = (dateKey: string, over: Partial<WeekReviewDay> = {}): WeekReviewDay => ({
  dateKey,
  plannedMinutes: 0,
  loggedMinutes: 0,
  unrecordedMinutes: 0,
  done: 0,
  total: 0,
  tagMinutes: [],
  timedPlanned: 0,
  followed: 0,
  unplannedMinutes: 0,
  ...over,
})

const review = (over: Partial<WeekReview> = {}): WeekReview => ({
  days: [],
  plannedMinutes: 0,
  loggedMinutes: 0,
  unrecordedMinutes: 0,
  done: 0,
  total: 0,
  followRate: null,
  timedPlanned: 0,
  followed: 0,
  habitRate: null,
  labelMinutes: [],
  labelPlans: [],
  unplanned: [],
  unplannedMinutes: 0,
  ...over,
})

const TODAY = '2026-10-08'
const pick = (r: WeekReview, loggedDiff: number | null = null, everRecorded = true) =>
  pickReviewInsight(r, { loggedDiff, everRecorded, todayKey: TODAY })

describe('pickReviewInsight: いちばん大きいずれ 1 つを名指しする', () => {
  // ゼミは予定 6 時間に記録 3 時間（差 3 時間）、予定に無かった YouTube 4 時間 10 分
  const busy = review({
    plannedMinutes: 600,
    loggedMinutes: 900,
    timedPlanned: 8,
    followed: 5,
    labelMinutes: [
      { tag: '', minutes: 400 },
      { tag: 'ゼミ', minutes: 180 },
    ],
    labelPlans: [{ tag: 'ゼミ', minutes: 360, endedMinutes: 360 }],
    unplanned: [
      { tag: '', title: 'YouTube', minutes: 250 },
      { tag: '', title: '昼ごはん', minutes: 90 },
    ],
  })

  it('予定に無かった記録がラベルの差より長ければ、そちらを出す', () => {
    const insight = pick(busy)
    expect(insight).toEqual({ kind: 'unplanned', tag: '', title: 'YouTube', minutes: 250 })
    expect(text(insight)).toBe('予定に無かった記録では「YouTube」がいちばん長く、4時間10分でした。')
    expect(text(insight, 'en')).toBe('The longest record not in the plan was “YouTube”: 4h 10m.')
  })

  it('ラベルの予定と記録の差がいちばん大きければ、ラベル名と両方の時間を出す（矢印は使わない）', () => {
    const insight = pick({ ...busy, unplanned: [{ tag: '', title: 'YouTube', minutes: 100 }] })
    expect(insight).toEqual({ kind: 'labelGap', tag: 'ゼミ', planned: 360, logged: 180 })
    expect(text(insight)).toBe('ゼミは予定 6時間、記録 3時間でした。')
    expect(text(insight, 'en')).toBe('ゼミ: planned 6h, logged 3h.')
  })

  it('予定より多く記録したラベルも同じ言い方（多い・少ないで言葉を変えない）', () => {
    const r = review({
      plannedMinutes: 60,
      labelMinutes: [{ tag: '就活', minutes: 300 }],
      labelPlans: [{ tag: '就活', minutes: 120, endedMinutes: 120 }],
    })
    expect(text(pick(r))).toBe('就活は予定 2時間、記録 5時間でした。')
  })

  it('今日のこれからの予定（時間の過ぎていない分）では差を言わない', () => {
    const r = review({
      plannedMinutes: 360,
      labelMinutes: [{ tag: 'ゼミ', minutes: 60 }],
      labelPlans: [{ tag: 'ゼミ', minutes: 360, endedMinutes: 90 }],
    })
    expect(pick(r).kind).not.toBe('labelGap')
  })

  it('過ぎた日に時間を決めた予定が 3 件以上あって、どれも記録が無ければその日を出す', () => {
    const r = review({
      plannedMinutes: 300,
      timedPlanned: 5,
      followed: 2,
      days: [
        day('2026-10-06', { timedPlanned: 2, followed: 2, plannedMinutes: 120 }),
        day('2026-10-07', { timedPlanned: 3, followed: 0, plannedMinutes: 180 }),
      ],
    })
    const insight = pick(r)
    expect(insight).toEqual({ kind: 'missedDay', dateKey: '2026-10-07', count: 3 })
    expect(text(insight)).toBe('10-07（水）は、時間を決めた予定 3 件のどれにも記録がありませんでした。')
    expect(text(insight, 'en')).toBe('On Wed, 10-07, none of the 3 time-blocked plans had a record.')
  })

  it('今日と、予定が 2 件以下の日は「記録が無かった日」にしない', () => {
    const r = review({
      timedPlanned: 5,
      days: [day('2026-10-07', { timedPlanned: 2, plannedMinutes: 300 }), day(TODAY, { timedPlanned: 3, plannedMinutes: 300 })],
    })
    expect(pick(r).kind).toBe('follow')
  })

  it('前の期間より記録が増えた・減ったを、週・月と今・過ぎた期間で呼び分ける', () => {
    const r = review({ loggedMinutes: 600, labelMinutes: [{ tag: '勉強', minutes: 600 }] })
    const more = pick(r, 180)
    expect(more).toEqual({ kind: 'loggedDiff', diff: 180 })
    expect(text(more)).toBe('先週より記録が 3時間 増えました。')
    expect(text(more, 'ja', 'week', false)).toBe('前の週より記録が 3時間 増えました。')
    expect(text(more, 'ja', 'month')).toBe('先月より記録が 3時間 増えました。')
    expect(text(more, 'en')).toBe('3h more logged than last week.')
    expect(text(pick(r, -180), 'en', 'month', false)).toBe('3h less logged than the previous month.')
  })

  it('小さな差（1 時間未満・前の期間の 2 割未満）は名指ししない', () => {
    const r = review({ loggedMinutes: 3000, labelMinutes: [{ tag: '勉強', minutes: 3000 }] })
    expect(pick(r, 45).kind).toBe('loggedTop')
    expect(pick(r, 300).kind).toBe('loggedTop')
  })

  it('同じ大きさなら決まった順（記録が無かった日 → ラベル → 予定に無かった記録 → 前の期間との差）。同じ数字なら同じ一言', () => {
    const r = review({
      plannedMinutes: 120,
      loggedMinutes: 240,
      labelMinutes: [{ tag: 'B', minutes: 240 }],
      labelPlans: [
        { tag: 'B', minutes: 120, endedMinutes: 120 },
        { tag: 'A', minutes: 120, endedMinutes: 120 },
      ],
      unplanned: [{ tag: '', title: 'x', minutes: 120 }],
    })
    expect(pick(r, 120)).toEqual({ kind: 'labelGap', tag: 'A', planned: 120, logged: 0 })
    expect(text(pick(r, 120))).toBe(text(pick(structuredClone(r), 120)))
  })
})

describe('pickReviewInsight: 名指しする差が無いとき（言い切らない）', () => {
  it('時間を決めた予定が 3 件以上なら、件数で予定どおりを出す', () => {
    const insight = pick(review({ timedPlanned: 4, followed: 1, followRate: 0.25 }))
    expect(text(insight)).toBe('時間を決めた予定 4 件のうち、1 件を予定どおりに行いました。')
    expect(text(insight, 'en')).toBe('1 of 4 time-blocked plans went as planned.')
  })

  it('予定が 2 件以下の週は割合の文を出さず、記録の合計といちばん長いラベル', () => {
    const insight = pick(
      review({ timedPlanned: 2, followed: 0, followRate: 0, loggedMinutes: 200, labelMinutes: [{ tag: '課題', minutes: 120 }] }),
    )
    expect(insight.kind).toBe('loggedTop')
    expect(text(insight)).toBe('記録は合計 3時間20分。いちばん長いのは課題の 2時間でした。')
    expect(text(insight, 'en')).toBe('3h 20m logged in total; the most was 課題 at 2h.')
  })

  it('記録が無ければ To-Do の数だけ（終えた / まだ）', () => {
    expect(text(pick(review({ done: 3, total: 5 })))).toBe('To-Do を 3 件終えました。時間の記録はまだありません。')
    expect(text(pick(review({ done: 1, total: 1 })), 'en')).toBe('1 to-do done; no time logged yet.')
    expect(text(pick(review({ total: 2 })))).toBe('To-Do は 2 件あり、完了と時間の記録はまだありません。')
  })

  it('何も無い期間: 記録したことのある人には事実だけ、一度も記録していない人にははじめの案内', () => {
    expect(text(pick(review()))).toBe('この週はまだ記録も予定もありません。')
    expect(text(pick(review()), 'en', 'month')).toBe('Nothing logged or planned this month yet.')
    expect(pick(review(), null, false)).toEqual({ kind: 'firstTime' })
    expect(text({ kind: 'firstTime' }, 'ja', 'month')).toBe(ja.weekReview.insightEmptyMonth)
  })

  it('一言に提案の言い方（〜すると・減らす）を使わない', () => {
    const all = [...Object.entries(ja.weekReview), ...Object.entries(en.weekReview)].filter(
      ([k]) => k.startsWith('insight') && !k.startsWith('insightEmpty'),
    )
    for (const [, v] of all) expect(String(v)).not.toMatch(/すると|減らす|しましょう|try|should/i)
  })
})

describe('getReview → pickReviewInsight（数字から一言まで）', () => {
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
  const now = new Date('2026-10-08T20:00:00')
  // 10/7（水）に時間を決めた予定 3 件（計 3 時間）、どれも記録なし。10/6 に予定に無かった記録 1 時間
  const tasks = [
    task('a', { scheduledDate: '2026-10-07', startTime: '09:00', endTime: '10:00' }),
    task('b', { scheduledDate: '2026-10-07', startTime: '13:00', endTime: '14:00' }),
    task('c', { scheduledDate: '2026-10-07', startTime: '16:00', endTime: '17:00' }),
    task('yt', { kind: 'log', completed: true, title: 'YouTube', dueDate: '2026-10-06', startTime: '20:00', endTime: '21:00' }),
  ]

  it('週: 記録の無かった水曜を出す。月: 同じ数字から同じ一言', () => {
    const week = getReview(tasks, [], 'week', now, new Set(), now)
    const weekDiff = compareReviews(week, getPrevReview(tasks, [], 'week', now, new Set(), now)).loggedDiff
    const insight = pickReviewInsight(week, { loggedDiff: weekDiff, everRecorded: true, todayKey: '2026-10-08' })
    expect(insight).toEqual({ kind: 'missedDay', dateKey: '2026-10-07', count: 3 })

    const month = getReview(tasks, [], 'month', now, new Set(), now)
    expect(pickReviewInsight(month, { loggedDiff: null, everRecorded: true, todayKey: '2026-10-08' })).toEqual(insight)
  })
})
