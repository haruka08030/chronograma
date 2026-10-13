import { isLogTask, isSleepTask, type Task } from '../types/task'
import { isHabitActive, type Habit } from '../types/habit'
import type { PlannedItem } from '../types/plannedItem'
import { getDayPlan } from './dayPlan'
import { habitToPlannedItem } from './habitSlots'
import { buildHabitRecordIndex, habitDayStatus, type HabitRecordIndex } from './habitTiming'
import { isHabitCountedOnDate, timesPerWeekTally } from './habitStats'
import { matchPlanAndActualForDate, type MatchedPair } from './matchEvents'
import { scheduledTaskToPlannedItem } from './plannedItemUtils'
import { isActiveTask } from './taskLifecycle'
import { logOverlapsDateKey, minutesOfLogOnCalendarDay, taskPlacementDate } from './taskTimeRange'
import { zonedNow } from './timeZone'
import { addDays } from 'date-fns'
import type { TFunction } from 'i18next'
import { fromDateKey, toDateKey } from './dateKey'
import { clockOf } from './clockTime'
import { timeToMinutes } from './timeGrid'
import { monthHabitWeekStarts, reviewPeriodDays, reviewPeriodStart, shiftReviewPeriod, type ReviewPeriod } from './reviewPeriod'
import { unrecordedMinutesOnDay } from './unrecordedGaps'

/** 予定の長さ（分）。0:00 終わりはその日の終わりまで（23:00–0:00） */
function plannedItemMinutes(p: PlannedItem): number {
  const start = timeToMinutes(p.startTime)
  const end = p.endTime === '00:00' ? 24 * 60 : timeToMinutes(p.endTime)
  return Math.max(0, end - start)
}

export interface WeekReviewDay {
  dateKey: string
  plannedMinutes: number
  loggedMinutes: number
  done: number
  total: number
  /** 記録の無い時間（起きている間の 30 分以上の抜け。タイムラインの点線の枠の合計） */
  unrecordedMinutes: number
  /** 分類ごとの記録時間（多い順、キーは `labelOf`、タグ無しは空文字）。日ごとの棒を分類の色で積む */
  tagMinutes: { tag: string; minutes: number }[]
  /** その日の「計画どおり実行」の分母（数えた時間つきの予定）と分子（#284 の数え方、`followRate` と同じ） */
  timedPlanned: number
  followed: number
  /** 予定に無かった記録（どの予定とも組にならなかった記録）の時間（#275） */
  unplannedMinutes: number
}

/** 記録のラベル（`recordLabelKey`）を決めるのに使うもの。予定は「その予定から作る記録」の形（分類なし・色だけ）で渡す */
export type LabelSource = Pick<Task, 'category'> & { color?: string | null }

/** ラベルごとの予定した時間（#275） */
export interface LabelPlan {
  tag: string
  /** 予定した時間（時刻つきの To-Do・習慣の枠。日ごとの棒の予定の枠と同じ集まり） */
  minutes: number
  /** そのうち時間の過ぎた予定（今日のこれからの予定を除く。一言で「ずれた」と言うのはこちら） */
  endedMinutes: number
}

/** 予定に無かった記録をラベルと題名でまとめたもの（#275） */
export interface UnplannedRecord {
  tag: string
  title: string
  minutes: number
}

export interface WeekReview {
  days: WeekReviewDay[]
  plannedMinutes: number
  loggedMinutes: number
  /** 記録の無い時間の合計（今日は今まで） */
  unrecordedMinutes: number
  done: number
  total: number
  /**
   * 時刻つきの予定（タスク・習慣）のうち、ログと突き合わせて実行できたものの割合。予定が無ければ null。
   * 今日はまだ終わっていない予定を数えない（これから行う予定で「ずれた」と言わない）
   */
  followRate: number | null
  /** 「計画どおり実行」の分母（時間を決めた予定の数）と分子 */
  timedPlanned: number
  followed: number
  habitRate: number | null
  /** ラベルごとの記録時間（多い順、全件。タグ無しは空文字） */
  labelMinutes: { tag: string; minutes: number }[]
  /** ラベルごとの予定した時間（多い順、予定のあるラベルだけ） */
  labelPlans: LabelPlan[]
  /** 予定に無かった記録（ラベル・題名ごと、多い順、全件） */
  unplanned: UnplannedRecord[]
  unplannedMinutes: number
}

/** 「予定に無かった記録」を出す件数 */
export const UNPLANNED_ROWS = 3

/** ラベル別の時間を出す行数。これを超えたら 6 行目以降を「その他」にまとめる */
export const LABEL_ROWS = 6

/**
 * ラベル別の時間を `LABEL_ROWS` 行に収める。収まらなければ上位の行と、残りの合計（`others`）。
 * 1 件だけを「その他」にはしない（それなら名前を出したほうが読める）。
 * `keep` の行（週の目安のあるラベル、#291）は「その他」にまとめない（目安と並べて見たい行なので）
 */
export function foldLabelMinutes<R extends { tag: string; minutes: number }>(
  rows: readonly R[],
  keep: (row: R) => boolean = () => false,
): {
  shown: R[]
  others: number
} {
  if (rows.length <= LABEL_ROWS) return { shown: [...rows], others: 0 }
  const kept = rows.filter(keep).length
  const rest = rows.filter((r) => !keep(r))
  const room = Math.max(0, LABEL_ROWS - 1 - kept)
  const folded = rest.length - room <= 1 ? [] : rest.slice(room)
  const foldedSet = new Set(folded)
  return { shown: rows.filter((r) => !foldedSet.has(r)), others: folded.reduce((a, x) => a + x.minutes, 0) }
}

/** `anchor` を含む週（月曜始まり）の振り返り。未来の日は数えない */
export function getWeekReview(
  tasks: readonly Task[],
  habits: readonly Habit[],
  anchor: Date,
  excludedListIds: ReadonlySet<string> = new Set(),
  now = zonedNow(),
  labelOf?: (log: LabelSource) => string,
): WeekReview {
  return getReview(tasks, habits, 'week', anchor, excludedListIds, now, labelOf)
}

/**
 * `anchor` を含む期間（週: 月曜始まり / 月: 暦の月, #304）の振り返り。未来の日は数えない。
 * 月の「週に◯回」の習慣は、4 日以上がその月にある週だけで数える（`monthHabitWeekStarts`）
 */
export function getReview(
  tasks: readonly Task[],
  habits: readonly Habit[],
  period: ReviewPeriod,
  anchor: Date,
  excludedListIds: ReadonlySet<string> = new Set(),
  now = zonedNow(),
  /**
   * 記録のラベル（タグ無しは空文字）。既定は先頭のタグ。画面は `recordLabelKey` で名前の無い色も分ける。
   * 予定のラベルは、その予定から ✓ / ▶ で作る記録と同じ（To-Do・習慣の色 → その色のラベル → 名前の無い色）
   */
  labelOf: (log: LabelSource) => string = (log) => log.category ?? '',
): WeekReview {
  const {
    days,
    tagMinutes,
    labelPlans,
    unplanned,
    habitDue: dailyDue,
    habitDone: dailyDone,
  } = collectReviewDays(tasks, habits, reviewPeriodDays(period, anchor), excludedListIds, now, labelOf)
  const todayKey = toDateKey(now)
  let habitDue = dailyDue
  let habitDone = dailyDone
  const habitRecords = buildHabitRecordIndex(tasks)

  const habitWeeks = period === 'month' ? monthHabitWeekStarts(anchor) : [reviewPeriodStart('week', anchor)]
  for (const h of habits) {
    if (h.frequency.type !== 'timesPerWeek' || !isHabitActive(h)) continue
    for (const week of habitWeeks) {
      if (toDateKey(week) > todayKey) break
      const tally = timesPerWeekTally(h, week, todayKey, habitRecords)
      habitDue += tally.expected
      habitDone += tally.completed
    }
  }

  const sum = (f: (d: WeekReviewDay) => number) => days.reduce((a, d) => a + f(d), 0)
  const timedPlanned = sum((d) => d.timedPlanned)
  const followed = sum((d) => d.followed)
  return {
    days,
    plannedMinutes: sum((d) => d.plannedMinutes),
    loggedMinutes: sum((d) => d.loggedMinutes),
    unrecordedMinutes: sum((d) => d.unrecordedMinutes),
    done: sum((d) => d.done),
    total: sum((d) => d.total),
    followRate: timedPlanned > 0 ? followed / timedPlanned : null,
    timedPlanned,
    followed,
    habitRate: habitDue > 0 ? habitDone / habitDue : null,
    labelMinutes: sortedTagMinutes(tagMinutes),
    labelPlans: [...labelPlans.entries()]
      .map(([tag, p]) => ({ tag, ...p }))
      .filter((p) => p.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes || compareText(a.tag, b.tag)),
    unplanned: [...unplanned.values()]
      .filter((x) => x.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes || compareText(a.tag, b.tag) || compareText(a.title, b.title)),
    unplannedMinutes: sum((d) => d.unplannedMinutes),
  }
}

/** 並びを環境に左右されないようにする文字の比べ方（同じ数字なら同じ並び） */
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * その日の、記録と突き合わせる予定（時刻つきの To-Do・予定（授業・バイト）・時間を決めた習慣の枠）と、その予定の色。
 * 週に◯回の習慣は、やらなかった日の枠を入れない（やらない日の枠を「できなかった予定」にしない）。
 * ふりかえりと記録の書き出し（元の予定の列）が同じ予定の集まりで突き合わせる
 */
export function plannedItemsOnDay(
  tasks: readonly Task[],
  habits: readonly Habit[],
  key: string,
  excludedListIds: ReadonlySet<string>,
  habitRecords: HabitRecordIndex = buildHabitRecordIndex(tasks),
): { item: PlannedItem; color: string | null }[] {
  const out: { item: PlannedItem; color: string | null }[] = []
  for (const t of tasks) {
    if (taskPlacementDate(t) !== key || excludedListIds.has(t.listId)) continue
    const item = scheduledTaskToPlannedItem(t)
    if (item) out.push({ item, color: t.color })
  }
  for (const h of habits) {
    if (h.frequency.type === 'timesPerWeek' && habitDayStatus(h, key, habitRecords) === 'missed') continue
    const item = habitToPlannedItem(h, key)
    if (item) out.push({ item, color: h.color })
  }
  return out
}

/**
 * 並べた日ごとの記録・予定・計画どおり（`getReview` の日ごとの部分）。未来の日は数えない（そこで打ち切る）。
 * 「週に◯回」の習慣の回数は週でまとめて数えるので、ここの `habitDue` / `habitDone` には入らない
 */
function collectReviewDays(
  tasks: readonly Task[],
  habits: readonly Habit[],
  dates: readonly Date[],
  excludedListIds: ReadonlySet<string>,
  now: Date,
  labelOf: (log: LabelSource) => string,
  /** 「計画どおり実行」に数えた予定の組ごとに呼ぶ（ずれやすい曜日・時間帯、`getPlanDriftCells`） */
  onCountedPair?: (date: Date, pair: MatchedPair) => void,
): {
  days: WeekReviewDay[]
  tagMinutes: Map<string, number>
  labelPlans: Map<string, { minutes: number; endedMinutes: number }>
  unplanned: Map<string, UnplannedRecord>
  habitDue: number
  habitDone: number
} {
  const todayKey = toDateKey(now)
  const nowHm = clockOf(now)
  /** 記録に使える最後の分（今日は今、過ぎた日は制限なし）。タイムラインと同じ */
  const logLimit = (key: string) => (key < todayKey ? null : timeToMinutes(nowHm))
  const days: WeekReviewDay[] = []
  const tagMinutes = new Map<string, number>()
  const labelPlans = new Map<string, { minutes: number; endedMinutes: number }>()
  const unplanned = new Map<string, UnplannedRecord>()
  let habitDue = 0
  let habitDone = 0
  const habitRecords = buildHabitRecordIndex(tasks)

  for (const date of dates) {
    const key = toDateKey(date)
    if (key > todayKey) break
    const plan = getDayPlan(tasks, key, excludedListIds)
    const day: WeekReviewDay = {
      dateKey: key,
      plannedMinutes: 0,
      loggedMinutes: plan.loggedMinutes,
      unrecordedMinutes: unrecordedMinutesOnDay(tasks, key, logLimit, null, excludedListIds),
      done: plan.done.length,
      total: plan.done.length + plan.open.length,
      tagMinutes: [],
      timedPlanned: 0,
      followed: 0,
      unplannedMinutes: 0,
    }
    days.push(day)

    for (const h of habits) {
      // 週に◯回の習慣は日ごとではなく週でまとめて数える（下）
      if (h.frequency.type !== 'timesPerWeek' && isHabitCountedOnDate(h, date, habitRecords)) {
        habitDue++
        if (habitDayStatus(h, key, habitRecords) === 'done') habitDone++
      }
    }
    const planned: PlannedItem[] = []
    /** 予定 → その予定のラベル（その予定から作る記録のラベル。分類なし・色だけの記録として `labelOf` に渡す） */
    const planLabel = new Map<PlannedItem, string>()
    for (const { item, color } of plannedItemsOnDay(tasks, habits, key, excludedListIds, habitRecords)) {
      planned.push(item)
      planLabel.set(item, labelOf({ category: null, color }))
    }
    const logs = tasks.filter(
      (t) => isLogTask(t) && !t.parentId && t.startTime && t.endTime && isActiveTask(t) && !isSleepTask(t) && logOverlapsDateKey(t, key),
    )
    const dayTagMinutes = new Map<string, number>()
    for (const log of logs) {
      const min = minutesOfLogOnCalendarDay(log, key)
      const label = labelOf(log)
      const tags = log.tags.length > 0 ? log.tags : [label]
      for (const tag of tags) tagMinutes.set(tag, (tagMinutes.get(tag) ?? 0) + min)
      // 棒は 1 本の記録を 1 回だけ積む（複数タグなら先頭のタグの色）
      dayTagMinutes.set(label, (dayTagMinutes.get(label) ?? 0) + min)
    }
    day.tagMinutes = sortedTagMinutes(dayTagMinutes)
    // 日ごとの棒の予定の枠は、計画どおりと同じ予定の集まり（To-Do・習慣の枠）から。予定（授業・バイト）は入れない
    // ラベル別の予定した時間も同じ集まりから（棒の枠の合計 = ラベル別の予定の合計）
    for (const p of planned) {
      if (p.source === 'scheduled-event') continue
      const min = plannedItemMinutes(p)
      day.plannedMinutes += min
      const tag = planLabel.get(p) ?? ''
      const cur = labelPlans.get(tag) ?? { minutes: 0, endedMinutes: 0 }
      cur.minutes += min
      if (planEnded(key, todayKey, nowHm, p)) cur.endedMinutes += min
      labelPlans.set(tag, cur)
    }
    for (const pair of matchPlanAndActualForDate(planned, logs)) {
      // 予定に無かった記録（どの予定とも組にならなかった記録）。ラベルと題名でまとめる
      if (pair.status === 'actual-only' && pair.actual) {
        const min = minutesOfLogOnCalendarDay(pair.actual, key)
        const tag = labelOf(pair.actual)
        const title = pair.actual.title.trim()
        const k = `${tag}\u0000${title}`
        const cur = unplanned.get(k) ?? { tag, title, minutes: 0 }
        cur.minutes += min
        unplanned.set(k, cur)
        day.unplannedMinutes += min
        continue
      }
      if (!pair.planned) continue
      // 予定（授業・バイト）は完了できないので分母に入れない（突き合わせには入れて、その時間の記録を「予定に無かった記録」にしない）
      if (pair.planned.source === 'scheduled-event') continue
      // ✓ で終えた時刻つきの To-Do は、記録が無くても予定どおり（RULES: ✓ は完了だけで記録は足さない。予定ブロックが時間を表す）
      const followedPair =
        pair.status === 'matched' || pair.status === 'time-drift' || (pair.status === 'planned-only' && pair.planned.completed === true)
      // 今日の、まだ終わっていない予定（日をまたぐものも含む）は、先に記録できていなければ数えない
      if (!planEnded(key, todayKey, nowHm, pair.planned) && !followedPair) continue
      day.timedPlanned++
      if (followedPair) day.followed++
      onCountedPair?.(date, pair)
    }
  }
  return { days, tagMinutes, labelPlans, unplanned, habitDue, habitDone }
}

/** 予定の時間が過ぎたか（過ぎた日はすべて。今日は終わりの時刻を過ぎたもの。日をまたぐ予定は今日のうちは過ぎていない） */
function planEnded(key: string, todayKey: string, nowHm: string, p: PlannedItem): boolean {
  return key < todayKey || (key === todayKey && p.endTime > p.startTime && p.endTime <= nowHm)
}

/**
 * 並べた日（古い順）ごとの振り返りの数字（記録した時間・ラベル別・計画どおり）。未来の日は数えない。
 * 日の違い（#326）が睡眠・気分で日を分けて比べるのに使う
 */
export function getDayReviews(
  tasks: readonly Task[],
  habits: readonly Habit[],
  dates: readonly Date[],
  excludedListIds: ReadonlySet<string> = new Set(),
  now = zonedNow(),
  labelOf: (log: LabelSource) => string = (log) => log.category ?? '',
): WeekReviewDay[] {
  return collectReviewDays(tasks, habits, dates, excludedListIds, now, labelOf).days
}

/**
 * 前の期間の振り返り。今の期間は今日までしか数えないので、前の期間も同じ日（曜日・日付）までで打ち切る
 * （週・月の頭に「先週より −10時間」と出さない）。過ぎた期間どうしなら丸ごと。
 * 前の月が短ければ末日まで（3/31 の前の月は 2 月まる 1 か月）
 */
export function getPrevReview(
  tasks: readonly Task[],
  habits: readonly Habit[],
  period: ReviewPeriod,
  anchor: Date,
  excludedListIds: ReadonlySet<string> = new Set(),
  now = zonedNow(),
  labelOf?: (log: LabelSource) => string,
): WeekReview {
  // 「今」を 1 期間前にずらすと、前の期間は同じ日で打ち切られる
  return getReview(
    tasks,
    habits,
    period,
    shiftReviewPeriod(period, anchor, -1),
    excludedListIds,
    shiftReviewPeriod(period, now, -1),
    labelOf,
  )
}

export interface ReviewComparison {
  /** 記録した時間の差（分。今 − 前）。前の期間に記録が無ければ null（比べる相手が無いので出さない） */
  loggedDiff: number | null
  /** ラベルごとの記録時間の差（分。今 − 前）。前の期間に記録が無ければ空。前の期間に無かったラベルは今の分そのまま */
  labelDiff: Map<string, number>
}

/** 今の期間と前の期間（`getPrevReview`）の記録時間を比べる */
export function compareReviews(current: WeekReview, prev: WeekReview): ReviewComparison {
  if (prev.loggedMinutes === 0) return { loggedDiff: null, labelDiff: new Map() }
  const prevByLabel = new Map(prev.labelMinutes.map((x) => [x.tag, x.minutes]))
  return {
    loggedDiff: current.loggedMinutes - prev.loggedMinutes,
    labelDiff: new Map(current.labelMinutes.map((x) => [x.tag, x.minutes - (prevByLabel.get(x.tag) ?? 0)])),
  }
}

/**
 * 記録した時間の、前の週との差（分。今週 − 前の週）。前の週に記録が無ければ null（比べる相手が無いので出さない）。
 * 今週は今日までしか数えないので、前の週も同じ曜日までで比べる（週の頭に「先週より −10時間」と出さない）
 */
export function loggedMinutesVsPrevWeek(
  loggedMinutes: number,
  tasks: readonly Task[],
  habits: readonly Habit[],
  anchor: Date,
  excludedListIds: ReadonlySet<string> = new Set(),
  now = zonedNow(),
): number | null {
  const prev = getPrevReview(tasks, habits, 'week', anchor, excludedListIds, now)
  if (prev.loggedMinutes === 0) return null
  return loggedMinutes - prev.loggedMinutes
}

function sortedTagMinutes(m: ReadonlyMap<string, number>): { tag: string; minutes: number }[] {
  return [...m.entries()]
    .map(([tag, minutes]) => ({ tag, minutes }))
    .filter((x) => x.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
}

/** ずれやすい曜日・時間帯を出すのに要る記録の長さ（日）。最初の記録からこれだけたってから数える */
export const DRIFT_MIN_DAYS = 28

/** 時間帯（予定の始まりの時刻。〜12:00 / 12:00〜18:00 / 18:00〜） */
export type DaySlot = 'morning' | 'afternoon' | 'evening'

export interface PlanDriftCell {
  /** 曜日（0 = 月曜 … 6 = 日曜） */
  weekday: number
  slot: DaySlot
  /** 数えた予定（「計画どおり実行」の分母と同じ） */
  plans: number
  /** 時刻がずれて記録した予定（`time-drift`）の数と、ずれの合計（分） */
  drifted: number
  driftMinutes: number
  /** 記録の無かった予定（`planned-only`。✓ で終えたものは入れない） */
  missed: number
}

const slotOf = (hm: string): DaySlot => (hm < '12:00' ? 'morning' : hm < '18:00' ? 'afternoon' : 'evening')

/**
 * ずれやすい曜日・時間帯（#275。計算だけ。画面に出すかは #33 の結果で決める）。
 * 昨日までの 28 日の「計画どおり実行」に数えた予定を、曜日 × 時間帯ごとに数える。
 * 最初の記録から 28 日たっていなければ null（少ない週で「◯曜がずれやすい」と言わない）
 */
export function getPlanDriftCells(
  tasks: readonly Task[],
  habits: readonly Habit[],
  excludedListIds: ReadonlySet<string> = new Set(),
  now = zonedNow(),
): PlanDriftCell[] | null {
  const todayKey = toDateKey(now)
  let first: string | null = null
  for (const t of tasks) {
    if (!isLogTask(t) || isSleepTask(t) || !isActiveTask(t) || !t.dueDate) continue
    if (first == null || t.dueDate < first) first = t.dueDate
  }
  const today = fromDateKey(todayKey)
  const dates = Array.from({ length: DRIFT_MIN_DAYS }, (_, i) => addDays(today, i - DRIFT_MIN_DAYS))
  if (first == null || first > toDateKey(dates[0]!)) return null

  const cells = new Map<string, PlanDriftCell>()
  collectReviewDays(
    tasks,
    habits,
    dates,
    excludedListIds,
    now,
    (log) => log.category ?? '',
    (date, pair) => {
      const p = pair.planned!
      const weekday = (date.getDay() + 6) % 7
      const slot = slotOf(p.startTime)
      const k = `${weekday}:${slot}`
      const cell = cells.get(k) ?? { weekday, slot, plans: 0, drifted: 0, driftMinutes: 0, missed: 0 }
      cell.plans++
      if (pair.status === 'time-drift') {
        cell.drifted++
        cell.driftMinutes += pair.driftMinutes ?? 0
      }
      if (pair.status === 'planned-only' && p.completed !== true) cell.missed++
      cells.set(k, cell)
    },
  )
  const slots: DaySlot[] = ['morning', 'afternoon', 'evening']
  return [...cells.values()].sort((a, b) => a.weekday - b.weekday || slots.indexOf(a.slot) - slots.indexOf(b.slot))
}

/**
 * 直近 2 週（昨日まで）の、記録のある日の 1 日あたりの記録時間（設定「1 日に計画する時間の目安」の横に出す、#275）。
 * 記録のある日が無ければ null
 */
export function recentDailyLoggedMinutes(
  tasks: readonly Task[],
  habits: readonly Habit[],
  excludedListIds: ReadonlySet<string> = new Set(),
  now = zonedNow(),
): { average: number; days: number } | null {
  const today = fromDateKey(toDateKey(now))
  const dates = Array.from({ length: RECENT_DAYS }, (_, i) => addDays(today, i - RECENT_DAYS))
  const logged = getDayReviews(tasks, habits, dates, excludedListIds, now)
    .map((d) => d.loggedMinutes)
    .filter((m) => m > 0)
  if (logged.length === 0) return null
  return { average: Math.round(logged.reduce((a, m) => a + m, 0) / logged.length), days: logged.length }
}

/** `recentDailyLoggedMinutes` の期間（日） */
export const RECENT_DAYS = 14

/** 一言で名指しする差の最小（分）。これより小さい差は名指ししない */
export const INSIGHT_MIN_MINUTES = 60
/** ラベルの予定と記録の差が、予定に対してこれ未満なら名指ししない */
export const INSIGHT_LABEL_GAP_RATIO = 0.25
/** 記録した時間の前の期間との差が、前の期間に対してこれ未満なら名指ししない */
export const INSIGHT_DIFF_RATIO = 0.2
/** 時間を決めた予定がこれ未満の期間・日は、割合・記録の無かった日の文を出さない（少ない件数で言い切らない） */
export const INSIGHT_MIN_PLANS = 3

/**
 * ふりかえりの一言（#276）。その期間の数字から作る、いちばん大きいずれ 1 つ。
 * 名指しする候補（分の大きさで比べる）が無ければ、事実を並べるだけの文に下がる
 */
export type ReviewInsight =
  /** ラベルの予定（時間の過ぎた分）と記録の差 */
  | { kind: 'labelGap'; tag: string; planned: number; logged: number }
  /** 予定に無かった記録でいちばん長いもの */
  | { kind: 'unplanned'; tag: string; title: string; minutes: number }
  /** 時間を決めた予定が 3 件以上あって、どれも記録・完了の無かった過ぎた日 */
  | { kind: 'missedDay'; dateKey: string; count: number }
  /** 記録した時間の前の期間との差 */
  | { kind: 'loggedDiff'; diff: number }
  // ここから下は名指しする差が無いとき
  | { kind: 'follow'; followed: number; total: number }
  | { kind: 'loggedTop'; logged: number; tag: string; minutes: number }
  | { kind: 'doneOnly'; done: number }
  | { kind: 'openOnly'; total: number }
  /** 記録も予定も無い期間（前に記録したことがある人） */
  | { kind: 'empty' }
  /** 一度も記録したことが無い人 */
  | { kind: 'firstTime' }

type NamedInsight = Extract<ReviewInsight, { kind: (typeof INSIGHT_KIND_ORDER)[number] }>

/** 同じ大きさの候補の並び（先のものを出す） */
const INSIGHT_KIND_ORDER = ['missedDay', 'labelGap', 'unplanned', 'loggedDiff'] as const

/**
 * 一言を選ぶ。同じ数字なら同じ一言（並びは分の大きさ → 種類 → ラベル・日付の順で決める）。
 * 提案・原因は言わない（事実だけ。どうするかは利用者が選ぶ）
 */
export function pickReviewInsight(
  review: WeekReview,
  opts: {
    /** 記録した時間の前の期間との差（`compareReviews`。前の期間に記録が無ければ null） */
    loggedDiff: number | null
    /** 一度でも記録したことがあるか（無ければはじめの案内） */
    everRecorded: boolean
    todayKey: string
  },
): ReviewInsight {
  const candidates: { weight: number; order: number; key: string; insight: NamedInsight }[] = []
  const add = (weight: number, insight: NamedInsight, key: string) =>
    candidates.push({ weight, order: INSIGHT_KIND_ORDER.indexOf(insight.kind), key, insight })

  // ラベルの予定と記録の差。予定は時間の過ぎた分だけ（今日のこれからの予定で「少なかった」と言わない）
  const loggedOf = new Map(review.labelMinutes.map((x) => [x.tag, x.minutes]))
  for (const p of review.labelPlans) {
    const planned = p.endedMinutes
    if (planned < INSIGHT_MIN_MINUTES) continue
    const logged = loggedOf.get(p.tag) ?? 0
    const gap = Math.abs(logged - planned)
    if (gap >= INSIGHT_MIN_MINUTES && gap >= planned * INSIGHT_LABEL_GAP_RATIO)
      add(gap, { kind: 'labelGap', tag: p.tag, planned, logged }, p.tag)
  }
  // 予定に無かった記録は、予定（To-Do・習慣の枠）のある期間だけ（画面の「予定に無かった記録」と同じ）
  const top = review.plannedMinutes > 0 ? review.unplanned[0] : undefined
  if (top && top.minutes >= INSIGHT_MIN_MINUTES) add(top.minutes, { kind: 'unplanned', ...top }, `${top.tag}\u0000${top.title}`)
  // 過ぎた日で、時間を決めた予定が 3 件以上あり、どれも記録・完了が無かった日（その日の予定の長さで比べる）
  for (const d of review.days) {
    if (d.dateKey >= opts.todayKey || d.timedPlanned < INSIGHT_MIN_PLANS || d.followed > 0) continue
    add(d.plannedMinutes, { kind: 'missedDay', dateKey: d.dateKey, count: d.timedPlanned }, d.dateKey)
  }
  if (opts.loggedDiff != null) {
    const prev = review.loggedMinutes - opts.loggedDiff
    const diff = Math.abs(opts.loggedDiff)
    if (diff >= INSIGHT_MIN_MINUTES && diff >= prev * INSIGHT_DIFF_RATIO) add(diff, { kind: 'loggedDiff', diff: opts.loggedDiff }, '')
  }
  candidates.sort((a, b) => b.weight - a.weight || a.order - b.order || compareText(a.key, b.key))
  if (candidates[0]) return candidates[0].insight

  if (review.timedPlanned >= INSIGHT_MIN_PLANS) return { kind: 'follow', followed: review.followed, total: review.timedPlanned }
  const topLabel = review.labelMinutes[0]
  if (review.loggedMinutes > 0 && topLabel) {
    return { kind: 'loggedTop', logged: review.loggedMinutes, tag: topLabel.tag, minutes: topLabel.minutes }
  }
  if (review.done > 0) return { kind: 'doneOnly', done: review.done }
  if (review.total > 0) return { kind: 'openOnly', total: review.total }
  return opts.everRecorded ? { kind: 'empty' } : { kind: 'firstTime' }
}

/** 一言の文にする。ラベル名・時間・日付の書き方は画面から渡す（読み上げでもそのまま読める文。矢印は使わない） */
export function reviewInsightText(
  insight: ReviewInsight,
  f: {
    t: TFunction
    period: ReviewPeriod
    /** 今の期間か（前の期間の呼び方が「先週」か「前の週」か） */
    current: boolean
    duration: (minutes: number) => string
    label: (tag: string) => string
    day: (dateKey: string) => string
  },
): string {
  const { t, period, duration } = f
  switch (insight.kind) {
    case 'labelGap':
      return t('weekReview.insightLabelGap', {
        label: f.label(insight.tag),
        planned: duration(insight.planned),
        logged: duration(insight.logged),
      })
    case 'unplanned':
      return t('weekReview.insightUnplanned', { title: insight.title || f.label(insight.tag), time: duration(insight.minutes) })
    case 'missedDay':
      return t('weekReview.insightMissedDay', { day: f.day(insight.dateKey), count: insight.count })
    case 'loggedDiff': {
      const prev =
        period === 'month'
          ? t(f.current ? 'weekReview.insightLastMonth' : 'weekReview.insightPrevMonth')
          : t(f.current ? 'weekReview.insightLastWeek' : 'weekReview.insightPrevWeek')
      return t(insight.diff > 0 ? 'weekReview.insightMore' : 'weekReview.insightLess', { prev, time: duration(Math.abs(insight.diff)) })
    }
    case 'follow':
      return t('weekReview.insightFollow', { followed: insight.followed, total: insight.total })
    case 'loggedTop':
      return t('weekReview.insightLoggedTop', {
        time: duration(insight.logged),
        label: f.label(insight.tag),
        labelTime: duration(insight.minutes),
      })
    case 'doneOnly':
      return t('weekReview.insightDoneOnly', { count: insight.done })
    case 'openOnly':
      return t('weekReview.insightOpenOnly', { count: insight.total })
    case 'empty':
      return t(period === 'month' ? 'weekReview.insightNothingMonth' : 'weekReview.insightNothing')
    case 'firstTime':
      return t(period === 'month' ? 'weekReview.insightEmptyMonth' : 'weekReview.insightEmpty')
  }
}
