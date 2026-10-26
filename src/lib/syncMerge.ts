import { taskKindFromFlags, type MovedPlan, type Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import type { Habit, HabitTimeOverrides } from '../types/habit'
import { sameValue } from './sameValue'
import { merge3ById, merge3Record } from './settingMerge'
import { MAX_MOVED_PLANS } from './movedPlans'
import { CANVAS_LIST_ID, isCanvasListId } from './canvasIds'
import { BUILTIN_NAMES, LEGACY_BUILTIN_LIST_NAMES } from '../locales/builtinNames'
import { reanchorTask } from './taskTimeZone'
import { appTimeZone } from './timeZone'
import { BASELINE_KEY_PREFIX, readStored, storedKeys, writeStored } from './dataStore'

export const SYNC_INBOX_LIST_ID = '__inbox__'

export interface SyncSnapshot {
  lists: TaskList[]
  tasks: Task[]
  habits: Habit[]
  sections: ListSection[]
}

/** 前回同期した時点の ID → updatedAt の epoch ms（updatedAt が無いものは 0） */
export interface SyncBaseline {
  lists: Record<string, number>
  tasks: Record<string, number>
  habits: Record<string, number>
  sections: Record<string, number>
  /**
   * 前回同期した時点の習慣ごとの達成日。達成日だけは行ごとの勝ち負けでなく日ごとに合わせる
   * （スマホで月曜・PC で火曜にチェックしたとき、どちらも残す）。古い控えには無い
   */
  habitDates?: Record<string, string[]>
  /** 前回同期した時点の習慣ごとの休みの日（休みのある習慣だけ）。達成日と同じく日ごとに合わせる。古い控えには無い */
  habitRestDates?: Record<string, string[]>
  /**
   * 前回同期した時点のタスクごとのタグ（タグのあるタスクだけ）。タグも集合として合わせる
   * （片方で足し、片方で外したとき、どちらも残す）。古い控えには無い
   */
  taskTags?: Record<string, string[]>
  /**
   * 前回同期した時点の習慣ごとの日ごとの時間（あるものだけ）。日ごとに合わせる
   * （スマホで月曜・PC で火曜の時間を動かしたとき、どちらも残す）。古い控えには無い
   */
  habitTimeOverrides?: Record<string, HabitTimeOverrides>
  /** 前回同期した時点の To-Do ごとの移した予定（あるものだけ）。元の日ごとに合わせる。古い控えには無い */
  taskMovedPlans?: Record<string, MovedPlan[]>
  /**
   * 前回同期した時点の、行ごと・項目ごとの値の短いハッシュ（値そのものは持たない。容量を食うため）。
   * 両方の端末で同じ行を変えたとき、変えた項目どうしなら両方を残すのに使う（スマホでタイトル・PC で完了）。古い控えには無い
   */
  fields?: { [K in SyncKind]?: { order: string[]; rows: Record<string, string> } }
  /**
   * サーバーの時計 − この端末の時計（ms）。送った行にサーバーが付けた時刻から測る。
   * 両方の端末で同じ項目を変えたとき、手元の編集時刻をサーバーの時計に直して比べる（時計が進んだ端末がいつも勝たないように）
   */
  clockOffsetMs?: number
}

type SyncKind = 'lists' | 'sections' | 'tasks' | 'habits'

/** 項目の値の短いハッシュ（FNV-1a 32 ビット）。同じかどうかだけ分かればよい */
export function fieldHash(value: unknown): string {
  const text = JSON.stringify(value ?? null)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** 比べない項目（どの行にもある識別子と時刻） */
const NOT_MERGED = new Set(['id', 'updatedAt'])

/**
 * 値のある行だけが持つ項目（毎週の予定の印・移した予定の控え・習慣の曜日ごとの時間と時間の目標と前の日の設定と種類とゴミ箱に入れた時刻・いつかの夢の段・ラベルの id）。前回同期のときにどの行も持っていなければ
 * 控えの並びに無いが、そのときの値は「無い」と分かっているので、無い値として比べる（新しいほうに任せると、手元で足した控えが消えていた）
 */
const ABSENT_WHEN_EMPTY = new Set([
  'series',
  'movedPlans',
  'weekdayTimes',
  'goalMinutes',
  'pastRules',
  'kind',
  'somedayTier',
  'dreamId',
  'labelId',
  'deletedAt',
])

function fieldsBaseline<T extends object>(rows: readonly T[]): { order: string[]; rows: Record<string, string> } {
  const keys = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r)) if (!NOT_MERGED.has(k)) keys.add(k)
  const order = [...keys].sort()
  const orderKey = order.join(',')
  const out: Record<string, string> = {}
  for (const r of rows) out[(r as { id: string }).id] = cachedRowHash(r, order, orderKey)
  return { order, rows: out }
}

/**
 * 行（オブジェクト）ごとの項目ハッシュの覚え（#257）。行は直さずに作り直すので、同じオブジェクトなら中身も同じ。
 * 1 分ごとの同期で、変わっていない行を毎回ハッシュし直さない
 */
const rowHashCache = new WeakMap<object, { orderKey: string; hash: string }>()

function cachedRowHash(row: object, order: readonly string[], orderKey: string = order.join(',')): string {
  const hit = rowHashCache.get(row)
  if (hit && hit.orderKey === orderKey) return hit.hash
  const hash = rowHash(row, order)
  rowHashCache.set(row, { orderKey, hash })
  return hash
}

/**
 * 前の版の控え（タスクの種類を isTimeLog・isSleep の 2 項目で持つ）を、kind 1 項目の並びに直す。
 * 直さないと、どの行も「前回同期の後に変えた」と読み違え、他端末で消した行を戻してしまう
 */
function withTaskKindField(f: { order: string[]; rows: Record<string, string> }): { order: string[]; rows: Record<string, string> } {
  const logAt = f.order.indexOf('isTimeLog')
  if (logAt < 0 || f.order.includes('kind')) return f
  const sleepAt = f.order.indexOf('isSleep')
  const order = [...f.order.filter((k) => k !== 'isTimeLog' && k !== 'isSleep'), 'kind'].sort()
  const yes = fieldHash(true)
  const rows: Record<string, string> = {}
  for (const [id, joined] of Object.entries(f.rows)) {
    const old = joined.split('.')
    const byKey = new Map(f.order.map((k, i) => [k, old[i]]))
    const kind = taskKindFromFlags(old[logAt] === yes, sleepAt >= 0 && old[sleepAt] === yes)
    byKey.set('kind', fieldHash(kind))
    rows[id] = order.map((k) => byKey.get(k)).join('.')
  }
  return { order, rows }
}

/** 控えと同じ並びの項目ハッシュ（`fieldsBaseline` の 1 行ぶんと比べられる形） */
function rowHash(row: object, order: readonly string[]): string {
  const rec = row as Record<string, unknown>
  return order.map((k) => fieldHash(rec[k])).join('.')
}

/** 両方の端末で別々に直したメモの区切り（下が負けたほうの版） */
export const MEMO_CONFLICT_SEPARATOR = '\n\n―― ―― ――\n'

/** 両方が変えたメモ。一方がもう一方を含む（書き足した）なら長いほう、違えば新しいほうの下に古いほうを残す */
export function mergeMemo(l: string, r: string, winner: 'l' | 'r'): string {
  if (l.includes(r)) return l
  if (r.includes(l)) return r
  const [win, lose] = winner === 'r' ? [r, l] : [l, r]
  return `${win}${MEMO_CONFLICT_SEPARATOR}${lose}`
}

/**
 * タスクのタグを集合として合わせる（`mergeHabitDates` と同じ）。前回同期にあって片方で外したタグは外し、
 * 片方で足したタグは残す。並びは手元の並びのあとにサーバーにしか無いものを足す。控えにタグの記録が無ければ（古い控え）何もしない
 */
export function mergeTaskTags(
  merged: Task[],
  local: readonly Task[],
  remote: readonly Task[],
  baseTags: Record<string, string[]> | undefined,
  nowIso: string = new Date().toISOString(),
): Task[] {
  if (!baseTags) return merged
  const localById = new Map(local.map((t) => [t.id, t]))
  const remoteById = new Map(remote.map((t) => [t.id, t]))
  return merged.map((t) => {
    const l = localById.get(t.id)
    const r = remoteById.get(t.id)
    if (!l || !r) return t
    const base = new Set(baseTags[t.id] ?? [])
    const ls = new Set(l.tags)
    const rs = new Set(r.tags)
    const tags = [...l.tags, ...r.tags.filter((x) => !ls.has(x))].filter((x) => !(base.has(x) && (!ls.has(x) || !rs.has(x))))
    const same = tags.length === t.tags.length && tags.every((x, i) => x === t.tags[i])
    return same ? t : { ...t, tags, updatedAt: nowIso }
  })
}

/**
 * 両方の端末で変わった 1 行を項目ごとに合わせる。前回同期から片方だけが変えた項目はその側の値、
 * 両方が変えた項目（と前回の値が分からない項目）は新しいほうの値。
 * どちらが新しいかは、手元の編集時刻をサーバーの時計に直して（`clockOffsetMs`）サーバーの updatedAt と比べる。
 * 全部の項目がサーバー側なら行をそのまま（updatedAt もサーバーの値）、全部が手元側なら手元の行。
 * 両方から取ったときは updatedAt を今にする（送るとサーバーが時刻を付け直す）。
 * 前回の値が分かっていて両方が別の値に変えた項目を新しいほうにしたとき（片方の編集を捨てた）は `onConflict` に項目名を渡す（#357）
 */
function mergeRow<T extends { id: string }>(
  l: T,
  r: T,
  base: { order: string[]; hashes: string[] } | null,
  stamp: (x: T) => number,
  nowIso: string,
  clockOffsetMs: number,
  onConflict?: (field: string) => void,
): T {
  if (!base) return stamp(r) > stamp(l) ? r : l
  const winner = stamp(r) > stamp(l) + clockOffsetMs ? r : l
  const lr = l as unknown as Record<string, unknown>
  const rr = r as unknown as Record<string, unknown>
  const baseByKey = new Map(base.order.map((k, i) => [k, base.hashes[i]]))
  const out: Record<string, unknown> = { ...(winner as unknown as Record<string, unknown>) }
  let fromLocal = false
  let fromRemote = false
  for (const k of new Set([...Object.keys(lr), ...Object.keys(rr)])) {
    if (NOT_MERGED.has(k) || lr[k] === rr[k]) continue
    const lh = fieldHash(lr[k])
    const rh = fieldHash(rr[k])
    if (lh === rh) continue
    const bh = baseByKey.get(k) ?? (ABSENT_WHEN_EMPTY.has(k) ? fieldHash(undefined) : undefined)
    // メモを両方の端末で変えた: 新しいほうに、もう一方の版を消さずに下へ足す（書き足しどうしなら長いほう）
    if (k === 'description' && bh !== undefined && lh !== bh && rh !== bh && typeof lr[k] === 'string' && typeof rr[k] === 'string') {
      out[k] = mergeMemo(lr[k] as string, rr[k] as string, winner === r ? 'r' : 'l')
      fromLocal = true
      fromRemote = true
      continue
    }
    let take: 'l' | 'r' | null = null
    if (bh !== undefined && lh === bh) take = 'r'
    else if (bh !== undefined && rh === bh) take = 'l'
    if (!take) {
      take = winner === r ? 'r' : 'l'
      if (bh !== undefined) onConflict?.(k)
    }
    out[k] = take === 'r' ? rr[k] : lr[k]
    if (take === 'l') fromLocal = true
    else fromRemote = true
  }
  // どの項目も同じで時刻も同じ: 手元の行のまま（取得し直した行に替えると、次の同期でまた全部を比べ直す、#257）
  if (!fromLocal && !fromRemote && lr.updatedAt === rr.updatedAt) return l
  if (!fromLocal) return r
  if (!fromRemote) return l
  out.updatedAt = nowIso
  return out as unknown as T
}

/**
 * updatedAt を数値で比べる。ローカルは `…123Z`、Postgres は `…123+00:00` / マイクロ秒付きで返すため
 * 文字列比較だと同じ時刻でも大小がずれる
 */
function stampMs(iso: string | null | undefined): number {
  const n = iso ? Date.parse(iso) : NaN
  return Number.isFinite(n) ? n : 0
}

export interface SyncDeletes {
  lists: string[]
  tasks: string[]
  habits: string[]
  sections: string[]
}

interface MergeResult<T> {
  merged: T[]
  deleteRemote: string[]
}

/**
 * 1 種類ぶんの三方向マージ。
 * - 両方にある: updatedAt が新しい方（同じならローカル＝今見えているもの）
 * - ローカルだけ: 前回同期に含まれていた＝他端末で削除。ただしその後ローカルで編集していれば残す
 * - サーバーだけ: 前回同期に含まれていた＝この端末で削除。ただしその後他端末で編集されていれば戻す
 * - 前回同期に無い: 新規なので残す（他端末で追加したものを消さない）
 */
function mergeKind<T extends { id: string }>(
  local: readonly T[],
  remote: readonly T[],
  baseline: Record<string, number>,
  stamp: (x: T) => number,
  baseFields?: { order: string[]; rows: Record<string, string> },
  clockOffsetMs = 0,
  /** 中身を控えと比べる前にそろえる（タスクはこの端末のタイムゾーンの書き方に。控えも同じ書き方） */
  normalize: (x: T) => T = (x) => x,
  nowIso: string = new Date().toISOString(),
  onConflict?: (field: string) => void,
): MergeResult<T> {
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const localIds = new Set(local.map((l) => l.id))
  const merged: T[] = []
  const deleteRemote: string[] = []
  /**
   * 前回同期の後にこの行を変えたか。項目の控えがあれば中身で比べる（端末の時計がずれていても読み違えない）。
   * 無ければ前の動き（更新時刻が前回同期より新しいか）
   */
  const changedSinceBase = (x: T, base: number | undefined, byStamp: (x: T) => boolean) => {
    const hashes = baseFields?.rows[x.id]
    if (base === undefined || hashes === undefined || !baseFields) return byStamp(x)
    const n = normalize(x)
    if (cachedRowHash(n, baseFields.order) !== hashes) return true
    // 控えを取った後に増えた項目は、値が入っていれば変えたものとみなす
    const known = new Set(baseFields.order)
    return Object.entries(n).some(([k, v]) => !NOT_MERGED.has(k) && !known.has(k) && v != null)
  }

  for (const l of local) {
    const r = remoteById.get(l.id)
    if (r) {
      // 控え・サーバーの行と同じ書き方にそろえて比べる。手元のほうを丸ごと使うなら手元の行そのもの
      const ln = normalize(l)
      // 同じオブジェクト（前回送った・取り込んだまま）なら中身も同じ。項目ごとに比べない（#257）
      if (ln === r) {
        merged.push(l)
        continue
      }
      const hashes = baseFields?.rows[l.id]
      const row = mergeRow(
        ln,
        r,
        hashes && baseFields ? { order: baseFields.order, hashes: hashes.split('.') } : null,
        stamp,
        nowIso,
        clockOffsetMs,
        onConflict,
      )
      merged.push(row === ln ? l : row)
      continue
    }
    const base = baseline[l.id]
    if (base === undefined || changedSinceBase(l, base, (x) => stamp(x) > base)) merged.push(l)
  }
  for (const r of remote) {
    if (localIds.has(r.id)) continue
    const base = baseline[r.id]
    // base 0 は「前回同期にあったが時刻が分からない」（更新時刻を持つ前の控え）。編集されたとはみなさず、この端末の削除を通す
    if (base === undefined || changedSinceBase(r, base, (x) => base > 0 && stamp(x) > base)) merged.push(r)
    else deleteRemote.push(r.id)
  }
  return { merged, deleteRemote }
}

/**
 * 習慣の達成日を日ごとに三方向で合わせる。どちらかにある日は残し、前回同期にあってどちらかで外した日は外す。
 * 前回同期の控えが無ければ両方を合わせる（外した日が戻ることはあっても、付けた日は消さない）。
 * 合わせた結果が勝った側と違えば `updatedAt` を今にして、ほかの端末にも行き渡らせる
 */
export function mergeHabitDates(
  merged: Habit[],
  local: readonly Habit[],
  remote: readonly Habit[],
  baseDates: Record<string, string[]> | undefined,
  nowIso: string = new Date().toISOString(),
): Habit[] {
  return mergeHabitDateSets(
    merged,
    local,
    remote,
    (h) => h.completedDates,
    baseDates,
    nowIso,
    (h, completedDates) => ({ ...h, completedDates }),
  )
}

/**
 * 習慣の休みの日を、達成日と同じく日ごとに三方向で合わせる（スマホで試験期間・PC で帰省を休みにしたとき、どちらも残す）。
 * 控えが無い（古い控え・前回は休みが無かった）なら両方を合わせる。1 日も残らなければ項目ごと外す
 */
export function mergeHabitRestDates(
  merged: Habit[],
  local: readonly Habit[],
  remote: readonly Habit[],
  baseDates: Record<string, string[]> | undefined,
  nowIso: string = new Date().toISOString(),
): Habit[] {
  return mergeHabitDateSets(
    merged,
    local,
    remote,
    (h) => h.restDates ?? [],
    baseDates,
    nowIso,
    (h, restDates) => {
      const out: Habit = { ...h, restDates }
      if (restDates.length === 0) delete out.restDates
      return out
    },
  )
}

function mergeHabitDateSets(
  merged: Habit[],
  local: readonly Habit[],
  remote: readonly Habit[],
  datesOf: (h: Habit) => readonly string[],
  baseDates: Record<string, string[]> | undefined,
  nowIso: string,
  withDates: (h: Habit, dates: string[]) => Habit,
): Habit[] {
  const localById = new Map(local.map((h) => [h.id, h]))
  const remoteById = new Map(remote.map((h) => [h.id, h]))
  return merged.map((h) => {
    const l = localById.get(h.id)
    const r = remoteById.get(h.id)
    if (!l || !r) return h
    const ld = new Set(datesOf(l))
    const rd = new Set(datesOf(r))
    const base = baseDates?.[h.id]
    const baseSet = base ? new Set(base) : null
    const dates = [...new Set([...ld, ...rd])].filter((d) => !(baseSet?.has(d) && (!ld.has(d) || !rd.has(d)))).sort()
    const current = [...datesOf(h)].sort()
    const same = dates.length === current.length && dates.every((d, i) => d === current[i])
    return same ? h : { ...withDates(h, dates), updatedAt: nowIso }
  })
}

/**
 * 両方にある行の、小さなものの集まりの項目（日ごとの時間・移した予定）を中身ごとに三方向で合わせる。
 * 片方だけが変えた日はその側、両方が別の値に変えた日は行ごとの合わせ方で勝った側（`merged` の行の値）。
 * 控え（`base`）が無ければ何もしない（古い控え。前の動きのまま）。合わせた結果が勝った側と違えば `updatedAt` を今にする
 */
function mergeRowParts<T extends { id: string; updatedAt?: string }, V>(
  merged: T[],
  local: readonly T[],
  remote: readonly T[],
  base: Record<string, V> | undefined,
  get: (x: T) => V | undefined,
  combine: (b: V | undefined, l: V | undefined, r: V | undefined, prefer: 'l' | 'r') => V | undefined,
  put: (x: T, v: V | undefined) => T,
  nowIso: string,
): T[] {
  if (!base) return merged
  const localById = new Map(local.map((x) => [x.id, x]))
  const remoteById = new Map(remote.map((x) => [x.id, x]))
  return merged.map((m) => {
    const l = localById.get(m.id)
    const r = remoteById.get(m.id)
    if (!l || !r) return m
    const lv = get(l)
    const rv = get(r)
    if (sameValue(lv, rv)) return m
    const next = combine(base[m.id], lv, rv, sameValue(get(m), lv) ? 'l' : 'r')
    return sameValue(next, get(m)) ? m : { ...put(m, next), updatedAt: nowIso }
  })
}

/** 習慣の日ごとの時間を日ごとに合わせる（`mergeRowParts`）。1 日も残らなければ項目ごと外す */
export function mergeHabitTimeOverrides(
  merged: Habit[],
  local: readonly Habit[],
  remote: readonly Habit[],
  base: Record<string, HabitTimeOverrides> | undefined,
  nowIso: string = new Date().toISOString(),
): Habit[] {
  return mergeRowParts(
    merged,
    local,
    remote,
    base,
    (h) => h.timeOverrides,
    (b, l, r, prefer) => {
      const out = merge3Record(b ?? {}, l ?? {}, r ?? {}, prefer)
      return Object.keys(out).length > 0 ? out : undefined
    },
    (h, timeOverrides) => {
      const out: Habit = { ...h, timeOverrides }
      if (!timeOverrides) delete out.timeOverrides
      return out
    },
    nowIso,
  )
}

/** To-Do の移した予定を元の日ごとに合わせる（`mergeRowParts`）。1 つも残らなければ項目ごと外す */
export function mergeTaskMovedPlans(
  merged: Task[],
  local: readonly Task[],
  remote: readonly Task[],
  base: Record<string, MovedPlan[]> | undefined,
  nowIso: string = new Date().toISOString(),
): Task[] {
  return mergeRowParts(
    merged,
    local,
    remote,
    base,
    (t) => t.movedPlans,
    (b, l, r, prefer) => {
      const out = merge3ById(b ?? [], l ?? [], r ?? [], (p) => p.date, prefer).slice(-MAX_MOVED_PLANS)
      return out.length > 0 ? out : undefined
    },
    (t, movedPlans) => {
      const out: Task = { ...t, movedPlans }
      if (!movedPlans) delete out.movedPlans
      return out
    },
    nowIso,
  )
}

/**
 * 両方の端末が同じ項目を別の値に変え、新しいほうに任せた（片方の編集を捨てた）回数。キーは `表.項目`（例 `tasks.title`）。
 * 値そのものは入れない。あとで集合として合わせ直す項目（控えのあるタスクのタグ・習慣の達成日）は捨てていないので数えない
 */
export type MergeConflictCounts = Record<string, number>

/** ローカル・サーバー・前回同期の 3 点から、両端末の変更を取りこぼさない状態を作る */
export function mergeSnapshots(
  local: SyncSnapshot,
  remote: SyncSnapshot,
  baseline: SyncBaseline,
): { merged: SyncSnapshot; deletes: SyncDeletes; conflicts: MergeConflictCounts } {
  const f = baseline.fields?.tasks ? { ...baseline.fields, tasks: withTaskKindField(baseline.fields.tasks) } : baseline.fields
  const off = baseline.clockOffsetMs ?? 0
  const conflicts: MergeConflictCounts = {}
  const count =
    (kind: SyncKind, ...skip: (string | undefined)[]) =>
    (field: string) => {
      if (skip.includes(field)) return
      const key = `${kind}.${field}`
      conflicts[key] = (conflicts[key] ?? 0) + 1
    }
  const nowIso = new Date().toISOString()
  const asIs = <T>(x: T) => x
  const lists = mergeKind(
    local.lists,
    remote.lists,
    baseline.lists,
    (l) => stampMs(l.updatedAt),
    f?.lists,
    off,
    asIs,
    nowIso,
    count('lists'),
  )
  const sections = mergeKind(
    local.sections,
    remote.sections,
    baseline.sections,
    (s) => stampMs(s.updatedAt),
    f?.sections,
    off,
    asIs,
    nowIso,
    count('sections'),
  )
  // タスクの時刻は端末のタイムゾーンで書き方が違う。項目ごとに比べる前に、サーバーの行をこの端末の書き方にそろえる
  // （タイムゾーンは 1 回だけ読む。端末のタイムゾーンは読むたびに Intl を作るので、行ごとに読むと 1 万行で 1 秒近くかかっていた、#257）
  const zone = appTimeZone()
  const tasks = mergeKind(
    local.tasks,
    remote.tasks.map((t) => reanchorTask(t, zone)),
    baseline.tasks,
    (t) => stampMs(t.updatedAt),
    f?.tasks,
    off,
    (t) => reanchorTask(t, zone),
    nowIso,
    count('tasks', baseline.taskTags ? 'tags' : undefined, baseline.taskMovedPlans ? 'movedPlans' : undefined),
  )
  tasks.merged = mergeTaskTags(tasks.merged, local.tasks, remote.tasks, baseline.taskTags)
  tasks.merged = mergeTaskMovedPlans(tasks.merged, local.tasks, remote.tasks, baseline.taskMovedPlans, nowIso)
  const habits = mergeKind(
    local.habits,
    remote.habits,
    baseline.habits,
    (h) => stampMs(h.updatedAt),
    f?.habits,
    off,
    asIs,
    nowIso,
    count('habits', 'completedDates', 'restDates', baseline.habitTimeOverrides ? 'timeOverrides' : undefined),
  )
  habits.merged = mergeHabitDates(habits.merged, local.habits, remote.habits, baseline.habitDates)
  habits.merged = mergeHabitRestDates(habits.merged, local.habits, remote.habits, baseline.habitRestDates, nowIso)
  habits.merged = mergeHabitTimeOverrides(habits.merged, local.habits, remote.habits, baseline.habitTimeOverrides, nowIso)

  // 片方で消えた親を参照していると外部キーで push が落ちるので付け替える
  const listIds = new Set(lists.merged.map((l) => l.id))
  if (!listIds.has(SYNC_INBOX_LIST_ID)) {
    const inbox = local.lists.find((l) => l.id === SYNC_INBOX_LIST_ID) ?? remote.lists.find((l) => l.id === SYNC_INBOX_LIST_ID)
    if (inbox) {
      lists.merged.push(inbox)
      listIds.add(SYNC_INBOX_LIST_ID)
    }
  }
  // 消えたリストの付け替え先。Canvas の古いリスト（学校ごと）は Canvas のリストへ（未分類に課題を散らさない）
  const fallbackList = (listId: string) => (isCanvasListId(listId) && listIds.has(CANVAS_LIST_ID) ? CANVAS_LIST_ID : SYNC_INBOX_LIST_ID)
  const mergedSections = sections.merged
    .map((s) => (listIds.has(s.listId) || fallbackList(s.listId) !== CANVAS_LIST_ID ? s : { ...s, listId: CANVAS_LIST_ID }))
    .filter((s) => listIds.has(s.listId))
  // 消えたリストのセクションがサーバーに残っていると、リストの削除が外部キー（on delete no action）で通らない。一緒に消す
  const keptSectionIds = new Set(mergedSections.map((s) => s.id))
  const remoteSectionIds = new Set(remote.sections.map((s) => s.id))
  const orphanSections = sections.merged.filter((s) => !keptSectionIds.has(s.id) && remoteSectionIds.has(s.id)).map((s) => s.id)
  const sectionListById = new Map(mergedSections.map((s) => [s.id, s.listId]))
  const taskIds = new Set(tasks.merged.map((t) => t.id))
  const mergedTasks = tasks.merged.map((t) => {
    const listOk = listIds.has(t.listId)
    const listId = listOk ? t.listId : fallbackList(t.listId)
    const sectionList = t.sectionId == null ? undefined : sectionListById.get(t.sectionId)
    const sectionOk = t.sectionId == null || (sectionList !== undefined && (listOk || sectionList === listId))
    const parentOk = t.parentId == null || taskIds.has(t.parentId)
    if (listOk && sectionOk && parentOk) return t
    return {
      ...t,
      listId,
      sectionId: sectionOk ? t.sectionId : null,
      parentId: parentOk ? t.parentId : null,
    }
  })

  return {
    merged: { lists: lists.merged, sections: mergedSections, tasks: mergedTasks, habits: habits.merged },
    deletes: {
      lists: lists.deleteRemote.filter((id) => id !== SYNC_INBOX_LIST_ID),
      sections: [...sections.deleteRemote, ...orphanSections],
      tasks: tasks.deleteRemote,
      habits: habits.deleteRemote,
    },
    conflicts,
  }
}

/**
 * 前回同期が無いとき（この端末で初めて・前回同期の保存に失敗した）のマージ。
 * どちらで消したかは分からないので、両方にあるものを残す（同じ id は新しい方）。
 * サーバーで丸ごと置き換えると、push できずに手元にだけあった変更が消える
 */
export function mergeWithoutBaseline(local: SyncSnapshot, remote: SyncSnapshot): SyncSnapshot {
  const empty: SyncBaseline = { lists: {}, sections: {}, tasks: {}, habits: {} }
  return mergeSnapshots(local, remote, empty).merged
}

/** 1 回の同期で消すサーバーの行がこれより多く、かつ種類ごとの行の `MASS_DELETE_RATIO` を超えたら、消す前に確かめる */
export const MASS_DELETE_MIN_ROWS = 5
export const MASS_DELETE_RATIO = 0.3

/**
 * 1 回の同期でサーバーの行を大量に消すか（#484）。消す前に確かめる（読めなかった行・取り違えた控えで、全端末から消さないように）。
 * 数えるのはゴミ箱に入っていない行だけ（30 日たったゴミ箱の片付け・ゴミ箱を空にするのは、もう消したものなので聞かない）。
 * 手元に行が 1 つも無いのに前回同期の控えに行があり、サーバーの行を消すときも確かめる
 */
export function isMassDelete(local: SyncSnapshot, remote: SyncSnapshot, baseline: SyncBaseline, deletes: SyncDeletes): boolean {
  const live = <T extends { id: string; deletedAt?: string | null }>(rows: readonly T[]) => rows.filter((r) => !r.deletedAt)
  const remoteLive = {
    lists: remote.lists.filter((l) => l.id !== SYNC_INBOX_LIST_ID),
    sections: remote.sections,
    tasks: live(remote.tasks),
    habits: remote.habits,
  }
  let total = 0
  for (const kind of ['lists', 'sections', 'tasks', 'habits'] as const) {
    const ids = new Set(deletes[kind])
    const rows = remoteLive[kind] as readonly { id: string }[]
    const n = rows.filter((r) => ids.has(r.id)).length
    if (n > MASS_DELETE_MIN_ROWS && n > rows.length * MASS_DELETE_RATIO) return true
    total += n
  }
  const localEmpty = local.tasks.length + local.habits.length + local.sections.length === 0
  const baselineHasRows =
    Object.keys(baseline.tasks).length + Object.keys(baseline.habits).length + Object.keys(baseline.sections).length > 0
  return localEmpty && baselineHasRows && total > 0
}

/** 最初から作る「いつか」「買い物」の id。どの端末・どの言語で作っても同じ id にして、同期で 2 つにならないように */
export const DEFAULT_LIST_IDS = { someday: 'default-someday', checklist: 'default-shopping' } as const

/**
 * 前の版の初期リストの名前（どの言語で作られたか分からないので、全部の言語の名前）。
 * 前の版は初期リストを言語ごとの名前・ばらばらの id で作っていた
 */
const LEGACY_DEFAULT_NAMES = new Set<string>([
  ...Object.values(BUILTIN_NAMES).flatMap((n) => [n.someday, n.shopping]),
  ...LEGACY_BUILTIN_LIST_NAMES,
])

/**
 * ログインせずに使っていた端末の初回同期で、最初から作られる「いつか」「買い物」が
 * アカウントにもあると 2 つずつになっていた。中身の無い初期リストで、アカウントに同じ種類のリストがあれば、手元のほうを外す。
 * 初期リストかどうかは id（今の版）か、どれかの言語の初期の名前（前の版）で見分ける（日本語と英語の端末でも二重にしない）
 */
export function withoutDuplicateDefaults(local: SyncSnapshot, remote: SyncSnapshot): SyncSnapshot {
  const used = new Set([...local.tasks.map((t) => t.listId), ...local.sections.map((s) => s.listId)])
  const lists = local.lists.filter((l) => {
    if (l.id === SYNC_INBOX_LIST_ID || used.has(l.id)) return true
    if (l.kind !== 'someday' && l.kind !== 'checklist') return true
    const isDefault = (Object.values(DEFAULT_LIST_IDS) as string[]).includes(l.id) || LEGACY_DEFAULT_NAMES.has(l.name)
    if (!isDefault) return true
    return !remote.lists.some((r) => r.id !== l.id && r.kind === l.kind)
  })
  return lists.length === local.lists.length ? local : { ...local, lists }
}

export function baselineFrom(s: SyncSnapshot): SyncBaseline {
  const zone = appTimeZone()
  const ids = <T extends { id: string }>(xs: readonly T[], stamp: (x: T) => number) => Object.fromEntries(xs.map((x) => [x.id, stamp(x)]))
  return {
    lists: ids(s.lists, (l) => stampMs(l.updatedAt)),
    sections: ids(s.sections, (sec) => stampMs(sec.updatedAt)),
    tasks: ids(s.tasks, (t) => stampMs(t.updatedAt)),
    habits: ids(s.habits, (h) => stampMs(h.updatedAt)),
    habitDates: Object.fromEntries(s.habits.map((h) => [h.id, [...h.completedDates]])),
    habitRestDates: Object.fromEntries(s.habits.filter((h) => h.restDates).map((h) => [h.id, [...h.restDates!]])),
    taskTags: Object.fromEntries(s.tasks.filter((t) => t.tags.length > 0).map((t) => [t.id, [...t.tags]])),
    habitTimeOverrides: Object.fromEntries(s.habits.filter((h) => h.timeOverrides).map((h) => [h.id, { ...h.timeOverrides! }])),
    taskMovedPlans: Object.fromEntries(s.tasks.filter((t) => t.movedPlans).map((t) => [t.id, [...t.movedPlans!]])),
    fields: {
      lists: fieldsBaseline(s.lists),
      sections: fieldsBaseline(s.sections),
      // 控えもこの端末のタイムゾーンの書き方で（比べるときにそろえた行と同じ書き方にする）
      tasks: fieldsBaseline(s.tasks.map((t) => reanchorTask(t, zone))),
      habits: fieldsBaseline(s.habits),
    },
  }
}

const SNAPSHOT_KEY = { lists: 'lists', list_sections: 'sections', tasks: 'tasks', habits: 'habits' } as const

/**
 * 送り終えた内容から、前回同期の控えにするものを作る。サーバーに拒否された行は届いていないので、
 * サーバーにあった版にする（無ければ控えに入れない）。送れた扱いで控えに入れると、次の同期で
 * 「控えにあってサーバーに無い＝他の端末で消された」と読んで手元から消してしまう
 */
export function syncedSnapshot(
  pushed: SyncSnapshot,
  remote: SyncSnapshot,
  rejected: readonly { table: keyof typeof SNAPSHOT_KEY; id: string; op: 'upsert' | 'delete' }[],
): SyncSnapshot {
  const ups = rejected.filter((r) => r.op === 'upsert')
  if (ups.length === 0) return pushed
  const out: SyncSnapshot = { ...pushed }
  for (const key of ['lists', 'sections', 'tasks', 'habits'] as const) {
    const ids = new Set(ups.filter((r) => SNAPSHOT_KEY[r.table] === key).map((r) => r.id))
    if (ids.size === 0) continue
    const remoteById = new Map<string, { id: string }>(remote[key].map((x) => [x.id, x]))
    const items = pushed[key] as { id: string }[]
    out[key] = items.flatMap((x) => (ids.has(x.id) ? (remoteById.has(x.id) ? [remoteById.get(x.id)!] : []) : [x])) as never
  }
  return out
}

/**
 * 送った行にサーバーが付けた更新時刻を、送った内容（`pushed`）に入れる。控えにはこちらを使う
 * （次の同期でサーバーの行と同じ時刻になり、送り直さない）
 */
export function withServerStamps(
  pushed: SyncSnapshot,
  written: readonly { table: keyof typeof SNAPSHOT_KEY; id: string; updatedAt: string }[],
): SyncSnapshot {
  if (written.length === 0) return pushed
  const out: SyncSnapshot = { ...pushed }
  for (const key of ['lists', 'sections', 'tasks', 'habits'] as const) {
    const stamps = new Map(written.filter((w) => SNAPSHOT_KEY[w.table] === key).map((w) => [w.id, w.updatedAt]))
    if (stamps.size === 0) continue
    const items = pushed[key] as { id: string; updatedAt?: string }[]
    out[key] = items.map((x) => (stamps.has(x.id) ? { ...x, updatedAt: stamps.get(x.id)! } : x)) as never
  }
  return out
}

/**
 * 手元の内容（`current`）のうち、送ったときから変わっていない行（同じオブジェクト）を、サーバーの時刻を入れた行（`stamped`）に替える。
 * 送っている間に編集した行は手元のまま（次の同期で送る）。替えるものが無い種類は配列をそのまま返す
 */
export function adoptServerStamps(current: SyncSnapshot, pushed: SyncSnapshot, stamped: SyncSnapshot): SyncSnapshot {
  const out: SyncSnapshot = { ...current }
  for (const key of ['lists', 'sections', 'tasks', 'habits'] as const) {
    if (pushed[key] === stamped[key]) continue
    const before = new Map((pushed[key] as { id: string }[]).map((x) => [x.id, x]))
    const after = new Map((stamped[key] as { id: string }[]).map((x) => [x.id, x]))
    let changed = false
    const next = (current[key] as { id: string }[]).map((x) => {
      const y = after.get(x.id)
      if (before.get(x.id) !== x || !y || y === x) return x
      changed = true
      return y
    })
    if (changed) out[key] = next as never
  }
  return out
}

const baselineKey = (userId: string) => `${BASELINE_KEY_PREFIX}${userId}`

/**
 * 最後に読んだ・書いた控え（#257）。置き場所の文字列が同じなら JSON.parse し直さない（1 回の同期で何度も読む）。
 * 返す控えは呼ぶ側で書き換えない
 */
let parsedBaseline: { key: string; raw: string; value: SyncBaseline } | null = null

export function loadBaseline(userId: string): SyncBaseline | null {
  try {
    const key = baselineKey(userId)
    const raw = readStored(key)
    if (!raw) return null
    if (parsedBaseline && parsedBaseline.key === key && parsedBaseline.raw === raw) return parsedBaseline.value
    const value = JSON.parse(raw) as SyncBaseline
    parsedBaseline = { key, raw, value }
    return value
  } catch {
    return null
  }
}

/** この端末で、ほかの人として同期したことがあるか（前回同期の控えが残っているか。控えと同じ置き場所を見る） */
export function hasOtherUsersBaseline(userId: string): boolean {
  try {
    return storedKeys().some((key) => key.startsWith(BASELINE_KEY_PREFIX) && key !== baselineKey(userId))
  } catch {
    /* 読めなければ、無いものとして扱う */
  }
  return false
}

export function clearBaseline(userId: string) {
  try {
    writeStored(baselineKey(userId), null)
  } catch {
    /* ignore */
  }
}

/**
 * 前回同期の控えを保存し、保存できたかを返す。保存できなければ前の控えを消す
 * （古い控えが残ると、それより後に合わせた項目を「この端末で変えた」と読み、他の端末の新しい値を上書きしていた）。
 * 控えが無ければ次の同期は初回と同じ、両方を残す合わせ方になる。
 * IndexedDB では書けたかが後から分かる（同じタスクの間に書いた本体と 1 つのトランザクション）。そのときは true を返し、
 * 書けなかったら控えを消して `onLaterFailure` を呼ぶ
 */
export function saveBaseline(userId: string, baseline: SyncBaseline, onLaterFailure?: (err: unknown) => void): boolean {
  try {
    const key = baselineKey(userId)
    const raw = JSON.stringify(baseline)
    parsedBaseline = { key, raw, value: baseline }
    writeStored(key, raw, {
      onError: (err) => {
        console.error('[sync] could not save the baseline; falling back to a first-sync merge next time', err)
        clearBaseline(userId)
        onLaterFailure?.(err)
      },
    })
    return true
  } catch (err) {
    console.error('[sync] could not save the baseline; falling back to a first-sync merge next time', err)
    clearBaseline(userId)
    return false
  }
}

/** 最後に控えを作った同期の内容（配列そのもの）と時計のずれ、書いた文字列 */
let savedFrom: (SyncSnapshot & { key: string; raw: string; clockOffsetMs: number | undefined }) | null = null

/**
 * 同期し終えた内容から控えを作って保存する（`saveBaseline`）。前回控えを作った内容と同じ配列・同じ時計のずれで、
 * 置き場所の控えも書いたままなら、作らず・書かずに true を返す（#257。何も変わらない 1 分ごとの同期で、全部の行をハッシュして書き直さない）
 */
export function saveSyncedBaseline(
  userId: string,
  synced: SyncSnapshot,
  clockOffsetMs: number | undefined,
  onLaterFailure?: (err: unknown) => void,
): boolean {
  const key = baselineKey(userId)
  if (
    savedFrom &&
    savedFrom.key === key &&
    savedFrom.lists === synced.lists &&
    savedFrom.tasks === synced.tasks &&
    savedFrom.habits === synced.habits &&
    savedFrom.sections === synced.sections &&
    savedFrom.clockOffsetMs === clockOffsetMs &&
    readStoredSafe(key) === savedFrom.raw
  )
    return true
  const ok = saveBaseline(userId, { ...baselineFrom(synced), clockOffsetMs }, onLaterFailure)
  savedFrom = ok && parsedBaseline?.key === key ? { ...synced, key, raw: parsedBaseline.raw, clockOffsetMs } : null
  return ok
}

function readStoredSafe(key: string): string | null {
  try {
    return readStored(key)
  } catch {
    return null
  }
}
