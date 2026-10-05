import { useCallback } from 'react'
import { useTaskStore } from '../store/taskStore'
import { openTaskDetail, openTaskMenu } from '../lib/overlays'
import { useIsCoarsePointer } from './useMediaQuery'

/**
 * タスクの行を押したとき（今日の計画・To-Do で共通）。
 * 指で押す画面では、全画面の詳細ではなく短いシート（今日やる・明日へ / 記録開始 / 完了 / 予定日 / 期限 / 詳細を開く）を出す。
 * 行を押すのはたいてい「終えた・明日へ・始める」なので、詳細はシートの下から開く。PC と完了済みの行はそのまま詳細
 */
export function useOpenTaskRow() {
  const isCoarse = useIsCoarsePointer()
  return useCallback(
    (id: string) => {
      const task = useTaskStore.getState().tasks.find((x) => x.id === id)
      if (!isCoarse || !task || task.completed) {
        openTaskDetail(id)
        return
      }
      const row = document.querySelector(`[data-task-row="${id}"]`)?.getBoundingClientRect()
      openTaskMenu({ kind: 'task', x: row?.left ?? 0, y: row?.bottom ?? 0, taskIds: [id], quick: true })
    },
    [isCoarse],
  )
}
