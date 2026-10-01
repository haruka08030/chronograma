import type { Habit } from '../types/habit'
import type { Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'

/** 目標の時刻からこれだけずれても「時間どおり」 */
export const HABIT_ON_TIME_TOLERANCE_MIN = 15

/** 目標の時間帯の前後これだけに重なる記録を、その日の記録とみなす（前日 23:30 に寝始めた睡眠など） */
const MATCH_MARGIN_MIN = 3 * 60

/**
 * 習慣のその日の結果。
 * - done: 達成（時間を決めた習慣は時間どおり）
 * - offTime: やったが時間外（連続日数・達成率には数えない）
 * - missed: やっていない
 */
export type HabitDayStatus = 'done' | 'offTime' | 'missed'

interface Span {
  record: Task
  /** 1970-01-01 0:00 からの分 */
  start: number
  end: number
}

/**
 * 習慣の判定に使える記録。開始日ごとに分けて持つ（`key|開始日の通し番号`）。
 * key は習慣につながった記録なら `id:習慣id`、それ以外は `title:タイトル`
 */
export interface HabitRecordIndex {
  active: Map<string, Span[]>
  /** ゴミ箱にある、習慣につながった記録 */
  deleted: Map<string, Span[]>
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

function recordSpan(record: Task): Span | null {
  if (!record.dueDate || !record.startTime || !record.endTime) return null
  const day = dayNumber(record.dueDate)
  const start = day * 1440 + toMin(record.startTime)
  let end = (record.endDate && record.endDate > record.dueDate ? dayNumber(record.endDate) : day) * 1440 + toMin(record.endTime)
  if (end <= start) end += 1440
  return { record, start, end }
}

const titleKey = (title: string) => `title:${title.trim()}`
const linkKey = (habitId: string) => `id:${habitId}`

function push(map: Map<string, Span[]>, key: string, span: Span) {
  const k = `${key}|${Math.floor(span.start / 1440)}`
  const list = map.get(k)
  if (list) list.push(span)
  else map.set(k, [span])
}

export function buildHabitRecordIndex(tasks: readonly Task[]): HabitRecordIndex {
  const active = new Map<string, Span[]>()
  const deleted = new Map<string, Span[]>()
  for (const t of tasks) {
    if (!t.isTimeLog || t.parentId) continue
    const span = recordSpan(t)
    if (!span) continue
    if (!isActiveTask(t)) {
      if (t.habitId) push(deleted, linkKey(t.habitId), span)
      continue
    }
    push(active, t.habitId ? linkKey(t.habitId) : titleKey(t.title), span)
  }
  return { active, deleted }
}

/** 時刻で判定する習慣か（時間を決めていない習慣はいつやっても達成） */
export function isTimedHabit(habit: Habit): boolean {
  if (habit.timeMode === 'fixed') return !!habit.startTime
  if (habit.timeMode === 'range') return !!habit.startTime && !!habit.endTime
  return false
}

/** その日の目標（通しの分）。時刻ひとつの習慣は終わりを持たない */
function target(habit: Habit, dateKey: string): { start: number; end: number | null } {
  const base = dayNumber(dateKey) * 1440
  const start = base + toMin(habit.startTime!)
  if (habit.timeMode !== 'range') return { start, end: null }
  let end = base + toMin(habit.endTime!)
  if (end <= start) end += 1440
  return { start, end }
}

function candidates(map: Map<string, Span[]>, key: string, habit: Habit, dateKey: string): Span[] {
  const goal = target(habit, dateKey)
  const from = goal.start - MATCH_MARGIN_MIN
  const to = (goal.end ?? goal.start) + MATCH_MARGIN_MIN
  const out: Span[] = []
  const firstDay = Math.floor(from / 1440) - 1
  for (let day = firstDay; day <= Math.floor(to / 1440); day++) {
    for (const span of map.get(`${key}|${day}`) ?? []) {
      if (span.start < to && span.end > from) out.push(span)
    }
  }
  return out
}

/** 目標からのずれ（分）。小さいほど、その日のその習慣の記録らしい */
function drift(habit: Habit, dateKey: string, span: Span): number {
  const goal = target(habit, dateKey)
  return Math.abs(span.start - goal.start) + (goal.end === null ? 0 : Math.abs(span.end - goal.end))
}

/**
 * その日の習慣の記録。習慣につながった記録を優先し、無ければ習慣と同じ名前の記録を使う
 * （習慣を作る前の記録や、タイマーで付けた記録）。目標の時間帯の前後 3 時間に重なるもののうち、いちばん近いもの
 */
export function habitRecordFor(index: HabitRecordIndex, habit: Habit, dateKey: string): Task | null {
  return habitRecordsFor(index, habit, dateKey)[0] ?? null
}

/** その日の習慣の記録を、目標に近い順に全部（チェックを外すときにまとめて消す） */
export function habitRecordsFor(index: HabitRecordIndex, habit: Habit, dateKey: string): Task[] {
  if (!isTimedHabit(habit)) return []
  const byDrift = (list: Span[]) =>
    list.sort((a, b) => drift(habit, dateKey, a) - drift(habit, dateKey, b)).map((s) => s.record)
  return [
    ...byDrift(candidates(index.active, linkKey(habit.id), habit, dateKey)),
    ...byDrift(candidates(index.active, titleKey(habit.title), habit, dateKey)),
  ]
}

/** 記録が習慣の目標時刻を守れたか。範囲は開始・終了の両方、時刻ひとつは開始だけを ±15 分で見る */
function isOnTime(habit: Habit, dateKey: string, record: Task): boolean {
  const span = recordSpan(record)
  if (!span) return false
  const goal = target(habit, dateKey)
  const within = (actual: number, want: number) => Math.abs(actual - want) <= HABIT_ON_TIME_TOLERANCE_MIN
  if (!within(span.start, goal.start)) return false
  if (goal.end !== null && !within(span.end, goal.end)) return false
  return true
}

export function habitDayStatus(habit: Habit, dateKey: string, index?: HabitRecordIndex): HabitDayStatus {
  const checked = habit.completedDates.includes(dateKey)
  if (!index || !isTimedHabit(habit)) return checked ? 'done' : 'missed'
  const record = habitRecordFor(index, habit, dateKey)
  // 記録があればチェックしていなくても判定する（チェックし忘れた日、習慣を作る前の記録）
  if (record) return isOnTime(habit, dateKey, record) ? 'done' : 'offTime'
  if (!checked) return 'missed'
  // 記録を消したら達成も消える。記録のない古いチェックは時刻が分からないので達成のまま
  return candidates(index.deleted, linkKey(habit.id), habit, dateKey).length > 0 ? 'missed' : 'done'
}

/** チェックで作る記録の時間。時刻ひとつの習慣は許容幅ぶんの長さにする */
export function plannedRecordTimes(habit: Habit): { startTime: string; endTime: string } | null {
  if (!isTimedHabit(habit)) return null
  const start = habit.startTime!
  if (habit.timeMode === 'range') return { startTime: start, endTime: habit.endTime! }
  const end = Math.min(toMin(start) + HABIT_ON_TIME_TOLERANCE_MIN, 23 * 60 + 59)
  return { startTime: start, endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` }
}
