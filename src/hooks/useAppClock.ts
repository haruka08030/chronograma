import { useSyncExternalStore } from 'react'
import { appClockNow, appClockTodayKey, subscribeAppClock } from '../lib/appClock'

/** 今（アプリのタイムゾーンの壁時計）。分の境目と、表に戻ったときに描き直す。時計はアプリで 1 つ（`lib/appClock`） */
export function useNow(): Date {
  return useSyncExternalStore(subscribeAppClock, appClockNow)
}

/**
 * アプリの今日（`yyyy-MM-dd`）。日が変わると描き直す。
 * 描画で `appTodayKey()` を読む部品（締切の言葉・今日の印など）は、これを購読して日をまたいでも古いままにしない
 */
export function useAppTodayKey(): string {
  return useSyncExternalStore(subscribeAppClock, appClockTodayKey)
}
