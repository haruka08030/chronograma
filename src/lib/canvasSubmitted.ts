import { useSyncExternalStore } from 'react'
import { parseCanvasTaskId } from './canvasIds'

/**
 * Canvas で提出はしたが済んではいない課題（途中保存・下書き・採点待ち、#395）。
 * 行の「提出済み」の目印と、提出済みになったときに一度だけ「終わった？」と聞く知らせに使う。
 * 取り込みのたびに Canvas から取り直せるので、端末間では同期せず、この端末に人ごとに覚える。
 * 取り込むのは代表のタブだけなので、ほかのタブは保存の変化（`storage`）で同じ内容を読む。
 */

/** 覚えておくキーの頭（後ろに人の id）。ログアウトで消す（`deviceCleanup.ts`） */
export const CANVAS_SUBMITTED_PREFIX = 'chronograma-canvas-submitted-v1:'

type State = {
  /** 提出済みのタスクの id */
  ids: ReadonlySet<string>
  /** まだ聞いていない、新しく提出済みになったタスクの id */
  ask: readonly string[]
}

const EMPTY: State = { ids: new Set(), ask: [] }
let key: string | null = null
let state: State = EMPTY
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function read(k: string): State {
  try {
    const raw = JSON.parse(localStorage.getItem(k) ?? 'null') as { ids?: unknown; ask?: unknown } | null
    const ids = Array.isArray(raw?.ids) ? raw.ids.filter((x): x is string => typeof x === 'string') : []
    const ask = Array.isArray(raw?.ask) ? raw.ask.filter((x): x is string => typeof x === 'string') : []
    return { ids: new Set(ids), ask }
  } catch {
    return EMPTY
  }
}

function write(next: State) {
  state = next
  if (key) {
    try {
      localStorage.setItem(key, JSON.stringify({ ids: [...next.ids], ask: next.ask }))
    } catch {
      /* 覚えられなければ、この画面のあいだだけ出す */
    }
  }
  emit()
}

function onStorage(e: StorageEvent) {
  if (key && e.key === key) {
    state = read(key)
    emit()
  }
}

/** ログインした人の分を読む（null で外す）。`useCanvasSync` が呼ぶ */
export function bindCanvasSubmitted(userId: string | null) {
  const next = userId ? `${CANVAS_SUBMITTED_PREFIX}${userId}` : null
  if (next === key) return
  if (typeof window !== 'undefined') {
    if (!key && next) window.addEventListener('storage', onStorage)
    if (key && !next) window.removeEventListener('storage', onStorage)
  }
  key = next
  state = next ? read(next) : EMPTY
  emit()
}

/**
 * 1 つの接続の取り込みの結果を入れる。その接続の分を `ids` に置き換え、新しく提出済みになったものを聞く列に足す。
 * 提出済みでなくなったもの（やり直し・採点・完了）は聞く列からも外す
 */
export function noteCanvasSubmitted(connectionId: string, ids: readonly string[]) {
  const ofConnection = (id: string) => parseCanvasTaskId(id)?.connectionId === connectionId
  const incoming = new Set(ids)
  const nextIds = new Set([...state.ids].filter((id) => !ofConnection(id)))
  incoming.forEach((id) => nextIds.add(id))
  const added = ids.filter((id) => !state.ids.has(id))
  const ask = [...state.ask.filter((id) => nextIds.has(id)), ...added.filter((id) => !state.ask.includes(id))]
  if (added.length === 0 && nextIds.size === state.ids.size && ask.length === state.ask.length) return
  write({ ids: nextIds, ask })
}

/** 聞いた（答えた・見送った）ので、聞く列を空にする。目印は残す */
export function clearCanvasSubmittedAsk() {
  if (state.ask.length > 0) write({ ...state, ask: [] })
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** このタスクが Canvas で提出済み（済んではいない）か */
export function useCanvasSubmitted(taskId: string): boolean {
  return useSyncExternalStore(subscribe, () => state.ids.has(taskId))
}

/** まだ聞いていない、新しく提出済みになったタスクの id */
export function useCanvasSubmittedAsk(): readonly string[] {
  return useSyncExternalStore(subscribe, () => state.ask)
}
