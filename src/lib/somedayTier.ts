/**
 * いつかの 2 段（#221）: 「夢」（上）と「やりたい」（下）。段は利用者が作るセクションとは別で、アプリが持つ固定のもの。
 * 夢だけを `somedayTier: 'dream'` で持ち、持たないものはやりたい（新しく入れたものもやりたい）。
 * 夢は本体ではなく一歩（子）を To-Do にするので、行に次の一歩と進み具合（済んだ一歩 / 全部）を出す
 */
import type { Task } from '../types/task'
import { compareByOrder } from './orderCompare'
import { isActiveTask } from './taskLifecycle'

export type SomedayTier = 'dream' | 'wish'

/** いつかの段の見出し（ドラッグの落とし先）の id の頭（`tier::dream` / `tier::wish`） */
export const TIER_DROP_PREFIX = 'tier::'

export function parseTierDropId(id: string): SomedayTier | null {
  if (!id.startsWith(TIER_DROP_PREFIX)) return null
  const tier = id.slice(TIER_DROP_PREFIX.length)
  return tier === 'dream' || tier === 'wish' ? tier : null
}

/** やりたいの段の中の塊。`sectionId` が null はセクションの外の行（見出しを出さない） */
export type TierSection = { sectionId: string | null; title: string; tasks: Task[] }

/**
 * 未完了のルートを夢（カードで並べる。セクションで分けない）とやりたい（セクションの塊）に分ける（並びは `active` の順のまま、#429）。
 * やりたいは先頭がセクションの外の塊、続けて `sections` の順。`sections` が null（セクションで分けない）なら外の塊だけ
 */
export function tierSections(
  active: readonly Task[],
  sections: readonly { id: string; name: string }[] | null,
): { dream: Task[]; wish: TierSection[] } {
  const dream = active.filter((t) => somedayTierOf(t) === 'dream')
  const rows = active.filter((t) => somedayTierOf(t) === 'wish')
  const named = (sections ?? []).map((s) => ({ sectionId: s.id, title: s.name, tasks: rows.filter((t) => t.sectionId === s.id) }))
  const ids = new Set(named.map((b) => b.sectionId))
  const loose = rows.filter((t) => !t.sectionId || !ids.has(t.sectionId))
  return { dream, wish: [{ sectionId: null, title: '', tasks: loose }, ...named] }
}

/** 夢のカードに出す次の一歩の日付（予定の日、無ければ締切の日）。一歩が無い・日付が無ければ null */
export function stepDateKey(step: Pick<Task, 'scheduledDate' | 'dueDate'> | null): string | null {
  return step ? (step.scheduledDate ?? step.dueDate ?? null) : null
}

export function somedayTierOf(task: Pick<Task, 'somedayTier'>): SomedayTier {
  return task.somedayTier === 'dream' ? 'dream' : 'wish'
}

/** サーバー・バックアップの値を読む（`dream` のほかは持たない） */
export function readSomedayTier(raw: unknown): 'dream' | null {
  return raw === 'dream' ? 'dream' : null
}

/** 夢の行だけ項目を持つ形（やりたいは項目ごと持たない。同期で「変わった」と見ないため） */
export function withSomedayTier<T extends Task>(t: T, tier: SomedayTier | 'dream' | null | undefined): T {
  if (tier === 'dream') return t.somedayTier === 'dream' ? t : { ...t, somedayTier: 'dream' }
  if (!('somedayTier' in t)) return t
  const rest = { ...t }
  delete rest.somedayTier
  return rest
}

/** 夢の次の一歩（並び順で最初の、済んでいない子）と進み具合（済んだ子 / 全部）。一歩が無ければ null */
export function dreamSteps(tasks: readonly Task[], dreamId: string): { next: Task | null; done: number; total: number } | null {
  const steps = tasks.filter((t) => t.parentId === dreamId && isActiveTask(t)).sort(compareByOrder)
  if (steps.length === 0) return null
  const done = steps.filter((t) => t.completed).length
  return { next: steps.find((t) => !t.completed) ?? null, done, total: steps.length }
}

/** 前の版のデータ: いつかのリストの、一歩（子）を持つルートの行は夢にする（STORE_VERSION 41・`034`） */
export function withDreamsFromSteps(tasks: Task[], somedayListIds: ReadonlySet<string>): Task[] {
  const parents = new Set(tasks.filter((t) => t.parentId && !t.deletedAt).map((t) => t.parentId!))
  let changed = false
  const next = tasks.map((t) => {
    if (t.somedayTier || t.parentId || t.deletedAt || !somedayListIds.has(t.listId) || !parents.has(t.id)) return t
    changed = true
    return { ...t, somedayTier: 'dream' as const }
  })
  return changed ? next : tasks
}
