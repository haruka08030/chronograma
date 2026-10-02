import type { CompleteWithLogDraft } from '../components/CompleteWithLogModal'
import { durationMinutesForTaskSlot } from './taskTimeRange'

/** 終了が開始より後か（日をまたぐ記録は終了日で判断する） */
export function isCompleteDraftValid(draft: CompleteWithLogDraft): boolean {
  const dur = durationMinutesForTaskSlot({
    dueDate: draft.date,
    endDate: draft.endDate !== draft.date ? draft.endDate : null,
    startTime: draft.startTime,
    endTime: draft.endTime,
    isTimeLog: true,
  })
  return dur != null && dur > 0
}
