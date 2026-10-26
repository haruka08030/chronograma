/** Google カレンダーの予定と接続の状態 */
import { eventChoiceKey, normalizeEventColorChoices, resolveEventColors, seriesChoiceKey } from '../../lib/googleEventColors'
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
    // アプリだけの色（Google には送らない）。付けた順に並べ、上限を超えたら古いものから落とす（`normalizeEventColorChoices`）。
    // 出ている予定への当て直しは `taskStore.ts` の購読（同期・他のタブで届いたときも）
    setGoogleEventColor: (event, hex, scope) => {
      set((s) => {
        const choices = { ...s.googleEventColors }
        const eKey = eventChoiceKey(event.id)
        const sKey = event.recurringEventId ? seriesChoiceKey(event.recurringEventId) : null
        delete choices[eKey]
        if (hex === null) {
          if (sKey && scope === 'series') delete choices[sKey]
        } else if (scope === 'series' && sKey) {
          delete choices[sKey]
          choices[sKey] = { hex, title: event.summary }
        } else {
          choices[eKey] = { hex, title: event.summary }
        }
        return { googleEventColors: normalizeEventColorChoices(choices) }
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
