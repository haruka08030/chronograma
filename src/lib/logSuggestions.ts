import { subDays } from 'date-fns'
import { isLogTask, isSleepTask, type Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { fromDateKey, toDateKey } from './dateKey'
import { timeToMinutes } from './clockTime'
import { foldTitle, frequentLogs, logTitleSuggestions, typicalMinutes, type LogTitleSuggestion } from './logCategory'

/** 何時から何時の記録か（タイマーなら始めた時刻〜今、後から記録なら始まり〜終わり） */
export interface LogWindow {
  dateKey: string
  start: string
  end: string
}

/** 記録の名前の候補の出どころ（予定はチェックで記録できるので出さない） */
export type LogSuggestionSource = 'log' | 'usual' | 'todo'

export interface LogSuggestion extends LogTitleSuggestion {
  source: LogSuggestionSource
  /** 選ぶとこの To-Do に紐づける（今日やる To-Do） */
  taskId?: string | null
  /** ラベル名の無い色（To-Do の色）。ラベルが決まらないときに記録の色にする */
  color?: string | null
}

export interface LogSuggestionInput {
  tasks: readonly Task[]
  query: string
  window: LogWindow | null
  /** 今日やる To-Do（未完了）。打った文字に合うものを出す */
  todos?: readonly Task[]
  /** To-Do の色 → ラベル（`logLabelFromTask`） */
  labelOf: (item: { color?: string | null }) => { category: string | null; color: string | null }
  limit?: number
  todayKey?: string
}

/** 「いつもやっていること」を見る範囲（週）・時刻の幅（分）・回数 */
const USUAL_WEEKS = 8
const USUAL_SLACK_MIN = 30
const USUAL_MIN_COUNT = 2

const minutesOf = (hm: string) => timeToMinutes(hm)

/** 同じ曜日・同じ時間帯（始まりの前後 30 分）に、直近 8 週で 2 回以上記録したもの。回数の多い順 */
function usualAt(tasks: readonly Task[], w: LogWindow): LogSuggestion[] {
  const day = fromDateKey(w.dateKey)
  const since = toDateKey(subDays(day, USUAL_WEEKS * 7))
  const at = minutesOf(w.start)
  const byTitle = new Map<string, { title: string; category: string | null; days: Set<string>; last: string; logs: Task[] }>()
  for (const t of tasks) {
    if (!isLogTask(t) || !isActiveTask(t) || isSleepTask(t) || !t.dueDate || !t.startTime || !t.title.trim()) continue
    if (t.dueDate < since || t.dueDate >= w.dateKey) continue
    if (fromDateKey(t.dueDate).getDay() !== day.getDay()) continue
    if (Math.abs(minutesOf(t.startTime) - at) > USUAL_SLACK_MIN) continue
    const key = foldTitle(t.title)
    const e = byTitle.get(key) ?? { title: t.title, category: t.category, days: new Set<string>(), last: '', logs: [] }
    e.days.add(t.dueDate)
    e.logs.push(t)
    if (t.dueDate > e.last) Object.assign(e, { title: t.title, category: t.category, last: t.dueDate })
    byTitle.set(key, e)
  }
  return [...byTitle.values()]
    .filter((e) => e.days.size >= USUAL_MIN_COUNT)
    .sort((a, b) => b.days.size - a.days.size || b.last.localeCompare(a.last))
    .map((e) => ({
      title: e.title,
      category: e.category,
      typicalMinutes: typicalMinutes(e.logs.sort((a, b) => b.dueDate!.localeCompare(a.dueDate!))),
      source: 'usual',
    }))
}

/**
 * 名前を打つ前の候補: その時間帯にいつもやっていること → 最近よく記録するもの（`frequentLogs` の並び）。
 * 同じ名前は先に出たものだけ、最大 `limit` 件
 */
export function emptyLogSuggestions(tasks: readonly Task[], window: LogWindow | null, limit = 3, todayKey?: string): LogSuggestion[] {
  const frequent = frequentLogs(tasks, limit + 3, todayKey).map((r): LogSuggestion => ({ ...r, typicalMinutes: null, source: 'log' }))
  return firstUnique([window ? usualAt(tasks, window) : [], frequent], limit)
}

/**
 * 記録の名前の候補。合わせて最大 `limit` 件、同じ名前は先に出たものだけ。
 * - 空欄: その時間帯にいつもやっていること → 最近よく記録するもの（`emptyLogSuggestions`）
 * - 打った後: 合う今日の To-Do（1 件まで）→ 合う過去の記録
 */
export function logSuggestions(input: LogSuggestionInput): LogSuggestion[] {
  const { query, window: w, limit = 3 } = input
  const q = foldTitle(query)
  if (!q) return emptyLogSuggestions(input.tasks, w, limit, input.todayKey)
  const lists: LogSuggestion[][] = []
  const todo = (input.todos ?? []).find((t) => foldTitle(t.title).includes(q) && foldTitle(t.title) !== q)
  if (todo) {
    lists.push([
      { ...input.labelOf(todo), title: todo.title, typicalMinutes: todo.estimateMinutes ?? null, source: 'todo', taskId: todo.id },
    ])
  }
  lists.push(logTitleSuggestions(input.tasks, query, limit, input.todayKey).map((s) => ({ ...s, source: 'log' as const })))
  return firstUnique(lists, limit)
}

function firstUnique(lists: LogSuggestion[][], limit: number): LogSuggestion[] {
  const seen = new Set<string>()
  const out: LogSuggestion[] = []
  for (const s of lists.flat()) {
    const key = foldTitle(s.title)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= limit) break
  }
  return out
}
