import { useCallback, useState } from 'react'
import { OverlaySuspense } from '../components/ui/OverlaySuspense'
import { useTaskStore } from '../store/taskStore'
import { isEventTask, isLogTask, type Task } from '../types/task'
import type { CompleteWithLogDraft } from '../components/CompleteWithLogModal'
import { CompleteWithLogModal } from '../components/lazyOverlays'
import { isCompleteDraftValid } from '../lib/completeWithLogDraft'
import { taskPlacementDate } from '../lib/taskTimeRange'
import { logLabelFromTask } from '../lib/logCategoryColors'
import { PartBoundary } from '../components/ui/ErrorBoundary'

/**
 * 時間を決めた予定を「完了＋記録」にする（時刻欄は予定の時刻で埋めておき、ずれたらそこを直す）。
 * 通知の「記録する」から開く（完了の丸は記録を足さず完了だけ）。`modal` を描画しておくこと。
 */
export function useCompleteWithLog() {
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const [draft, setDraft] = useState<CompleteWithLogDraft | null>(null)

  /** 時刻の無い予定・完了済みは何もしない */
  const open = useCallback((task: Task) => {
    const placement = taskPlacementDate(task)
    if (task.completed || isLogTask(task) || !placement || !task.startTime || !task.endTime) return
    setDraft({
      taskId: task.id,
      title: task.title,
      date: placement,
      endDate: task.endDate ?? placement,
      startTime: task.startTime,
      endTime: task.endTime,
      memo: task.description.trim(),
      fromEvent: isEventTask(task),
      ...logLabelFromTask(task, useTaskStore.getState().timeLogTagPresets, useTaskStore.getState().logCategoryColors),
    })
  }, [])

  const submit = useCallback(() => {
    if (!draft) return
    // 終了が開始より前なら、画面の赤字と押せない保存ボタンで知らせている
    if (!isCompleteDraftValid(draft)) return
    const memo = draft.memo.trim()
    const endDateArg = draft.endDate !== draft.date ? draft.endDate : null
    // 記録を足して完了にする 1 つの操作なので、元に戻すも 1 回で両方戻す。予定は記録を足すだけ（完了が無い）
    useTaskStore.getState().asOneUndo(() => {
      addTimeLog(draft.title, draft.date, draft.startTime, draft.endTime, draft.tags, memo || undefined, endDateArg, draft.color)
      if (!draft.fromEvent) toggleTask(draft.taskId)
    })
    setDraft(null)
  }, [draft, addTimeLog, toggleTask])

  const modal = draft ? (
    <PartBoundary name="completeWithLog" onCrash={() => setDraft(null)}>
      <OverlaySuspense>
        <CompleteWithLogModal
          draft={draft}
          onClose={() => setDraft(null)}
          onChange={(patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
          onSubmit={submit}
        />
      </OverlaySuspense>
    </PartBoundary>
  ) : null

  return { open, modal }
}
