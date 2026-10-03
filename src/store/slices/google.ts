/** Google カレンダーの予定と接続の状態 */
import { eventChoiceKey, resolveEventColors, seriesChoiceKey } from '../../lib/googleEventColors'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'

type GoogleActions = Pick<
  TaskState,
  | 'setCalendarEvents'
  | 'setGoogleEventColor'
  | 'setGoogleConnected'
  | 'setGoogleAccessToken'
  | 'setGoogleConnectionError'
  | 'setGoogleCanWrite'
  | 'setGoogleUndo'
>

export function createGoogleSlice({ set }: SliceContext): GoogleActions {
  return {
    setCalendarEvents: (events) => set((s) => ({ calendarEvents: resolveEventColors(events, s.googleEventColors) })),
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
    setGoogleConnected: (connected) => set({ googleConnected: connected }),
    setGoogleAccessToken: (token) => set({ googleAccessToken: token }),
    setGoogleConnectionError: (error) => set({ googleConnectionError: error }),
    setGoogleCanWrite: (canWrite) => set({ googleCanWrite: canWrite }),

    setGoogleUndo: (next) => set({ googleUndo: next ? { ...next, at: Date.now() } : null }),
  }
}
