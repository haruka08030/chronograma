import { useMemo } from 'react'
import { useTaskStore } from '../store/taskStore'
import { resolveEventColors } from '../lib/googleEventColors'
import { skippedAsEvents, withSkippedEvents } from '../lib/skippedEvents'
import type { CalendarEvent } from '../types/calendarEvent'

/**
 * カレンダー・今日の画面に出す Google の予定。Google にある予定に、やらなかった予定（#528、`skipped`）を混ぜる。
 * やらなかった予定は自分の記録なので、Google とのつながりが切れていても出す。
 * 空いた時間・今と次の予定などの計算は Google にある予定（`calendarEvents`）だけを使う（やらなかった予定は入れない）。
 * `calendarEvents` には自分の時間（#625）を当ててあるので、どちらも自分の時間で並ぶ（当てるのは `setCalendarEvents`）
 */
export function useShownCalendarEvents(): CalendarEvent[] {
  const live = useTaskStore((s) => s.calendarEvents)
  const skipped = useTaskStore((s) => s.skippedEvents)
  const choices = useTaskStore((s) => s.googleEventColors)
  const skippedEvents = useMemo(() => resolveEventColors(skippedAsEvents(skipped), choices), [skipped, choices])
  return useMemo(() => withSkippedEvents(live, skippedEvents), [live, skippedEvents])
}

/** その id のやらなかった予定（カード・メニュー用）。無ければ null */
export function skippedEventById(id: string): CalendarEvent | null {
  const { skippedEvents, googleEventColors } = useTaskStore.getState()
  const found = skippedEvents.find((e) => e.id === id && !e.removed)
  return found ? resolveEventColors(skippedAsEvents([found]), googleEventColors)[0]! : null
}
