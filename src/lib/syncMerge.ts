import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import type { Habit } from '../types/habit'
import { CANVAS_LIST_ID, isCanvasListId } from './canvasIds'
import jaLocale from '../locales/ja'
import enLocale from '../locales/en'
import { reanchorTask } from './taskTimeZone'

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

function fieldsBaseline<T extends object>(rows: readonly T[]): { order: string[]; rows: Record<string, string> } {
  const keys = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r)) if (!NOT_MERGED.has(k)) keys.add(k)
  const order = [...keys].sort()
  const out: Record<string, string> = {}
  for (const r of rows) {
    const rec = r as Record<string, unknown>
    out[rec.id as string] = order.map((k) => fieldHash(rec[k])).join('.')
  }
  return { order, rows: out }
}

/** 控えと同じ並びの項目ハッシュ（`fieldsBaseline` の 1 行ぶんと比べられる形） */
function rowHash(row: object, order: readonly string[]): string {
  const rec = row as Record<string, unknown>
  return order.map((k) => fieldHash(rec[k])).join('.')
}

/**
 * 両方の端末で変わった 1 行を項目ごとに合わせる。前回同期から片方だけが変えた項目はその側の値、
 * 両方が変えた項目（と前回の値が分からない項目）は新しいほうの値。
 * どちらが新しいかは、手元の編集時刻をサーバーの時計に直して（`clockOffsetMs`）サーバーの updatedAt と比べる。
 * 全部の項目がサーバー側なら行をそのまま（updatedAt もサーバーの値）、全部が手元側なら手元の行。
 * 両方から取ったときは updatedAt を今にする（送るとサーバーが時刻を付け直す）
 */
function mergeRow<T extends { id: string }>(
  l: T,
  r: T,
  base: { order: string[]; hashes: string[] } | null,
  stamp: (x: T) => number,
  nowIso: string,
  clockOffsetMs: number,
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
    if (NOT_MERGED.has(k)) continue
    const lh = fieldHash(lr[k])
    const rh = fieldHash(rr[k])
    if (lh === rh) continue
    const bh = baseByKey.get(k)
    let take: 'l' | 'r' | null = null
    if (bh !== undefined && lh === bh) take = 'r'
    else if (bh !== undefined && rh === bh) take = 'l'
    if (!take) take = winner === r ? 'r' : 'l'
    out[k] = take === 'r' ? rr[k] : lr[k]
    if (take === 'l') fromLocal = true
    else fromRemote = true
  }
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
    if (rowHash(n, baseFields.order) !== hashes) return true
    // 控えを取った後に増えた項目は、値が入っていれば変えたものとみなす
    const known = new Set(baseFields.order)
    return Object.entries(n).some(([k, v]) => !NOT_MERGED.has(k) && !known.has(k) && v != null)
  }

  for (const l of local) {
    const r = remoteById.get(l.id)
    if (r) {
      const hashes = baseFields?.rows[l.id]
      // 控え・サーバーの行と同じ書き方にそろえて比べる。手元のほうを丸ごと使うなら手元の行そのもの
      const ln = normalize(l)
      const row = mergeRow(ln, r, hashes && baseFields ? { order: baseFields.order, hashes: hashes.split('.') } : null, stamp, nowIso, clockOffsetMs)
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
  const localById = new Map(local.map((h) => [h.id, h]))
  const remoteById = new Map(remote.map((h) => [h.id, h]))
  return merged.map((h) => {
    const l = localById.get(h.id)
    const r = remoteById.get(h.id)
    if (!l || !r) return h
    const ld = new Set(l.completedDates)
    const rd = new Set(r.completedDates)
    const base = baseDates?.[h.id]
    const baseSet = base ? new Set(base) : null
    const dates = [...new Set([...ld, ...rd])]
      .filter((d) => !(baseSet?.has(d) && (!ld.has(d) || !rd.has(d))))
      .sort()
    const current = [...h.completedDates].sort()
    const same = dates.length === current.length && dates.every((d, i) => d === current[i])
    return same ? h : { ...h, completedDates: dates, updatedAt: nowIso }
  })
}

/** ローカル・サーバー・前回同期の 3 点から、両端末の変更を取りこぼさない状態を作る */
export function mergeSnapshots(
  local: SyncSnapshot,
  remote: SyncSnapshot,
  baseline: SyncBaseline,
): { merged: SyncSnapshot; deletes: SyncDeletes } {
  const f = baseline.fields
  const off = baseline.clockOffsetMs ?? 0
  const lists = mergeKind(local.lists, remote.lists, baseline.lists, (l) => stampMs(l.updatedAt), f?.lists, off)
  const sections = mergeKind(local.sections, remote.sections, baseline.sections, (s) => stampMs(s.updatedAt), f?.sections, off)
  // タスクの時刻は端末のタイムゾーンで書き方が違う。項目ごとに比べる前に、サーバーの行をこの端末の書き方にそろえる
  const tasks = mergeKind(local.tasks, remote.tasks.map((t) => reanchorTask(t)), baseline.tasks, (t) => stampMs(t.updatedAt), f?.tasks, off, (t) => reanchorTask(t))
  const habits = mergeKind(local.habits, remote.habits, baseline.habits, (h) => stampMs(h.updatedAt), f?.habits, off)
  habits.merged = mergeHabitDates(habits.merged, local.habits, remote.habits, baseline.habitDates)

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
  const fallbackList = (listId: string) =>
    isCanvasListId(listId) && listIds.has(CANVAS_LIST_ID) ? CANVAS_LIST_ID : SYNC_INBOX_LIST_ID
  const mergedSections = sections.merged
    .map((s) => (listIds.has(s.listId) || fallbackList(s.listId) !== CANVAS_LIST_ID ? s : { ...s, listId: CANVAS_LIST_ID }))
    .filter((s) => listIds.has(s.listId))
  // 消えたリストのセクションがサーバーに残っていると、リストの削除が外部キー（on delete no action）で通らない。一緒に消す
  const keptSectionIds = new Set(mergedSections.map((s) => s.id))
  const remoteSectionIds = new Set(remote.sections.map((s) => s.id))
  const orphanSections = sections.merged
    .filter((s) => !keptSectionIds.has(s.id) && remoteSectionIds.has(s.id))
    .map((s) => s.id)
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

/** 最初から作る「いつか」「買い物」の id。どの端末・どの言語で作っても同じ id にして、同期で 2 つにならないように */
export const DEFAULT_LIST_IDS = { someday: 'default-someday', checklist: 'default-shopping' } as const

/**
 * 前の版の初期リストの名前（どの言語で作られたか分からないので、全部の言語の名前）。
 * 前の版は初期リストを言語ごとの名前・ばらばらの id で作っていた
 */
const LEGACY_DEFAULT_NAMES = new Set<string>([jaLocale.lists.defaultSomeday, jaLocale.lists.defaultShopping, enLocale.lists.defaultSomeday, enLocale.lists.defaultShopping])

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
  const ids = <T extends { id: string }>(xs: readonly T[], stamp: (x: T) => number) =>
    Object.fromEntries(xs.map((x) => [x.id, stamp(x)]))
  return {
    lists: ids(s.lists, (l) => stampMs(l.updatedAt)),
    sections: ids(s.sections, (sec) => stampMs(sec.updatedAt)),
    tasks: ids(s.tasks, (t) => stampMs(t.updatedAt)),
    habits: ids(s.habits, (h) => stampMs(h.updatedAt)),
    habitDates: Object.fromEntries(s.habits.map((h) => [h.id, [...h.completedDates]])),
    fields: {
      lists: fieldsBaseline(s.lists),
      sections: fieldsBaseline(s.sections),
      // 控えもこの端末のタイムゾーンの書き方で（比べるときにそろえた行と同じ書き方にする）
      tasks: fieldsBaseline(s.tasks.map((t) => reanchorTask(t))),
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

const baselineKey = (userId: string) => `chronograma-sync-baseline-v1:${userId}`

export function loadBaseline(userId: string): SyncBaseline | null {
  try {
    const raw = localStorage.getItem(baselineKey(userId))
    return raw ? (JSON.parse(raw) as SyncBaseline) : null
  } catch {
    return null
  }
}

/** この端末で、ほかの人として同期したことがあるか（前回同期の控えが残っているか） */
export function hasOtherUsersBaseline(userId: string): boolean {
  try {
    const prefix = baselineKey('')
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix) && key !== baselineKey(userId)) return true
    }
  } catch {
    /* 読めなければ、無いものとして扱う */
  }
  return false
}

export function clearBaseline(userId: string) {
  try {
    localStorage.removeItem(baselineKey(userId))
  } catch {
    /* ignore */
  }
}

export function saveBaseline(userId: string, baseline: SyncBaseline) {
  try {
    localStorage.setItem(baselineKey(userId), JSON.stringify(baseline))
  } catch {
    /* 保存できなければ次回は初回同期扱い（両方を残すマージ）になるだけ */
  }
}
