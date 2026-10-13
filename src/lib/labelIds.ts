/**
 * ラベルの id（#365）。記録・To-Do・予定は `labelId` でラベルを指し、ラベルの名前・色を変えても行を書き直さない。
 *
 * - ラベル表は今までどおり名前で持つ（`timeLogTagPresets`・`logCategoryColors`・`logLabelTargets`）。id は `logLabelIds`（名前 → id）。
 *   表に id の無いラベルの id は名前から決まる `legacyLabelId(名前)`（どの端末でも、サーバーの埋め戻し `033` でも同じ値）。
 *   名前を変えたラベルは元の id を `logLabelIds` に持つ
 * - 行は `labelId` と、前の版の端末が読む名前（記録の `category`）・色（To-Do・予定の `color`）の両方を持つ。
 *   ストアの行の名前・色はいつもラベル表の今の名前・色にそろえる（画面は今までどおり `category`・`color` を読む）。
 *   名前・色を変えたときは、その id の行の名前・色を端末の中だけで直し、`updatedAt` は変えない（`relabelTasks`）。
 *   サーバーの行は古い名前・色のままでも、取得した行を同じ表で読み替える（`resolveIncomingLabels`）ので、比べても違いにならず送らない
 * - 名前・色を直す操作（`applyTaskPatch`）は `labelId` を外し、名前・色から付け直す（`fillLabelIds`）。名前・色が正
 * - 前の版の端末は `label_id` を送らない。その端末が名前・色を変えた行は、サーバーが `label_id` を外す（`033` のトリガー）ので、
 *   名前・色から付け直す
 */
import { isLogTask, type Task } from '../types/task'
import { categoryHex } from './logCategoryColors'
import { md5Hex } from './md5'
import { withLogCategory } from './taskDefaults'

/** ラベル名 → id。無い名前の id は `legacyLabelId(名前)` */
export type LabelIds = Record<string, string>

/** 名前から決まる id。`033` の SQL（`md5('chronograma-label:' || name)::uuid`）と同じ値 */
export function legacyLabelId(name: string): string {
  const h = md5Hex(`chronograma-label:${name}`)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** id として使える値か（`tasks.label_id` は uuid） */
export function isLabelId(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

/** 保存されていた値（壊れていてもよい）を id の表にする */
export function normalizeLabelIds(raw: unknown): LabelIds {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: LabelIds = {}
  for (const [name, id] of Object.entries(raw as Record<string, unknown>)) if (name && isLabelId(id)) out[name] = id.toLowerCase()
  return out
}

/**
 * 並びの名前ごとの id。表に書いた id を先に取り、無い名前は名前から決める。
 * 名前から決めた id がほかのラベルの id と重なれば（名前を変えたラベルの元の名前で、新しくラベルを作った）、番号を付けて決め直す
 */
export function effectiveLabelIds(presets: readonly string[], ids: Readonly<LabelIds>): Map<string, string> {
  const written = new Set(presets.map((n) => ids[n]).filter((id): id is string => !!id))
  const used = new Set<string>()
  const out = new Map<string, string>()
  for (const name of presets) {
    let id = ids[name]
    if (!id || used.has(id)) {
      id = legacyLabelId(name)
      for (let k = 1; used.has(id) || (written.has(id) && ids[name] !== id); k++) id = legacyLabelId(`${name}\u0001${k}`)
    }
    used.add(id)
    out.set(name, id)
  }
  return out
}

/** 名前を変えた・作り直したラベルの id だけを残す（名前から決まる id と同じなら書かない） */
export function compactLabelIds(presets: readonly string[], ids: ReadonlyMap<string, string>): LabelIds {
  const out: LabelIds = {}
  for (const name of presets) {
    const id = ids.get(name)
    if (id && id !== legacyLabelId(name)) out[name] = id
  }
  return out
}

export interface LabelEntry {
  id: string
  name: string
  /** `#RRGGBB`（大文字） */
  hex: string
}

export interface LabelIndex {
  byId: ReadonlyMap<string, LabelEntry>
  byName: ReadonlyMap<string, LabelEntry>
  /** 色 → その色のラベル（同じ色が 2 つあれば並びの先。`labelForHex` と同じ） */
  byHex: ReadonlyMap<string, LabelEntry>
}

export interface LabelTableState {
  timeLogTagPresets: readonly string[]
  logCategoryColors: Readonly<Record<string, string>>
  logLabelIds: Readonly<LabelIds>
}

export function labelIndex(s: LabelTableState): LabelIndex {
  const ids = effectiveLabelIds(s.timeLogTagPresets, s.logLabelIds)
  const byId = new Map<string, LabelEntry>()
  const byName = new Map<string, LabelEntry>()
  const byHex = new Map<string, LabelEntry>()
  for (const name of s.timeLogTagPresets) {
    const e = { id: ids.get(name)!, name, hex: categoryHex(name, s.logCategoryColors).toUpperCase() }
    byId.set(e.id, e)
    byName.set(name, e)
    if (!byHex.has(e.hex)) byHex.set(e.hex, e)
  }
  return { byId, byName, byHex }
}

/** 行の名前・色がそのラベルの今の名前・色か（記録は名前、To-Do・予定は色） */
function showsLabel(t: Task, e: LabelEntry): boolean {
  return isLogTask(t) ? t.category === e.name : t.color?.toUpperCase() === e.hex
}

/** 行の名前・色が指しているラベル（記録は名前、To-Do・予定は色） */
function labelByLegacy(t: Task, idx: LabelIndex): LabelEntry | undefined {
  if (isLogTask(t)) return t.category ? idx.byName.get(t.category) : undefined
  return t.color ? idx.byHex.get(t.color.toUpperCase()) : undefined
}

/** 行の名前・色をラベルの今の名前・色に */
function showLabel(t: Task, e: LabelEntry): Task {
  if (isLogTask(t)) return withLogCategory({ ...t, category: e.name, tags: [e.name], labelId: e.id })
  return { ...t, color: e.hex, labelId: e.id }
}

const withId = (t: Task, id: string): Task => (t.labelId === id ? t : { ...t, labelId: id })

/** 何も変わらなければ同じ配列 */
function mapTasks(tasks: Task[], f: (t: Task) => Task): Task[] {
  let out: Task[] | null = null
  for (let i = 0; i < tasks.length; i++) {
    const next = f(tasks[i]!)
    if (next !== tasks[i]) {
      out ??= tasks.slice()
      out[i] = next
    }
  }
  return out ?? tasks
}

/** `labelId` の無い行に、名前・色から id を付ける（名前・色は変えない）。手元の行の付け忘れ・前の版の保存・前の版の端末が作った行 */
export function fillLabelIds(tasks: Task[], idx: LabelIndex): Task[] {
  return mapTasks(tasks, (t) => {
    if (t.labelId) return t
    const e = labelByLegacy(t, idx)
    return e ? withId(t, e.id) : t
  })
}

/**
 * 取得した行を手元のラベル表で読む。`label_id` のある行は id が正（名前・色を変えても行は書き直さないので、古い名前・色のことがある）。
 * 手元の表に無い id（別の端末で作ったばかりのラベル・表がまだ届いていない）は id のまま（表が届いたら `relabelTasks`）
 */
export function resolveIncomingLabels(tasks: Task[], idx: LabelIndex): Task[] {
  return mapTasks(tasks, (t) => {
    if (t.labelId) {
      const byId = idx.byId.get(t.labelId)
      // 手元の表に無い id は、名前・色が手元のほかのラベルと同じでもそのまま（表が届く前に別のラベルへ付け替えない）
      return !byId || showsLabel(t, byId) ? t : showLabel(t, byId)
    }
    const e = labelByLegacy(t, idx)
    return e ? withId(t, e.id) : t
  })
}

/**
 * ラベル表を変えたあと（名前・色の変更・同期で届いた表・取り消し）: 前の表でどのラベルを指していたかを決め、
 * そのラベルの今の名前・色にする。`updatedAt` は変えない（行は書き直さない。ほかの端末も同じ表で読み替える）。
 * 前の表で id と名前・色が食い違っていたら名前・色が正（名前・色を直したばかりの行）
 */
export function relabelTasks(tasks: Task[], before: LabelIndex, after: LabelIndex): Task[] {
  return mapTasks(tasks, (t) => {
    const prev = t.labelId ? before.byId.get(t.labelId) : undefined
    // 前の表に無い id（表より先に届いた行）: 届いた表にあればそのラベル、無ければ id のまま
    if (t.labelId && !prev) {
      const next = after.byId.get(t.labelId)
      return next && !showsLabel(t, next) ? showLabel(t, next) : t
    }
    const id = prev && showsLabel(t, prev) ? prev.id : labelByLegacy(t, before)?.id
    if (!id) {
      // 前の表には無かった（名前を付けたばかりの色）
      const e = labelByLegacy(t, after)
      return e ? withId(t, e.id) : t
    }
    const next = after.byId.get(id)
    // 消したラベル: そのまま（消した端末が行を直して送る）
    if (!next) return t
    return showsLabel(t, next) ? withId(t, id) : showLabel(t, next)
  })
}
