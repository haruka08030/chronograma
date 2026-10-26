/** Google カレンダーの予定と接続の状態 */
import { eventChoiceKey, resolveEventColors, seriesChoiceKey } from '../../lib/googleEventColors'
import { withMyEventTimes } from '../../lib/myEventTimes'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'

type GoogleActions = Pick<
  TaskState,
  | 'setCalendarEvents'
  | 'setGoogleEventColor'
  | 'setGoogleConnected'
  | 'setGoogleAccessToken'
  | 'setGoogleConnectionError'
  | 'setGoogleReconnectNeeded'
  | 'setGoogleCanWrite'
  | 'setGooglePushFailed'
  | 'setGoogleUndo'
>

export function createGoogleSlice({ set }: SliceContext): GoogleActions {
  return {
    // 自分の時間（#625）はここで当てる（画面・空き時間・今と次の予定・記録へのコピーがみな自分の時間を使う）
    setCalendarEvents: (events) =>
      set((s) => ({ calendarEvents: withMyEventTimes(resolveEventColors(events, s.googleEventColors), s.myEventTimes) })),
    setGoogleEventColor: (event, hex, scope) => {
      set((s) => {
        const choices = { ...s.googleEventColors }
        const eKey = eventChoiceKey(event.id)
        const sKey = event.recurringEventId ? seriesChoiceKey(event.recurringEventId) : null
        if (hex === null) {
          delete choices[eKey]
          if (sKey && scope === 'series') delete choices[sKey]
        } else if (scope === 'series' && sKey) {
          choices[sKey] = { hex, title: event.summary }
          delete choices[eKey]
        } else {
          choices[eKey] = { hex, title: event.summary }
        }
        return { googleEventColors: choices, calendarEvents: resolveEventColors(s.calendarEvents, choices) }
      })
    },
    // つながったら「もう一度つなぐ」は要らない
    setGoogleConnected: (connected) =>
      set(connected ? { googleConnected: true, googleReconnectNeeded: false } : { googleConnected: false }),
    setGoogleAccessToken: (token) => set({ googleAccessToken: token }),
    setGoogleConnectionError: (error) => set({ googleConnectionError: error }),
    setGoogleReconnectNeeded: (needed) => set({ googleReconnectNeeded: needed }),
    setGoogleCanWrite: (canWrite) => set({ googleCanWrite: canWrite }),
    setGooglePushFailed: (count) => set((s) => (s.googlePushFailed === count ? s : { googlePushFailed: count })),

    setGoogleUndo: (next) => set({ googleUndo: next ? { ...next, at: Date.now() } : null }),
  }
}
