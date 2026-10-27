import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useTaskStore } from '../store/taskStore'
import { clearCanvasSubmittedAsk, useCanvasSubmittedAsk } from '../lib/canvasSubmitted'
import { toastTitle } from '../lib/undoWindow'
import { Toast } from './ui/Toast'
import { toastButtonClass } from './ui/toastClass'
import { usePresence } from '../hooks/usePresence'
import type { Task } from '../types/task'

/** 答えなければこの長さで閉じる（未完了のまま、行の「提出済み」で分かる） */
const ASK_MS = 12_000
const NO_TASKS: Task[] = []

/**
 * Canvas で提出済みになった課題を、一度だけ「終わりましたか？」と聞く（#395）。
 * 途中保存・下書きでも Canvas は提出済みにするので、完了にするかは利用者が決める。
 * 画面の真ん中には出さない（取り込みは開いたとき・数分おきに走り、入力の途中に割り込むため）。
 * 何件か一度に提出済みになったら 1 つにまとめて聞く。
 */
export function CanvasSubmittedToast() {
  const { t } = useTranslation()
  const ask = useCanvasSubmittedAsk()
  const tasks = useTaskStore(
    useShallow((s) => {
      if (ask.length === 0) return NO_TASKS
      const ids = new Set(ask)
      return s.tasks.filter((x) => ids.has(x.id) && !x.completed && !x.archivedAt && !x.deletedAt)
    }),
  )
  const completeTasks = useTaskStore((s) => s.completeTasks)

  const message = useMemo(() => {
    if (tasks.length === 0) return null
    if (tasks.length === 1) return t('canvas.submittedAsk', { title: toastTitle(tasks[0].title) })
    return t('canvas.submittedAskMany', { count: tasks.length })
  }, [tasks, t])

  // 聞く相手が無い（もう完了にした・消した）なら、聞く列を空にする
  useEffect(() => {
    if (ask.length > 0 && tasks.length === 0 && useTaskStore.getState().tasks.length > 0) clearCanvasSubmittedAsk()
  }, [ask, tasks])

  // 見ている間だけ数える（裏のタブで時間切れにしない）
  useEffect(() => {
    if (!message) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      if (document.visibilityState !== 'visible' || timer) return
      timer = setTimeout(clearCanvasSubmittedAsk, ASK_MS)
    }
    arm()
    document.addEventListener('visibilitychange', arm)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', arm)
    }
  }, [message])

  const toast = usePresence(message)
  if (toast.shown === null) return null

  return (
    <Toast closing={toast.closing}>
      <span className="min-w-0 line-clamp-3">{toast.shown}</span>
      <button
        onClick={() => {
          completeTasks(tasks.map((x) => x.id))
          clearCanvasSubmittedAsk()
        }}
        className={toastButtonClass()}
      >
        {t('canvas.submittedComplete')}
      </button>
      <button onClick={clearCanvasSubmittedAsk} className={toastButtonClass(true)}>
        {t('canvas.submittedNotYet')}
      </button>
    </Toast>
  )
}
