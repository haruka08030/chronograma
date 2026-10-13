import type { CompleteWithLogDraft } from '../components/CompleteWithLogModal'
import { addDays } from 'date-fns'
import { durationMinutesForTaskSlot } from './taskTimeRange'
import { timeToMinutes } from './clockTime'
import { fromDateKey, toDateKey } from './dateKey'

/** 記録の終わりの日: 終了が開始より前なら次の日（記録パネルの「後から記録」と同じ） */
export function endDateFor(date: string, startTime: string, endTime: string): string {
  return startTime && endTime && timeToMinutes(endTime) < timeToMinutes(startTime) ? toDateKey(addDays(fromDateKey(date), 1)) : date
}

/** 終了が開始より後か（日をまたぐ記録は終了日で判断する） */
export function isCompleteDraftValid(draft: CompleteWithLogDraft): boolean {
  const dur = durationMinutesForTaskSlot({
    dueDate: draft.date,
    endDate: draft.endDate !== draft.date ? draft.endDate : null,
    startTime: draft.startTime,
    endTime: draft.endTime,
    kind: 'log',
  })
  return dur != null && dur > 0
}
