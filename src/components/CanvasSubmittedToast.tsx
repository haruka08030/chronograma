import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useTaskStore } from '../store/taskStore'
import { clearCanvasSubmittedAsk, useCanvasSubmittedAsk } from '../lib/canvasSubmitted'
import { toastTitle } from '../lib/undoWindow'
import { INVERSE_SURFACE } from './ui/surface'
import { usePresence } from '../hooks/usePresence'
import type { Task } from '../types/task'

const MOBILE_FLOAT_BOTTOM = 'bottom-[calc(3.5rem+0.75rem+env(safe-area-inset-bottom))] md:bottom-6'
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
  const activeTimer = useTaskStore((s) => s.activeTimer)

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

  const stacked = activeTimer ? 'bottom-[calc(3.5rem+4.5rem+env(safe-area-inset-bottom))] md:bottom-24' : MOBILE_FLOAT_BOTTOM
  const button = 'shrink-0 font-semibold underline-offset-2 touch-manipulation hover:underline'

  return (
    <div
      className={`fixed left-1/2 z-50 -translate-x-1/2 ${toast.closing ? 'animate-toast-out' : 'animate-toast-in'} ${stacked}`}
      inert={toast.closing}
    >
      <div
        role="status"
        className={`mx-3 flex w-max max-w-[min(100vw-1.5rem,32rem)] items-center gap-3 rounded-xl px-4 py-3 text-sm ${INVERSE_SURFACE}`}
      >
        <span className="min-w-0 line-clamp-3">{toast.shown}</span>
        <button
          onClick={() => {
            completeTasks(tasks.map((x) => x.id))
            clearCanvasSubmittedAsk()
          }}
          className={`${button} text-white dark:text-zinc-900`}
        >
          {t('canvas.submittedComplete')}
        </button>
        <button onClick={clearCanvasSubmittedAsk} className={`${button} text-zinc-300 dark:text-zinc-600`}>
          {t('canvas.submittedNotYet')}
        </button>
      </div>
    </div>
  )
}
