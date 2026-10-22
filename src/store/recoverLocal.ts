/**
 * IndexedDB に移した後に localStorage で動いた回（IndexedDB を開けなかった）の本体を、IndexedDB の本体に合わせる（#255）。
 * その回は空の localStorage（＝ストアの既定値）から始まっているので、IndexedDB の行も設定も見えていない（消してもいない）。
 *
 * - 行（タスク・リスト・習慣・セクション）は id ごとに両方を残す（同じ id はその回のほう）
 * - 行以外は IndexedDB の本体を基にし、その回の値は既定値と違う（＝その回で変えた）ときだけ使う。
 *   変えた時刻（`*UpdatedAt`）を持つものはその時刻が新しいときだけ、オブジェクト（日ごとの気分・ラベルの色など）はキーごとに、
 *   id を持つ配列・文字列の配列は両方を残す
 * - 動いているタイマーは IndexedDB の本体のまま（ほかの端末とはサーバーで合わせる）
 * - 持ち主（`dataOwner`）が片方だけなら null（同期の前に、アカウントに入れてよいかを確かめる道に入る）。
 *   別の人どうしなら合わせず、その回のほうにする（IndexedDB の本体は呼ぶ側が別のキーに残す）
 */
import { sameValue } from '../lib/sameValue'
import { DATA_KEYS } from './persistKeys'
import { ROW_KEYS, SETTING_STAMPS } from './storedSettings'

type State = Record<string, unknown>

const KEEP_STORED = ['activeTimer', 'activeTimerUpdatedAt', 'dataOwner']
/** 変えた時刻と、その時刻で比べる値（`STORED_SETTINGS` の表から。動いているタイマーは IndexedDB の本体のまま） */
const STAMPED = Object.fromEntries(Object.entries(SETTING_STAMPS).filter(([stamp]) => !KEEP_STORED.includes(stamp)))

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const idOf = (v: unknown) => (isPlainObject(v) ? v.id : undefined)

function unionById(stored: unknown[], local: unknown[]): unknown[] {
  const localIds = new Set<unknown>(local.map(idOf).filter((id) => id !== undefined))
  return [...stored.filter((x) => idOf(x) === undefined || !localIds.has(idOf(x))), ...local]
}

/** その回で変えた値を、IndexedDB の値に合わせる（変えていなければ呼ばない） */
function mergeChanged(stored: unknown, local: unknown, fallback: unknown): unknown {
  if (stored === undefined) return local
  if (Array.isArray(stored) && Array.isArray(local)) {
    if (local.every((x) => typeof x === 'string') && stored.every((x) => typeof x === 'string')) return [...new Set([...stored, ...local])]
    if (local.every((x) => idOf(x) !== undefined)) return unionById(stored, local)
    return local
  }
  if (isPlainObject(stored) && isPlainObject(local)) {
    const base = isPlainObject(fallback) ? fallback : {}
    const out = { ...stored }
    for (const [k, v] of Object.entries(local)) if (!(k in stored) || !sameValue(v, base[k])) out[k] = v
    return out
  }
  return local
}

/** `stored` は IndexedDB の本体、`local` はその回の本体、`defaults` はストアの既定値（どれも保存する値の `state`） */
export function mergeRecoveredState(stored: State, local: State, defaults: State): { state: State; replaced: boolean } {
  const ownerA = (stored.dataOwner as string | null | undefined) ?? null
  const ownerB = (local.dataOwner as string | null | undefined) ?? null
  if (ownerA !== null && ownerB !== null && ownerA !== ownerB) return { state: local, replaced: true }

  const state: State = { ...stored }
  for (const key of DATA_KEYS as readonly string[]) {
    if (!(key in local) || KEEP_STORED.includes(key) || (ROW_KEYS as readonly string[]).includes(key)) continue
    if (key in STAMPED || Object.values(STAMPED).some((keys) => (keys as string[]).includes(key))) continue
    if (sameValue(local[key], defaults[key])) continue
    state[key] = mergeChanged(stored[key], local[key], defaults[key])
  }
  for (const [stampKey, keys] of Object.entries(STAMPED)) {
    const a = typeof stored[stampKey] === 'string' ? (stored[stampKey] as string) : null
    const b = typeof local[stampKey] === 'string' ? (local[stampKey] as string) : null
    if (b === null || (a !== null && a >= b)) continue
    state[stampKey] = b
    for (const key of keys) if (key in local) state[key] = local[key]
  }
  for (const key of ROW_KEYS) {
    const a = Array.isArray(stored[key]) ? (stored[key] as unknown[]) : []
    const b = Array.isArray(local[key]) ? (local[key] as unknown[]) : []
    state[key] = unionById(a, b)
  }
  state.dataOwner = ownerA === ownerB ? ownerA : null
  return { state, replaced: false }
}

type BaselineRows = Partial<Record<(typeof ROW_KEYS)[number], Record<string, unknown>>>

/**
 * その回で消した行を外す。その回は同期していれば（その回の控えがあれば）サーバーの行を全部持っていたので、
 * IndexedDB の本体にだけある行のうち、前に同期した（置き換える前の控え `before` にある）のにその回の控え `after` に無い行は、
 * その回で完全に消した・ほかの端末で消された行。残すと次の同期で「この端末で足した行」として送り直していた。
 * 前の控えに無い行（IndexedDB の側で足してまだ送っていない行）は残す
 */
export function dropRowsDeletedInRecovered(state: State, local: State, before: BaselineRows, after: BaselineRows): State {
  const out: State = { ...state }
  for (const key of ROW_KEYS) {
    const prev = before[key]
    const now = after[key]
    if (!prev || !now || !Array.isArray(out[key])) continue
    const localIds = new Set<unknown>(Array.isArray(local[key]) ? (local[key] as unknown[]).map(idOf) : [])
    out[key] = (out[key] as unknown[]).filter((row) => {
      const id = idOf(row)
      if (typeof id !== 'string' || localIds.has(id)) return true
      return !(id in prev) || id in now
    })
  }
  return out
}
