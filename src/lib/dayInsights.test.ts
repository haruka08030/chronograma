import { describe, expect, it } from 'vitest'
import { computeDayInsights, insightDateKeys } from './dayInsights'
import type { SleepNight } from './sleep'
import type { WeekReviewDay } from './weekReview'
import type { DayMoods, Mood } from './dayMood'

const key = (i: number) => `2026-09-${String(i + 1).padStart(2, '0')}`

/** 日ごとの数字（記録した時間・ラベル別・計画どおり） */
const day = (i: number, over: Partial<WeekReviewDay> = {}): WeekReviewDay => ({
  dateKey: key(i),
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

/** 起きた日 → 睡眠（寝た時刻は前日 12:00 からの分） */
const night = (i: number, bedOffset: number, minutes: number): [string, SleepNight] => [
  key(i),
  { dateKey: key(i), bed: '', wake: '', minutes, bedOffset, wakeOffset: bedOffset + minutes },
]

const H = 60
/** 23:00 / 1:00 に寝た（前日 12:00 からの分） */
const BED_23 = 11 * H
const BED_01 = 13 * H

const moods = (entries: [number, Mood][]): DayMoods =>
  Object.fromEntries(entries.map(([i, mood]) => [key(i), { mood, note: '', updatedAt: '2026-09-01T00:00:00Z', syncedAt: null }]))

describe('insightDateKeys', () => {
  it('昨日までの 28 日（今日は入れない）', () => {
    const keys = insightDateKeys('2026-10-08')
    expect(keys).toHaveLength(28)
    expect(keys[0]).toBe('2026-09-10')
    expect(keys[27]).toBe('2026-10-07')
  })
})

describe('computeDayInsights', () => {
  it('睡眠の長さで分け、記録した時間の差を出す（6〜7 時間の日はどちらにも入れない）', () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => day(i, { loggedMinutes: i < 3 ? 120 : i === 6 ? 999 : 240 }))
    const nights = new Map([
      night(0, BED_23, 5 * H),
      night(1, BED_23, 5.5 * H),
      night(2, BED_23, 5 * H),
      night(3, BED_23, 8 * H),
      night(4, BED_23, 7 * H),
      night(5, BED_23, 7.5 * H),
      night(6, BED_23, 6.5 * H), // 間の日
    ])
    const rows = computeDayInsights(days, nights, {})
    expect(rows).toEqual([{ condition: 'sleepLength', metric: { kind: 'logged' }, a: { days: 3, value: 120 }, b: { days: 3, value: 240 } }])
  })

  it('片側が 3 日未満の比較は出さない', () => {
    const days = [0, 1, 2, 3, 4].map((i) => day(i, { loggedMinutes: i < 2 ? 60 : 300 }))
    const nights = new Map([
      night(0, BED_23, 5 * H),
      night(1, BED_23, 5 * H),
      night(2, BED_23, 8 * H),
      night(3, BED_23, 8 * H),
      night(4, BED_23, 8 * H),
    ])
    expect(computeDayInsights(days, nights, {})).toEqual([])
  })

  it('記録の無い日は数えない（0 分の日にしない）ので、記録のある日が片側 3 日に届かなければ出さない', () => {
    const days = [0, 1, 2, 3, 4, 5].map((i) => day(i, { loggedMinutes: i === 0 ? 0 : i < 3 ? 60 : 300 }))
    const nights = new Map([0, 1, 2, 3, 4, 5].map((i) => night(i, BED_23, i < 3 ? 5 * H : 8 * H)))
    expect(computeDayInsights(days, nights, {})).toEqual([])
  })

  it('差が 2 割未満・15 分未満なら出さない', () => {
    const nights = new Map([0, 1, 2, 3, 4, 5].map((i) => night(i, BED_23, i < 3 ? 5 * H : 8 * H)))
    // 200 分 / 230 分: 差は 13%
    const small = [0, 1, 2, 3, 4, 5].map((i) => day(i, { loggedMinutes: i < 3 ? 200 : 230 }))
    expect(computeDayInsights(small, nights, {})).toEqual([])
    // 20 分 / 30 分: 割合は 33% だが 10 分しか違わない
    const tiny = [0, 1, 2, 3, 4, 5].map((i) => day(i, { loggedMinutes: i < 3 ? 20 : 30 }))
    expect(computeDayInsights(tiny, nights, {})).toEqual([])
  })

  it('寝た時刻で分け、予定どおり（#284 と同じ数）の差を出す。夜はその朝に起きた日の分', () => {
    // 記録した時間は同じ。予定どおりだけ違う
    const days = [0, 1, 2, 3, 4, 5].map((i) =>
      day(i, { loggedMinutes: 180, timedPlanned: 5, followed: i < 3 ? 2 : 4, tagMinutes: [{ tag: '勉強', minutes: 180 }] }),
    )
    const nights = new Map([0, 1, 2, 3, 4, 5].map((i) => night(i, i < 3 ? BED_01 : BED_23, 7.5 * H)))
    const rows = computeDayInsights(days, nights, {})
    expect(rows).toEqual([{ condition: 'bedtime', metric: { kind: 'follow' }, a: { days: 3, value: 0.4 }, b: { days: 3, value: 0.8 } }])
  })

  it('記録した時間で差が出せれば、予定どおりの差のほうが大きくても記録した時間を出す（記録が主役）', () => {
    const days = [0, 1, 2, 3, 4, 5].map((i) => day(i, { loggedMinutes: i < 3 ? 120 : 240, timedPlanned: 4, followed: i < 3 ? 0 : 4 }))
    const nights = new Map([0, 1, 2, 3, 4, 5].map((i) => night(i, BED_23, i < 3 ? 5 * H : 8 * H)))
    expect(computeDayInsights(days, nights, {}).map((r) => r.metric)).toEqual([{ kind: 'logged' }])
  })

  it('0:00 ちょうどに寝た日は「0 時までに寝た日」', () => {
    const days = [0, 1, 2, 3, 4, 5].map((i) => day(i, { loggedMinutes: i < 3 ? 60 : 240 }))
    const nights = new Map([
      night(0, BED_01, 7.5 * H),
      night(1, BED_01, 7.5 * H),
      night(2, 12 * H, 7.5 * H), // 0:00
      night(3, BED_23, 7.5 * H),
      night(4, BED_23, 7.5 * H),
      night(5, BED_23, 7.5 * H),
    ])
    expect(computeDayInsights(days, nights, {})).toEqual([])
  })

  it('気分で分ける（◑ の日は入れない）。日全体で差が無ければ、3 日以上に出てくるラベルでいちばん差の大きいもの', () => {
    const tag = (gym: number, study: number, rare = 0) =>
      [
        { tag: 'ジム', minutes: gym },
        { tag: '勉強', minutes: study },
        { tag: '散歩', minutes: rare },
      ].filter((x) => x.minutes > 0)
    const days = [
      day(0, { loggedMinutes: 200, tagMinutes: tag(60, 140) }),
      day(1, { loggedMinutes: 200, tagMinutes: tag(40, 160) }),
      day(2, { loggedMinutes: 200, tagMinutes: tag(50, 150) }),
      day(3, { loggedMinutes: 200, tagMinutes: tag(10, 190) }),
      day(4, { loggedMinutes: 200, tagMinutes: tag(0, 200) }),
      // 2 日だけの「散歩」は差が大きくても選ばない
      day(5, { loggedMinutes: 200, tagMinutes: tag(20, 80, 100) }),
      day(6, { loggedMinutes: 200, tagMinutes: tag(0, 100, 100) }),
    ]
    const rows = computeDayInsights(
      days,
      new Map(),
      moods([
        [0, 5],
        [1, 4],
        [2, 4],
        [3, 2],
        [4, 1],
        [5, 2],
        [6, 3],
      ]),
    )
    expect(rows).toEqual([
      { condition: 'mood', metric: { kind: 'label', tag: 'ジム' }, a: { days: 3, value: 50 }, b: { days: 3, value: 10 } },
    ])
  })

  it('3 つの分け方を 1 行ずつ、睡眠の長さ → 寝た時刻 → 気分の順に出す', () => {
    // 0〜2: 短い・遅い・気分 ●、3〜5: 長い・早い・気分 ○
    const days = [0, 1, 2, 3, 4, 5].map((i) => day(i, { loggedMinutes: i < 3 ? 100 : 300 }))
    const nights = new Map([0, 1, 2, 3, 4, 5].map((i) => (i < 3 ? night(i, BED_01, 5 * H) : night(i, BED_23, 8 * H))))
    const rows = computeDayInsights(days, nights, moods([0, 1, 2, 3, 4, 5].map((i) => [i, i < 3 ? 5 : 1] as [number, Mood])))
    expect(rows.map((r) => r.condition)).toEqual(['sleepLength', 'bedtime', 'mood'])
  })
})
