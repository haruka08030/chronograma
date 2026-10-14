import { isLogTask, isSleepTask, type Task } from '../types/task'
import { subDays } from 'date-fns'
import { fromDateKey, toDateKey } from './dateKey'
import { isActiveTask } from './taskLifecycle'
import { appTodayKey } from './timeZone'
import { durationMinutesForTaskSlot } from './taskTimeRange'

const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase()

function logStamp(t: Task): string {
  return `${t.dueDate ?? ''} ${t.startTime ?? ''} ${t.createdAt}`
}

/** タイトルを単語に分ける（記号・空白で区切り、英字と数字の境目も切る。数字だけ・1 文字の英字は捨てる） */
export function titleTokens(title: string): string[] {
  const out = new Set<string>()
  for (const part of norm(title).split(/[\s\p{P}\p{S}]+/u)) {
    for (const tok of part.split(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/)) {
      if (!tok || /^\d+$/.test(tok)) continue
      if (/^[a-z]$/.test(tok)) continue
      out.add(tok)
    }
  }
  return [...out]
}

export interface InferLogCategoryOptions {
  /** 「今日の計画」の ▶ などから始めた記録の元タスク */
  sourceTaskId?: string | null
  /** Google の予定から記録にしたときの予定の色（`#RRGGBB`） */
  colorHex?: string | null
  /** 分類名 → 色の hex（Google の色から分類を引く用） */
  categoryHexes?: ReadonlyArray<readonly [name: string, hex: string]>
  /** タイトルとの一致を見ない分類名（「バナナ」など色の名前のままの分類） */
  colorNames?: ReadonlySet<string>
}

/**
 * 分類を付けずに記録したときの推定（毎回選ばなくて済むように）。上から順に最初に決まったもの。
 * 1. 元タスクのタグ
 * 2. 同じタイトルで前回付けた分類（直した分類もここで学習される）
 * 3. 単語が重なる過去の記録の分類（「STAT HW#1」→「STAT 17」の分類）。重なりの多い分類、同点なら新しい方
 * 4. Google の予定の色と同じ色の分類
 * 5. タイトルに分類名が入っている（「就活 ES」→ 就活）
 */
export function inferLogCategory(tasks: readonly Task[], title: string, opts: InferLogCategoryOptions = {}): string | null {
  if (opts.sourceTaskId) {
    const src = tasks.find((t) => t.id === opts.sourceTaskId)
    // To-Do のタグは分類ではない。To-Do からはラベル（色）で引く
    if (src && isLogTask(src) && src.category) return src.category
    if (src && !isLogTask(src) && src.color) {
      const hex = src.color.toLowerCase()
      const hit = opts.categoryHexes?.find(([, h]) => h.toLowerCase() === hex)
      if (hit) return hit[0]
    }
  }
  const key = norm(title)
  if (!key) return null
  const logs = tasks.filter((t) => isLogTask(t) && isActiveTask(t) && !isSleepTask(t) && t.tags.length > 0)

  let best: Task | null = null
  for (const t of logs) {
    if (norm(t.title) !== key) continue
    if (!best || logStamp(t) > logStamp(best)) best = t
  }
  if (best) return best.category!

  const tokens = new Set(titleTokens(title))
  if (tokens.size > 0) {
    const votes = new Map<string, { score: number; stamp: string }>()
    for (const t of logs) {
      const shared = titleTokens(t.title).filter((x) => tokens.has(x)).length
      if (shared === 0) continue
      const cat = t.category!
      const v = votes.get(cat) ?? { score: 0, stamp: '' }
      v.score += shared
      const stamp = logStamp(t)
      if (stamp > v.stamp) v.stamp = stamp
      votes.set(cat, v)
    }
    let top: [string, { score: number; stamp: string }] | null = null
    for (const e of votes) {
      if (!top || e[1].score > top[1].score || (e[1].score === top[1].score && e[1].stamp > top[1].stamp)) top = e
    }
    if (top) return top[0]
  }

  if (opts.colorHex) {
    const hex = opts.colorHex.toLowerCase()
    const hit = opts.categoryHexes?.find(([, h]) => h.toLowerCase() === hex)
    if (hit) return hit[0]
  }

  for (const [name] of opts.categoryHexes ?? []) {
    if (opts.colorNames?.has(name)) continue
    const n = norm(name)
    if (n && key.includes(n)) return name
  }
  return null
}

export interface RecentLog {
  title: string
  category: string | null
}

/** よく使う記録を数える期間（日） */
const FREQUENT_LOG_DAYS = 30

/** 記録をタイトルごとにまとめ、直近 30 日に記録した回数が多い順、同数なら新しい順に並べる（30 日より前にしか無いものは後ろ） */
function logsByUse(tasks: readonly Task[], todayKey: string): Array<RecentLog & { key: string; logs: Task[] }> {
  const since = toDateKey(subDays(fromDateKey(todayKey), FREQUENT_LOG_DAYS - 1))
  const logs = tasks
    .filter((t) => isLogTask(t) && isActiveTask(t) && !isSleepTask(t) && t.title.trim())
    .sort((a, b) => logStamp(b).localeCompare(logStamp(a)))
  const byTitle = new Map<string, RecentLog & { key: string; logs: Task[]; count: number; order: number }>()
  for (const t of logs) {
    const key = norm(t.title)
    let e = byTitle.get(key)
    if (!e) {
      e = { title: t.title, category: t.category, key, logs: [], count: 0, order: byTitle.size }
      byTitle.set(key, e)
    }
    e.logs.push(t)
    if ((t.dueDate ?? '') >= since) e.count++
  }
  return [...byTitle.values()].sort((a, b) => b.count - a.count || a.order - b.order)
}

/**
 * よく使う記録（タイトルの重複を除く）。「今日」画面のワンタップ再開用。
 * 直近 30 日に記録した回数が多い順、同数なら新しい順。30 日より前にしか無いものはその後ろに新しい順
 */
export function frequentLogs(tasks: readonly Task[], limit = 4, todayKey: string = appTodayKey()): RecentLog[] {
  return logsByUse(tasks, todayKey)
    .slice(0, limit)
    .map(({ title, category }) => ({ title, category }))
}

/** 入力の突き合わせ用。カタカナはひらがなにそろえる（「すたでぃ」で「スタディ」も出す） */
export const foldTitle = (s: string) => norm(s).replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

export interface LogTitleSuggestion extends RecentLog {
  /** いつもの長さ（分、5 分単位）。長さの分かる記録が無ければ null */
  typicalMinutes: number | null
}

/** いつもの長さを見る記録の数（新しい順） */
const TYPICAL_LOG_SAMPLES = 10

/** 記録の長さの中央値（5 分単位、新しい順に並べた記録の先頭 10 件）。日をまたぐ記録も数える */
export function typicalMinutes(logs: readonly Task[]): number | null {
  const mins = logs
    .slice(0, TYPICAL_LOG_SAMPLES)
    .map((t) => durationMinutesForTaskSlot(t))
    .filter((m): m is number => m != null && m > 0)
    .sort((a, b) => a - b)
  if (mins.length === 0) return null
  const mid = mins.length / 2
  const median = mins.length % 2 ? mins[Math.floor(mid)]! : (mins[mid - 1]! + mins[mid]!) / 2
  return Math.max(5, Math.round(median / 5) * 5)
}

/**
 * 記録の名前を打っている間の候補（過去の記録。タイトルの重複は除く）。
 * 打った文字で始まるもの → 単語の頭が合うもの → 途中に含むもの。同じ段の中は `frequentLogs` と同じ並び。
 * 空欄・打ったものと同じタイトルは出さない
 */
export function logTitleSuggestions(
  tasks: readonly Task[],
  query: string,
  limit = 3,
  todayKey: string = appTodayKey(),
): LogTitleSuggestion[] {
  const q = foldTitle(query)
  if (!q) return []
  const rank = (title: string): number => {
    const f = foldTitle(title)
    if (f === q) return -1
    if (f.startsWith(q)) return 0
    if (f.split(/[\s\p{P}\p{S}]+/u).some((w) => w.startsWith(q))) return 1
    return f.includes(q) ? 2 : -1
  }
  const hits: Array<{ r: number; e: ReturnType<typeof logsByUse>[number] }> = []
  for (const e of logsByUse(tasks, todayKey)) {
    const r = rank(e.title)
    if (r >= 0) hits.push({ r, e })
  }
  return hits
    .sort((a, b) => a.r - b.r)
    .slice(0, limit)
    .map(({ e }) => ({ title: e.title, category: e.category, typicalMinutes: typicalMinutes(e.logs) }))
}

/** ラベル名も名前の無い色も無い記録（睡眠・ゴミ箱は除く）。「1 日を締める」と設定のラベルでまとめて付ける */
export function isUnlabeledLog(task: Task): boolean {
  return isLogTask(task) && isActiveTask(task) && !isSleepTask(task) && !task.category && !task.color
}
