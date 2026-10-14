import { subDays } from 'date-fns'
import { isEventTask, isLogTask, isSleepTask, type Task } from '../types/task'
import type { CalendarEvent } from '../types/calendarEvent'
import { isActiveTask } from './taskLifecycle'
import { taskPlacementDate } from './taskTimeRange'
import { fromDateKey, toDateKey } from './dateKey'
import { timeToMinutes } from './clockTime'
import { foldTitle, logTitleSuggestions, typicalMinutes, type LogTitleSuggestion } from './logCategory'

/** 何時から何時の記録か（タイマーなら始めた時刻〜今、後から記録なら始まり〜終わり） */
export interface LogWindow {
  dateKey: string
  start: string
  end: string
}

/** 記録の名前の候補の出どころ */
export type LogSuggestionSource = 'log' | 'plan' | 'usual' | 'todo'

export interface LogSuggestion extends LogTitleSuggestion {
  source: LogSuggestionSource
  /** 選ぶとこの To-Do に紐づける（予定に置いた To-Do と、今日やる To-Do） */
  taskId?: string | null
  /** ラベル名の無い色（予定の色）。ラベルが決まらないときに記録の色にする */
  color?: string | null
  /** 予定の時刻（後から記録で選ぶと、記録の時刻をこれにする） */
  startTime?: string | null
  endTime?: string | null
}

export interface LogSuggestionInput {
  tasks: readonly Task[]
  events: readonly CalendarEvent[]
  query: string
  window: LogWindow | null
  /** 今日やる To-Do（未完了）。打った文字に合うものを出す */
  todos?: readonly Task[]
  /** 予定・To-Do の色 → ラベル（`logLabelFromTask`） */
  labelOf: (item: { color?: string | null }) => { category: string | null; color: string | null }
  limit?: number
  todayKey?: string
}

/** 「いつもやっていること」を見る範囲（週）・時刻の幅（分）・回数 */
const USUAL_WEEKS = 8
const USUAL_SLACK_MIN = 30
const USUAL_MIN_COUNT = 2

const minutesOf = (hm: string) => timeToMinutes(hm)

/** 予定 [s, e) が記録の時間に重なるか。時刻 1 点（タイマーを始めるとき）なら、その時刻を含むか */
function overlaps(s: string, e: string, w: LogWindow): boolean {
  const ps = minutesOf(s)
  // 0 時をまたぐ予定はその日のうちは終わらない
  const pe = minutesOf(e) > ps ? minutesOf(e) : 24 * 60
  const ws = minutesOf(w.start)
  const we = minutesOf(w.end)
  if (we <= ws) return ps <= ws && ws < pe
  return ps < we && pe > ws
}

/** 記録する時間に重なる予定（アプリの予定・時間を決めた To-Do・Google の予定）。始まりの早い順 */
function plansIn(input: LogSuggestionInput, w: LogWindow): LogSuggestion[] {
  const out: LogSuggestion[] = []
  for (const t of input.tasks) {
    if (!isActiveTask(t) || isLogTask(t) || t.completed || !t.startTime || !t.endTime) continue
    if (taskPlacementDate(t) !== w.dateKey || !overlaps(t.startTime, t.endTime, w)) continue
    out.push({
      ...input.labelOf(t),
      title: t.title,
      typicalMinutes: null,
      source: 'plan',
      // 予定（授業・バイト）は To-Do ではないので紐づけない。時間を決めた To-Do は紐づける
      taskId: isEventTask(t) ? null : t.id,
      startTime: t.startTime,
      endTime: t.endTime,
    })
  }
  for (const ev of input.events) {
    if (ev.isAllDay || ev.date !== w.dateKey || !ev.startTime || !ev.endTime || !ev.summary.trim()) continue
    if (!overlaps(ev.startTime, ev.endTime, w)) continue
    out.push({
      ...input.labelOf(ev),
      title: ev.summary,
      typicalMinutes: null,
      source: 'plan',
      startTime: ev.startTime,
      endTime: ev.endTime,
    })
  }
  return out.sort((a, b) => a.startTime!.localeCompare(b.startTime!))
}

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
 * 記録の名前の候補。合わせて最大 `limit` 件、同じ名前は先に出たものだけ。
 * - 空欄: 記録する時間に重なる予定 → その時間帯にいつもやっていること
 * - 打った後: 合う予定 → 合う今日の To-Do（1 件まで）→ 合う過去の記録
 */
export function logSuggestions(input: LogSuggestionInput): LogSuggestion[] {
  const { query, window: w, limit = 3 } = input
  const q = foldTitle(query)
  const lists: LogSuggestion[][] = []
  const plans = w ? plansIn(input, w) : []
  if (!q) {
    lists.push(plans)
    if (w) lists.push(usualAt(input.tasks, w))
  } else {
    lists.push(plans.filter((p) => foldTitle(p.title).includes(q) && foldTitle(p.title) !== q))
    const todo = (input.todos ?? []).find((t) => foldTitle(t.title).includes(q) && foldTitle(t.title) !== q)
    if (todo) {
      lists.push([
        { ...input.labelOf(todo), title: todo.title, typicalMinutes: todo.estimateMinutes ?? null, source: 'todo', taskId: todo.id },
      ])
    }
    lists.push(logTitleSuggestions(input.tasks, query, limit, input.todayKey).map((s) => ({ ...s, source: 'log' as const })))
  }
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
