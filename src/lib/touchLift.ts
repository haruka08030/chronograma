/**
 * タッチで行を浮かせる操作（iPhone のホーム画面・ファイルアプリと同じ）。
 * - 行を長押しすると浮き、その行は選択に入る
 * - 押さえたまま別の指で他の行をタップすると、その行も選択に入る（浮いている束に重なる）
 * - 押さえている指を動かすと束ごと運ぶ（To-Do の手動の並びだけ。dnd-kit のセンサー `appTouchSensor` が受け持つ）
 * - 動かさずに離したら、選んだ状態で終わる
 *
 * ここは判定（純粋な関数）と、いま浮いている行の小さな置き場。選択は一覧（`useTaskListSelection`）が `onLiftAdd` で受ける
 */

/** 別の指のタップとみなす動きの幅 */
export const LIFT_TAP_SLOP_PX = 10
/** 別の指のタップとみなす長さ（これより長く押さえたら足さない） */
export const LIFT_TAP_MAX_MS = 500
/** 浮かせた後、押さえている指がこれより動いたら運ぶ（離しても選ぶだけにしない） */
export const LIFT_MOVE_PX = 8

/** 浮かせられる行の印（To-Do の手動の並びの行。長押しから dnd-kit のドラッグに入る） */
export const TOUCH_LIFT_ATTR = 'data-touch-lift'

export type Point = { x: number; y: number }
/** 浮かせている間に置かれた別の指 */
export type ExtraTouch = Point & { t: number; rowId: string | null }

/** 触れた所の行（`data-task-row`）。行の外なら null */
export function rowIdOfTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest('[data-task-row]')?.getAttribute('data-task-row') ?? null
}

/** 浮かせられる行の上で始まったタッチか（つまみ・見出しなどの普通のドラッグと分ける） */
export function isTouchLiftTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${TOUCH_LIFT_ATTR}]`) !== null
}

/** dnd-kit のドラッグが行の長押しから始まったか（`activatorEvent` を渡す） */
export function isTouchLiftEvent(event: Event | null | undefined): boolean {
  return !!event && event.type === 'touchstart' && isTouchLiftTarget(event.target)
}

/** 押さえている指が、浮かせた所から運ぶほど動いたか */
export function hasLiftMoved(origin: Point, p: Point): boolean {
  return Math.hypot(p.x - origin.x, p.y - origin.y) > LIFT_MOVE_PX
}

/** 別の指が置かれた。浮かせている間に始まったタッチは、すべて押さえている指とは別の指 */
export function addExtraTouches(
  extras: ReadonlyMap<number, ExtraTouch>,
  started: readonly (Point & { id: number; rowId: string | null })[],
  t: number,
): Map<number, ExtraTouch> {
  const next = new Map(extras)
  for (const s of started) next.set(s.id, { x: s.x, y: s.y, t, rowId: s.rowId })
  return next
}

/**
 * 指が離れた（`cancelled` は touchcancel）。
 * 別の指なら、ほとんど動かさずすぐ離したときだけタップとして、その行を `tappedRowIds` に返す。
 * 浮かせる前から触れていた指（押さえている指）が離れたら `primaryEnded`
 */
export function endTouches(
  extras: ReadonlyMap<number, ExtraTouch>,
  ended: readonly (Point & { id: number })[],
  t: number,
  cancelled = false,
): { extras: Map<number, ExtraTouch>; tappedRowIds: string[]; primaryEnded: boolean } {
  const next = new Map(extras)
  const tappedRowIds: string[] = []
  let primaryEnded = false
  for (const e of ended) {
    const start = next.get(e.id)
    if (!start) {
      primaryEnded = true
      continue
    }
    next.delete(e.id)
    const tap = !cancelled && t - start.t <= LIFT_TAP_MAX_MS && Math.hypot(e.x - start.x, e.y - start.y) <= LIFT_TAP_SLOP_PX
    if (tap && start.rowId) tappedRowIds.push(start.rowId)
  }
  return { extras: next, tappedRowIds, primaryEnded }
}

/** 新しく置いた指のほかに触れている指が無い（押さえていた指はもう離れている） */
export function isStaleLift(touching: number, started: number): boolean {
  return touching <= started
}

// ---- いま浮いている行 ----

export type LiftState = {
  /** 浮いている行。無ければ null */
  rowId: string | null
  /** 押さえている指を動かして運んでいる（それまでは置き場・計測の帯を出さない） */
  moving: boolean
  /** 束の件数（To-Do 一覧が数えて入れる。ドラッグの見た目のバッジ） */
  groupCount: number | null
}

let state: LiftState = { rowId: null, moving: false, groupCount: null }
const subscribers = new Set<() => void>()
const addListeners = new Set<(rowId: string) => void>()
let stopWatching: (() => void) | null = null

function patch(next: Partial<LiftState>) {
  const merged = { ...state, ...next }
  if (merged.rowId === state.rowId && merged.moving === state.moving && merged.groupCount === state.groupCount) return
  state = merged
  subscribers.forEach((f) => f())
}

function emitAdd(rowId: string) {
  addListeners.forEach((f) => f(rowId))
}

export function getLiftState(): LiftState {
  return state
}

export function subscribeLift(f: () => void): () => void {
  subscribers.add(f)
  return () => {
    subscribers.delete(f)
  }
}

/** 浮かせた行・別の指でタップした行を選択に足す（選択を持つ一覧が受ける）。戻り値で外す */
export function onLiftAdd(f: (rowId: string) => void): () => void {
  addListeners.add(f)
  return () => {
    addListeners.delete(f)
  }
}

export function isLiftActive(): boolean {
  return state.rowId !== null
}

/**
 * 行を浮かせる。その行を選択に足し、押さえている指が離れるまで別の指のタップを見張る。
 * `extraTaps: false` は別の指で足さない（束にできないサブタスクを運ぶとき）
 */
export function startLift(rowId: string, { extraTaps = true }: { extraTaps?: boolean } = {}) {
  endLift()
  patch({ rowId, moving: false, groupCount: null })
  emitAdd(rowId)
  if (typeof window !== 'undefined') stopWatching = watchTouches(extraTaps)
}

/** 押さえている指を動かして運び始めた */
export function markLiftMoving() {
  if (state.rowId !== null) patch({ moving: true })
}

export function setLiftGroupCount(count: number | null) {
  patch({ groupCount: count })
}

/** 浮かせ終わり（押さえている指が離れた・ドラッグが終わった）。何度呼んでもよい */
export function endLift() {
  stopWatching?.()
  stopWatching = null
  patch({ rowId: null, moving: false })
}

type TouchListLike = { length: number; [i: number]: Touch }
const points = (list: TouchListLike) =>
  Array.from({ length: list.length }, (_, i) => list[i]!).map((t) => ({ id: t.identifier, x: t.clientX, y: t.clientY, target: t.target }))

/** 浮かせている間の指を window で見張る（行ごとの操作より先に取るので capture） */
function watchTouches(extraTaps: boolean): () => void {
  let extras = new Map<number, ExtraTouch>()
  const onStart = (e: TouchEvent) => {
    // 画面に触れているのがこの指だけ = 押さえていた指はもう無い（離れたのを取りこぼした: 行が消えたなど）。
    // 浮かせたままにすると、以後のタップがすべて止まるので終える
    if (isStaleLift(e.touches?.length ?? 0, e.changedTouches.length)) {
      endLift()
      return
    }
    const started = points(e.changedTouches).map((p) => ({ ...p, rowId: rowIdOfTarget(p.target) }))
    extras = addExtraTouches(extras, started, e.timeStamp)
    // 別の指はピンチ・タップ（行を開く・選択を切り替える click）・行の操作に渡さない
    if (e.cancelable) e.preventDefault()
  }
  const onEnd = (cancelled: boolean) => (e: TouchEvent) => {
    const r = endTouches(extras, points(e.changedTouches), e.timeStamp, cancelled)
    extras = r.extras
    if (extraTaps)
      r.tappedRowIds.forEach((id) => {
        navigator.vibrate?.(10)
        emitAdd(id)
      })
    if (r.primaryEnded) endLift()
  }
  const onTouchEnd = onEnd(false)
  const onTouchCancel = onEnd(true)
  window.addEventListener('touchstart', onStart, { capture: true, passive: false })
  window.addEventListener('touchend', onTouchEnd, { capture: true })
  window.addEventListener('touchcancel', onTouchCancel, { capture: true })
  return () => {
    window.removeEventListener('touchstart', onStart, { capture: true })
    window.removeEventListener('touchend', onTouchEnd, { capture: true })
    window.removeEventListener('touchcancel', onTouchCancel, { capture: true })
  }
}
