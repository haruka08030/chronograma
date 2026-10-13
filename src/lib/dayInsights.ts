/**
 * 日の違い（#326）。睡眠の長さ・寝た時刻・気分で日を 2 つに分け、その日の記録した時間や予定どおりの差を出す。
 *
 * - 期間は直近 28 日（昨日まで）。今日は記録も予定もまだ途中なので入れない
 * - 夜は「起きた日」の分として数える（統計の睡眠カード・今日の計画の睡眠の行と同じ、`summarizeSleep`）。
 *   その日の朝までの睡眠が、その日の記録と並ぶ
 * - 両側に 3 日以上ある比較だけ出す（1〜2 日の差は偶然のほうが大きい）。差が 2 割未満・ごく小さいものも出さない
 * - 1 つの分け方につき 1 行（最大 3 行）。記録した時間 → 予定どおりの順に、先に出せたものを使う（記録が主役）。
 *   どちらも出せなければラベル別の時間でいちばん差の大きいもの
 * - 「〜しましょう」とは言わない。数字の差だけ（原因とは言わない）
 */
import { addDays } from 'date-fns'
import type { DayMoods } from './dayMood'
import type { SleepNight } from './sleep'
import type { WeekReviewDay } from './weekReview'
import { fromDateKey, toDateKey } from './dateKey'

/** 比べる期間（日） */
export const INSIGHT_DAYS = 28
/** 片側にこれだけの日が無い比較は出さない */
export const MIN_SIDE_DAYS = 3
/** 差がこれ未満（大きいほうに対する割合）なら出さない */
export const MIN_RELATIVE_DIFF = 0.2
/** 時間の差がこれ未満（分）なら出さない（「5分 / 3分」のような差は読む意味が無い） */
export const MIN_MINUTES_DIFF = 15
/** 予定どおりの差がこれ未満（割合の差）なら出さない */
export const MIN_RATE_DIFF = 0.1

/** 短く寝た日（未満）と、よく寝た日（以上）の境目（分）。間の日はどちらにも入れない */
export const SHORT_SLEEP_MINUTES = 6 * 60
export const LONG_SLEEP_MINUTES = 7 * 60
/** 遅く寝た日: 0:00 より後に寝た（前日 12:00 からの分。0:00 → 720） */
export const LATE_BED_OFFSET = 12 * 60

export type InsightCondition = 'sleepLength' | 'bedtime' | 'mood'

export type InsightMetric =
  /** 記録した時間（1 日平均。記録のある日だけ） */
  | { kind: 'logged' }
  /** 予定どおり（時間を決めた予定のうち実行できた割合、#284 と同じ数え方） */
  | { kind: 'follow' }
  /** ラベル別の時間（1 日平均。記録のある日だけ、その日に無ければ 0 分） */
  | { kind: 'label'; tag: string }

export interface InsightSide {
  /** 数えた日数 */
  days: number
  /** 分（logged / label）か 0〜1 の割合（follow） */
  value: number
}

export interface DayInsight {
  condition: InsightCondition
  metric: InsightMetric
  /** 短く寝た日 / 遅く寝た日 / 気分の良い日 */
  a: InsightSide
  /** よく寝た日 / それ以外 / 気分の悪い日 */
  b: InsightSide
}

/** 比べる日（古い順）: 昨日までの `INSIGHT_DAYS` 日 */
export function insightDateKeys(todayKey: string, days = INSIGHT_DAYS): string[] {
  const today = fromDateKey(todayKey)
  return Array.from({ length: days }, (_, i) => toDateKey(addDays(today, i - days)))
}

type Side = 'a' | 'b' | null

/** 分け方ごとに、その日がどちら側か（どちらでもなければ null） */
const SPLITS: { condition: InsightCondition; side: (dateKey: string, nights: ReadonlyMap<string, SleepNight>, moods: DayMoods) => Side }[] =
  [
    {
      condition: 'sleepLength',
      side: (key, nights) => {
        const n = nights.get(key)
        if (!n) return null
        if (n.minutes < SHORT_SLEEP_MINUTES) return 'a'
        if (n.minutes >= LONG_SLEEP_MINUTES) return 'b'
        return null
      },
    },
    {
      condition: 'bedtime',
      side: (key, nights) => {
        const n = nights.get(key)
        if (!n) return null
        return n.bedOffset > LATE_BED_OFFSET ? 'a' : 'b'
      },
    },
    {
      condition: 'mood',
      side: (key, _nights, moods) => {
        const m = moods[key]?.mood
        if (m == null || m === 3) return null
        return m >= 4 ? 'a' : 'b'
      },
    },
  ]

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const tagMinutesOf = (d: WeekReviewDay, tag: string) => d.tagMinutes.find((x) => x.tag === tag)?.minutes ?? 0

/** 1 つの数字で両側を比べる。出せなければ null（日が足りない・差が小さい） */
function compare(
  metric: InsightMetric,
  a: readonly WeekReviewDay[],
  b: readonly WeekReviewDay[],
): { a: InsightSide; b: InsightSide } | null {
  let sa: InsightSide
  let sb: InsightSide
  if (metric.kind === 'follow') {
    const side = (ds: readonly WeekReviewDay[]): InsightSide => {
      const counted = ds.filter((d) => d.timedPlanned > 0)
      const planned = counted.reduce((s, d) => s + d.timedPlanned, 0)
      const followed = counted.reduce((s, d) => s + d.followed, 0)
      return { days: counted.length, value: planned > 0 ? followed / planned : 0 }
    }
    sa = side(a)
    sb = side(b)
  } else {
    const minutes = (d: WeekReviewDay) => (metric.kind === 'logged' ? d.loggedMinutes : tagMinutesOf(d, metric.tag))
    // 記録の無い日は「0 分の日」ではなく「記録していない日」なので数えない
    const side = (ds: readonly WeekReviewDay[]): InsightSide => {
      const counted = ds.filter((d) => d.loggedMinutes > 0)
      return { days: counted.length, value: counted.length > 0 ? Math.round(mean(counted.map(minutes))) : 0 }
    }
    sa = side(a)
    sb = side(b)
  }
  if (sa.days < MIN_SIDE_DAYS || sb.days < MIN_SIDE_DAYS) return null
  const diff = Math.abs(sa.value - sb.value)
  const max = Math.max(sa.value, sb.value)
  if (max === 0 || diff / max < MIN_RELATIVE_DIFF) return null
  if (diff < (metric.kind === 'follow' ? MIN_RATE_DIFF : MIN_MINUTES_DIFF)) return null
  return { a: sa, b: sb }
}

const relative = (x: { a: InsightSide; b: InsightSide }) => Math.abs(x.a.value - x.b.value) / Math.max(x.a.value, x.b.value)

/**
 * 日の違いの行（最大 3 行、睡眠の長さ → 寝た時刻 → 気分の順）。出せる比較が無ければ空。
 * `days` は日ごとの振り返りの数字（`getDayReviews`）、`nights` は起きた日 → その朝までの睡眠
 */
export function computeDayInsights(days: readonly WeekReviewDay[], nights: ReadonlyMap<string, SleepNight>, moods: DayMoods): DayInsight[] {
  const out: DayInsight[] = []
  for (const split of SPLITS) {
    const a: WeekReviewDay[] = []
    const b: WeekReviewDay[] = []
    for (const d of days) {
      const side = split.side(d.dateKey, nights, moods)
      if (side === 'a') a.push(d)
      else if (side === 'b') b.push(d)
    }
    if (a.length < MIN_SIDE_DAYS || b.length < MIN_SIDE_DAYS) continue

    // 記録した時間を先に（記録が主役）、出せなければ予定どおり、それも出せなければラベル別
    let best: { metric: InsightMetric; result: { a: InsightSide; b: InsightSide } } | null = null
    for (const kind of ['logged', 'follow'] as const) {
      const result = compare({ kind }, a, b)
      if (result) {
        best = { metric: { kind }, result }
        break
      }
    }
    if (!best) {
      // ラベル別: 比べる日のうち 3 日以上に出てくるラベル（タグ無しは除く。1〜2 日だけの記録で差を作らない）。
      // いちばん差の大きいもの、同じなら名前順
      const seen = new Map<string, number>()
      for (const d of [...a, ...b]) {
        for (const x of d.tagMinutes) if (x.tag !== '' && x.minutes > 0) seen.set(x.tag, (seen.get(x.tag) ?? 0) + 1)
      }
      const tags = [...seen]
        .filter(([, n]) => n >= MIN_SIDE_DAYS)
        .map(([tag]) => tag)
        .sort()
      for (const tag of tags) {
        const metric: InsightMetric = { kind: 'label', tag }
        const result = compare(metric, a, b)
        if (result && (!best || relative(result) > relative(best.result))) best = { metric, result }
      }
    }
    if (best) out.push({ condition: split.condition, metric: best.metric, ...best.result })
  }
  return out
}
