import type { CalendarEvent } from '../types/calendarEvent'
import { isLogTask, type Task } from '../types/task'
import { isPushedGoogleEvent } from './googlePush'
import { foldTitle } from './logCategory'

/**
 * 作成カード（`QuickCreatePopover`）の予定・To-Do の名前の候補と、名前から先に選ぶ色（#704）。
 * 予定はアプリの予定（To-Do でない予定）と Google の予定、To-Do は To-Do から引く（記録・睡眠は出さない）。
 * 名前は `foldTitle`（全角半角・大文字小文字・空白・カタカナとひらがなの違いを同じに数える）で比べる
 */
export type PlanKind = 'event' | 'todo'

export interface PlanTitleSuggestion {
  title: string
  /** 同じ名前の一番新しいものの色。色なしは null */
  color: string | null
}

interface Entry {
  title: string
  color: string | null
  /** 日付→開始→作った時刻（`inferEventDestination` と同じ順で新しいものを決める） */
  at: string
  count: number
}

/** Google の予定の、自分で付けた・似た予定から広がった色（カレンダーの色だけなら null） */
function googleOwnColor(e: CalendarEvent): string | null {
  if (!e.color) return null
  return e.ownColor || e.color !== e.baseColor ? e.color : null
}

function entriesByTitle(kind: PlanKind, tasks: readonly Task[], calendarEvents: readonly CalendarEvent[]): Map<string, Entry> {
  const out = new Map<string, Entry>()
  const offer = (title: string, color: string | null, at: string) => {
    const key = foldTitle(title)
    if (!key) return
    const e = out.get(key)
    if (!e) out.set(key, { title: title.trim(), color, at, count: 1 })
    else {
      e.count++
      if (at > e.at) Object.assign(e, { title: title.trim(), color, at })
    }
  }
  for (const t of tasks) {
    if (t.deletedAt || isLogTask(t) || (kind === 'event') !== (t.kind === 'event')) continue
    offer(t.title, t.color ?? null, `${t.scheduledDate ?? t.dueDate ?? ''} ${t.startTime ?? ''} ${t.createdAt}`)
  }
  if (kind === 'event') {
    for (const e of calendarEvents) {
      if (isPushedGoogleEvent(e) || e.skipped) continue
      offer(e.summary, googleOwnColor(e), `${e.date} ${e.startTime ?? ''}`)
    }
  }
  return out
}

/**
 * 打った名前に合う前の予定・To-Do の名前（最大 `limit` 件）。
 * 打った文字で始まるもの → 単語の頭が合うもの → 途中に含むもの。同じ段の中は回数の多い順 → 新しい順。
 * 空欄・打ったものと同じ名前は出さない（記録の名前の候補 `logTitleSuggestions` と同じ）
 */
export function planTitleSuggestions(
  kind: PlanKind,
  query: string,
  tasks: readonly Task[],
  calendarEvents: readonly CalendarEvent[],
  limit = 3,
): PlanTitleSuggestion[] {
  const q = foldTitle(query)
  if (!q) return []
  const rank = (key: string): number => {
    if (key === q) return -1
    if (key.startsWith(q)) return 0
    if (key.split(/[\s\p{P}\p{S}]+/u).some((w) => w.startsWith(q))) return 1
    return key.includes(q) ? 2 : -1
  }
  const hits: Array<{ r: number; e: Entry }> = []
  for (const [key, e] of entriesByTitle(kind, tasks, calendarEvents)) {
    const r = rank(key)
    if (r >= 0) hits.push({ r, e })
  }
  return hits
    .sort((a, b) => a.r - b.r || b.e.count - a.e.count || b.e.at.localeCompare(a.e.at))
    .slice(0, limit)
    .map(({ e }) => ({ title: e.title, color: e.color }))
}

/** 同じ名前の一番新しい予定・To-Do の色。同じ名前が無い・色なしなら null */
export function planColorForTitle(
  kind: PlanKind,
  title: string,
  tasks: readonly Task[],
  calendarEvents: readonly CalendarEvent[],
): string | null {
  const key = foldTitle(title)
  if (!key) return null
  return entriesByTitle(kind, tasks, calendarEvents).get(key)?.color ?? null
}
