import { addDays, differenceInCalendarDays } from 'date-fns'
import { isEventTask, type EventSeries, type Task } from '../types/task'
import { fromDateKey, toDateKey } from './dateKey'
import { isoWeekday, readRecurrenceWeekdays } from './recurrence'
import { japaneseHolidayName } from './japaneseHolidays'

/**
 * 毎週繰り返す予定（授業など、#279）。
 *
 * 回は前もって終わりの日までの分を、ふつうの予定の行（`kind: 'event'`）として作り、同じ繰り返しの回に同じ印（`series`）を付ける。
 * To-Do の繰り返し（`taskRecurrence.ts`）は完了で次の回を作るが、予定は完了にしないので、その方式では次の回ができない。
 * 行を作っておけば、カレンダー・今日の計画・空き時間・通知（`daily-reminders`）・同期・バックアップ・前の版のアプリが
 * 今のまま 1 回ずつの予定として扱える（回を画面で計算して出す方式だと、そのどれもが計算を持つ必要があり、前の版では 1 回目しか見えない）。
 * - この予定のみ: その回の行を直す・消す（休講・教室の変更）
 * - 以降すべて: 同じ印で日付が後（その回を含む）の行をまとめて直す・消す
 * - すべて: 同じ印の行をまとめて
 * - 曜日・終わりの日を変える: その回から後を作り直す（その回より前の回は別の繰り返しとして残す。Google カレンダーと同じ）
 */

/** 作れる期間（1 年。それより先は終わりの日を延ばして作る） */
export const SERIES_MAX_DAYS = 366
/** 終わりの日を決めていないときの長さ（大学の 1 学期ほど） */
export const SERIES_DEFAULT_WEEKS = 15

/** 繰り返しの決まり（印から id を除いたもの） */
export type SeriesRule = Pick<EventSeries, 'weekdays' | 'until' | 'skipHolidays'>

/** 直す範囲（Google カレンダーの「この予定 / これ以降のすべての予定 / すべての予定」） */
export type SeriesScope = 'one' | 'following' | 'all'

/** 範囲の並び（Google カレンダーと同じ順） */
export const SERIES_SCOPES: readonly SeriesScope[] = ['one', 'following', 'all']

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** 保存・同期・バックアップから読んだ印をそろえる。使えなければ null */
export function readEventSeries(raw: unknown): EventSeries | null {
  if (!raw || typeof raw !== 'object') return null
  const x = raw as Record<string, unknown>
  if (typeof x.id !== 'string' || !x.id) return null
  const weekdays = readRecurrenceWeekdays(x.weekdays)
  if (!weekdays || typeof x.until !== 'string' || !DATE_KEY.test(x.until)) return null
  return { id: x.id, weekdays, until: x.until, skipHolidays: x.skipHolidays === true }
}

/** 印のある項目だけを持つ形（無いときは項目ごと持たない。同期で「変わった」と見ないため） */
export function withSeries<T extends Task>(t: T, series: EventSeries | null | undefined): T {
  if (series) return { ...t, series }
  if (!('series' in t)) return t
  const rest = { ...t }
  delete rest.series
  return rest
}

/** 終わりの日の既定（学期の終わりがその日より後ならそこまで、無ければ 15 週） */
export function defaultSeriesUntil(fromDate: string, termEnd: string | null = null): string {
  if (termEnd && termEnd >= fromDate) return termEnd
  return toDateKey(addDays(fromDateKey(fromDate), SERIES_DEFAULT_WEEKS * 7 - 1))
}

/** 作れる終わりの日のいちばん遅い日 */
export function maxSeriesUntil(fromDate: string): string {
  return toDateKey(addDays(fromDateKey(fromDate), SERIES_MAX_DAYS - 1))
}

/**
 * 決まりに当てはまる日（`from` の日から終わりの日まで、選んだ曜日。祝日を除くなら日本の祝日を除く）。
 * 終わりの日が 1 年より先なら 1 年まで
 */
export function seriesDates(from: string, rule: SeriesRule): string[] {
  const until = rule.until < maxSeriesUntil(from) ? rule.until : maxSeriesUntil(from)
  if (until < from) return []
  const days = new Set(rule.weekdays)
  const out: string[] = []
  const start = fromDateKey(from)
  const span = differenceInCalendarDays(fromDateKey(until), start)
  for (let i = 0; i <= span; i++) {
    const d = addDays(start, i)
    if (!days.has(isoWeekday(d))) continue
    const key = toDateKey(d)
    if (rule.skipHolidays && japaneseHolidayName(key)) continue
    out.push(key)
  }
  return out
}

/** 毎週の予定の 1 回分か（消していない予定で、印がある） */
export function isSeriesEvent(t: Task): t is Task & { series: EventSeries } {
  return isEventTask(t) && !!t.series && !t.deletedAt
}

/** 同じ繰り返しの、消していない回（日付順） */
export function liveSeriesRows(tasks: readonly Task[], seriesId: string): (Task & { series: EventSeries })[] {
  return tasks
    .filter((t): t is Task & { series: EventSeries } => isSeriesEvent(t) && t.series.id === seriesId)
    .sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''))
}

/** ほかにも回がある繰り返しの 1 回か（範囲を聞くのはこのときだけ） */
export function hasOtherOccurrences(tasks: readonly Task[], task: Task): boolean {
  if (!isSeriesEvent(task)) return false
  const id = task.series.id
  return tasks.some((t) => t.id !== task.id && isSeriesEvent(t) && t.series.id === id)
}

/** 範囲に入る回の id（その回を含む。以降は日付がその回と同じか後） */
export function seriesScopeIds(tasks: readonly Task[], task: Task, scope: SeriesScope): Set<string> {
  if (scope === 'one' || !isSeriesEvent(task)) return new Set([task.id])
  const from = task.scheduledDate ?? ''
  return new Set(
    liveSeriesRows(tasks, task.series.id)
      .filter((t) => scope === 'all' || (t.scheduledDate ?? '') >= from)
      .map((t) => t.id)
      .concat(task.id),
  )
}

/**
 * 回どうしで同じにする項目（以降すべて・すべてで写す）。日付・種類・印・完了・削除は回ごと
 */
export const SERIES_SHARED_FIELDS = [
  'title',
  'description',
  'location',
  'startTime',
  'endTime',
  'color',
  'reminders',
  'listId',
  'sectionId',
  'tags',
  'timeZone',
  'timeZoneAnchor',
] as const satisfies readonly (keyof Task)[]

/** 変更のうち、ほかの回にも写す項目だけ */
export function sharedSeriesPatch(patch: Partial<Task>): Partial<Task> {
  const out: Partial<Task> = {}
  for (const k of SERIES_SHARED_FIELDS) if (patch[k] !== undefined) (out as Record<string, unknown>)[k] = patch[k]
  return out
}

/**
 * もとの回を写して、ほかの日の回を作る（新しい id・その日・未完了）。日をまたぐ予定は同じ日数ずらした終わりの日にする
 */
export function occurrenceFrom(base: Task, date: string, series: EventSeries, id: string, now: string): Task {
  const span = base.endDate && base.scheduledDate ? differenceInCalendarDays(fromDateKey(base.endDate), fromDateKey(base.scheduledDate)) : 0
  return {
    ...base,
    id,
    scheduledDate: date,
    endDate: span > 0 ? toDateKey(addDays(fromDateKey(date), span)) : null,
    completed: false,
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    series,
  }
}

/**
 * 繰り返しを付ける・変える・やめる（その回から後に当てはまる）。変わらなければ null。
 * - 繰り返さない予定に付ける: その回に印を付け、翌日から終わりの日までの回を作る
 * - 繰り返しを変える: その回から後で当てはまらなくなった回を外し（1 回だけ消した回の日は作り直さない）、足りない日の回を作る。
 *   その回より前の回があれば、その回から後は新しい印にして分ける（前の回の終わりの日は前の回の最後の日にする）
 * - やめる（`rule` が null）: その回より後の回を外し、その回は繰り返さない予定にする
 * 外した回は行ごと消す（作り直しの一部なのでゴミ箱には入れない。元に戻すは ⌘Z・取り消しの通知）
 */
export function changeSeriesRule(
  tasks: readonly Task[],
  taskId: string,
  rule: SeriesRule | null,
  now: string,
  makeId: () => string,
): Task[] | null {
  const task = tasks.find((t) => t.id === taskId)
  if (!task || !isEventTask(task) || task.deletedAt || !task.scheduledDate) return null
  const date = task.scheduledDate
  if (rule) {
    const weekdays = readRecurrenceWeekdays(rule.weekdays)
    if (!weekdays) return null
    rule = { weekdays, until: rule.until < date ? date : rule.until, skipHolidays: rule.skipHolidays }
  }

  if (!isSeriesEvent(task)) {
    if (!rule) return null
    const series: EventSeries = { id: makeId(), ...rule }
    const nextDay = toDateKey(addDays(fromDateKey(date), 1))
    const added = seriesDates(nextDay, rule).map((d) => occurrenceFrom(task, d, series, makeId(), now))
    return [...tasks.map((t) => (t.id === task.id ? { ...t, series, updatedAt: now } : t)), ...added]
  }

  const oldId = task.series.id
  const sameSeries = (t: Task) => isEventTask(t) && t.series?.id === oldId
  const earlier = liveSeriesRows(tasks, oldId).filter((t) => (t.scheduledDate ?? '') < date)
  const lastEarlier = earlier.at(-1)?.scheduledDate ?? null
  /** 前の回の終わりの日を前の回の最後の日に */
  const closeEarlier = (t: Task): Task =>
    lastEarlier && t.series && t.series.until !== lastEarlier ? { ...t, series: { ...t.series, until: lastEarlier }, updatedAt: now } : t
  const isEarlier = (t: Task) => sameSeries(t) && !t.deletedAt && (t.scheduledDate ?? '') < date
  const isFollowing = (t: Task) => sameSeries(t) && (t.scheduledDate ?? '') >= date

  if (!rule) {
    const out: Task[] = []
    let changed = false
    for (const t of tasks) {
      if (t.id === task.id) {
        out.push(withSeries({ ...t, updatedAt: now }, null))
        changed = true
      } else if (isFollowing(t) && !t.deletedAt) {
        changed = true
      } else if (isEarlier(t)) {
        const next = closeEarlier(t)
        if (next !== t) changed = true
        out.push(next)
      } else out.push(t)
    }
    return changed ? out : null
  }

  const series: EventSeries = { id: lastEarlier ? makeId() : oldId, ...rule }
  const wanted = new Set(seriesDates(date, rule))
  // 1 回だけ消した回（ゴミ箱）の日も「ある」に数える（休講の日に作り直さない）
  const have = new Set<string>()
  const out: Task[] = []
  let changed = false
  for (const t of tasks) {
    if (t.id === task.id || (isFollowing(t) && wanted.has(t.scheduledDate ?? ''))) {
      have.add(t.scheduledDate ?? '')
      const same = t.series?.id === series.id && sameRule(t.series, series)
      out.push(same ? t : { ...t, series, updatedAt: now })
      if (!same) changed = true
    } else if (isFollowing(t)) {
      // 当てはまらなくなった回。消した回はゴミ箱に残す
      if (t.deletedAt) out.push(t)
      else changed = true
    } else if (isEarlier(t)) {
      const next = closeEarlier(t)
      if (next !== t) changed = true
      out.push(next)
    } else out.push(t)
  }
  const added = [...wanted].filter((d) => !have.has(d)).map((d) => occurrenceFrom(task, d, series, makeId(), now))
  if (added.length > 0) changed = true
  return changed ? [...out, ...added] : null
}

function sameRule(a: EventSeries | null | undefined, b: EventSeries): boolean {
  return (
    !!a &&
    a.until === b.until &&
    a.skipHolidays === b.skipHolidays &&
    a.weekdays.length === b.weekdays.length &&
    a.weekdays.every((d, i) => d === b.weekdays[i])
  )
}
