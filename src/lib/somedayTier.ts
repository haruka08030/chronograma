/**
 * いつかの夢とやりたい（#221・#439）。夢は重い（人生レベル）もの、やりたいは気軽なもの。分けるのは眺め方を変えるため:
 * 夢はボード（タイル）で眺め、やりたいは棚（行）から選んで予定にする。
 * 夢だけを `somedayTier: 'dream'` で持ち、持たないものはやりたい。一歩（子）のある夢はタイルに次の一歩と進み具合を出す
 */
import type { Task } from '../types/task'
import { compareByOrder } from './orderCompare'
import { isActiveTask } from './taskLifecycle'

export type SomedayTier = 'dream' | 'wish'

/**
 * いつかの色: セクションの並び順で決める（データに色を持たせない、#439）。夢のタイル・絞り込みのチップに使う。
 * セクションの外（-1）はグレー
 */
export const SOMEDAY_SECTION_COLORS = ['#039BE5', '#8E24AA', '#F4511E', '#0B8043', '#F6BF26', '#E67C73', '#3F51B5', '#33B679'] as const
export const SOMEDAY_NO_SECTION_COLOR = '#616161'

export function somedaySectionColor(index: number): string {
  return index < 0 ? SOMEDAY_NO_SECTION_COLOR : SOMEDAY_SECTION_COLORS[index % SOMEDAY_SECTION_COLORS.length]!
}

/** 未完了のルートを夢とやりたいに分ける（並びは `active` の順のまま）。`sectionId` があればそのセクションのものだけ */
export function splitSomeday(active: readonly Task[], sectionId: string | null): { dreams: Task[]; wishes: Task[] } {
  const rows = sectionId ? active.filter((t) => t.sectionId === sectionId) : active
  return { dreams: rows.filter((t) => somedayTierOf(t) === 'dream'), wishes: rows.filter((t) => somedayTierOf(t) === 'wish') }
}

/** 夢のタイルに出す次の一歩の日付（予定の日、無ければ締切の日）。一歩が無い・日付が無ければ null */
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

/**
 * 夢の一歩（夢の下の子と、予定にして To-Do になった一歩 `dreamId`、#430）と進み具合（済んだ一歩 / 全部）。一歩が無ければ null。
 * 次の一歩は、予定にした済んでいない一歩（日付の早い順）を先に、無ければ夢の下の並び順で最初の済んでいない子。
 * 予定にした一歩は、済んでアーカイブしても数える（消したものは数えない）
 */
export function dreamSteps(tasks: readonly Task[], dreamId: string): { next: Task | null; done: number; total: number } | null {
  const children = tasks.filter((t) => t.parentId === dreamId && isActiveTask(t)).sort(compareByOrder)
  const linked = tasks
    .filter((t) => t.dreamId === dreamId && !t.deletedAt && t.parentId !== dreamId)
    .sort((a, b) => (stepDateKey(a) ?? '9999').localeCompare(stepDateKey(b) ?? '9999') || compareByOrder(a, b))
  const steps = [...linked, ...children]
  if (steps.length === 0) return null
  const done = steps.filter((t) => t.completed).length
  return { next: steps.find((t) => !t.completed) ?? null, done, total: steps.length }
}

/** 夢の一歩だった To-Do の、元の夢（いつかのリストで消していない夢のときだけ）。行に夢の名前を添えるのに使う */
export function dreamOfStep(tasks: readonly Task[], step: Pick<Task, 'dreamId'>, somedayListIds: ReadonlySet<string>): Task | null {
  if (!step.dreamId) return null
  const dream = tasks.find((t) => t.id === step.dreamId)
  return dream && !dream.deletedAt && dream.somedayTier === 'dream' && somedayListIds.has(dream.listId) ? dream : null
}

/** サーバー・バックアップの値を読む（空でない文字列のほかは持たない） */
export function readDreamId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

/** 夢の一歩だった行だけ項目を持つ形（同期で「変わった」と見ないため、持たない行は項目ごと無い） */
export function withDreamId<T extends Task>(t: T, dreamId: string | null | undefined): T {
  if (dreamId) return t.dreamId === dreamId ? t : { ...t, dreamId }
  if (!('dreamId' in t)) return t
  const rest = { ...t }
  delete rest.dreamId
  return rest
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
