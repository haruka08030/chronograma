import { useEffect } from 'react'
import { useTaskStore } from '../store/taskStore'
import { googleRecordPromptId, useCompleteWithLog } from '../hooks/useCompleteWithLog'

/** 通知の「記録する」・予定のカードから開く、予定を記録にする画面（予定どおり / ずれた時刻）。Google の予定も */
export function RecordPromptHost() {
  const taskId = useTaskStore((s) => s.recordPromptTaskId)
  const openRecordPrompt = useTaskStore((s) => s.openRecordPrompt)
  const { open, openGoogle, modal } = useCompleteWithLog()

  useEffect(() => {
    if (!taskId) return
    const { tasks, calendarEvents } = useTaskStore.getState()
    const task = tasks.find((t) => t.id === taskId)
    // Google の予定のカードの「記録にする」は `event-` 付きの id
    const event = task ? null : calendarEvents.find((e) => googleRecordPromptId(e.id) === taskId)
    if (task) open(task)
    else if (event) openGoogle(event)
    openRecordPrompt(null)
  }, [taskId, open, openGoogle, openRecordPrompt])

  return modal
}
