import { appTodayKey, zonedNow } from './timeZone'

/**
 * アプリの「今」と「今日」の、ただ 1 つの時計。分の境目と、表に戻ったとき（visibilitychange・pageshow・focus）に進む。
 * 画面ごとにタイマーを回さず、全員がここを読む（`useNow` / `useAppTodayKey`）。
 * 購読する人がいる間だけ動く
 */
type Listener = () => void

const listeners = new Set<Listener>()
let now = zonedNow()
let todayKey = appTodayKey()
let timer: ReturnType<typeof setTimeout> | null = null

/** 今の時刻を読み直し、分か日が変わっていれば知らせる。表に戻ったときは同じ分でも呼んでよい */
export function refreshAppClock(): void {
  const next = zonedNow()
  const nextKey = appTodayKey()
  const changed = Math.floor(next.getTime() / 60_000) !== Math.floor(now.getTime() / 60_000) || nextKey !== todayKey
  if (!changed) return
  now = next
  todayKey = nextKey
  listeners.forEach((l) => l())
}

/** 次の分の境目に読み直す（setInterval の 60 秒は境目からずれ、裏に回ると遅れるので毎回合わせ直す） */
function schedule() {
  const ms = 60_000 - (Date.now() % 60_000)
  timer = setTimeout(() => {
    refreshAppClock()
    schedule()
  }, ms + 20)
}

function onResume() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  refreshAppClock()
}

const RESUME_EVENTS = ['visibilitychange', 'pageshow', 'focus'] as const

export function subscribeAppClock(listener: Listener): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    refreshAppClock()
    schedule()
    if (typeof window !== 'undefined') {
      for (const ev of RESUME_EVENTS) (ev === 'visibilitychange' ? document : window).addEventListener(ev, onResume)
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    if (timer != null) clearTimeout(timer)
    timer = null
    if (typeof window !== 'undefined') {
      for (const ev of RESUME_EVENTS) (ev === 'visibilitychange' ? document : window).removeEventListener(ev, onResume)
    }
  }
}

/** 時計の今（分の単位で変わる。同じ分の間は同じ Date を返す） */
export function appClockNow(): Date {
  return now
}

/** 時計の今日（`yyyy-MM-dd`） */
export function appClockTodayKey(): string {
  return todayKey
}
