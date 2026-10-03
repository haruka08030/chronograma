import { useEffect } from 'react'
import { useTaskStore } from '../store/taskStore'
import { useCompleteWithLog } from '../hooks/useCompleteWithLog'

/** 通知の「記録する」から開く、予定を記録にする画面（予定どおり / ずれた時刻） */
export function RecordPromptHost() {
  const taskId = useTaskStore((s) => s.recordPromptTaskId)
  const openRecordPrompt = useTaskStore((s) => s.openRecordPrompt)
  const { open, modal } = useCompleteWithLog()

  useEffect(() => {
    if (!taskId) return
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
    if (task) open(task)
    openRecordPrompt(null)
  }, [taskId, open, openRecordPrompt])

  return modal
}
