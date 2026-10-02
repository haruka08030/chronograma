import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import { CompleteWithLogModal, type CompleteWithLogDraft } from '../components/CompleteWithLogModal'
import { durationMinutesForTaskSlot, taskPlacementDate } from '../lib/taskTimeRange'
import { isListedTimeLog } from '../lib/timeLogTask'
import { logTagsFromTask } from '../lib/logCategoryColors'

/**
 * 時間を決めた予定を「完了＋記録」にする（予定どおり / ずれた時刻で）。
 * To‑Do の一覧のチェックと、通知の「記録する」で共有する。`modal` を描画しておくこと。
 */
export function useCompleteWithLog() {
  const { t } = useTranslation()
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const [draft, setDraft] = useState<CompleteWithLogDraft | null>(null)

  /** 時刻の無い予定・完了済みはそのまま切り替える（`toggleIfNoTimes` が false なら何もしない） */
  const open = useCallback(
    (task: Task, { toggleIfNoTimes = true }: { toggleIfNoTimes?: boolean } = {}) => {
      const placement = taskPlacementDate(task)
      if (task.completed || isListedTimeLog(task) || !placement || !task.startTime || !task.endTime) {
        if (toggleIfNoTimes) toggleTask(task.id)
        return
      }
      setDraft({
        taskId: task.id,
        title: task.title,
        date: placement,
        endDate: task.endDate ?? placement,
        startTime: task.startTime,
        endTime: task.endTime,
        memo: task.description.trim(),
        mode: 'as-planned',
        tags: logTagsFromTask(task, useTaskStore.getState().timeLogTagPresets, useTaskStore.getState().logCategoryColors),
      })
    },
    [toggleTask],
  )

  const submit = useCallback(() => {
    if (!draft) return
    const memo = draft.memo.trim()
    const endDateArg = draft.endDate !== draft.date ? draft.endDate : null
    const dur = durationMinutesForTaskSlot({
      dueDate: draft.date,
      endDate: endDateArg,
      startTime: draft.startTime,
      endTime: draft.endTime,
      isTimeLog: true,
    })
    if (dur == null || dur <= 0) {
      alert(t('alert.endAfterStart'))
      return
    }
    addTimeLog(draft.title, draft.date, draft.startTime, draft.endTime, draft.tags, memo || undefined, endDateArg)
    toggleTask(draft.taskId)
    setDraft(null)
  }, [draft, addTimeLog, toggleTask, t])

  const modal = draft ? (
    <CompleteWithLogModal
      draft={draft}
      radioGroupName="completion-mode"
      onClose={() => setDraft(null)}
      onChange={(patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
      onSubmit={submit}
    />
  ) : null

  return { open, modal }
}
