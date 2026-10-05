import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useDroppable } from '@dnd-kit/core'
import { useTaskStore } from '../store/taskStore'
import { TASK_DND_TYPE } from '../lib/useTimelineDrop'
import { acceptTaskDrag } from '../lib/taskDrag'
import {
  TIMER_DROP_ATTR,
  TIMER_DROP_ID,
  canStartTimerFor,
  setTimerDragActive,
  setTimerDropHover,
  startTimerForTask,
  useTimerDrop,
} from '../lib/timerDrop'

/**
 * どの画面でも、ToDo をつかんでいる間だけ上部に出る「ここに落として計測開始」。
 * 下は ToDo 一覧（ToDo に戻す）・スマホのリスト帯・計測中のタイマーが使うので、上に置く。
 * DndContext の直下で使う（dnd-kit のドラッグも受けるため）
 */
export function TimerDropZone() {
  const { t } = useTranslation()
  const { active, over } = useTimerDrop()
  const running = useTaskStore((s) => s.activeTimer != null)

  // ネイティブ D&D: React のハンドラが setData した後、window のバブリングで拾う。
  // dragstart 中に DOM を変えるとドラッグが切れるので、出すのは次のタスクで
  useEffect(() => {
    const onStart = (e: DragEvent) => {
      const id = e.dataTransfer?.getData(TASK_DND_TYPE)
      if (!id) return
      const task = useTaskStore.getState().tasks.find((x) => x.id === id)
      if (canStartTimerFor(task)) window.setTimeout(() => setTimerDragActive(true), 0)
    }
    // 落とし先の drop ハンドラより先に消すと drop が届かないので、次のタスクで閉じる
    const onEnd = () => {
      window.setTimeout(() => setTimerDragActive(false), 0)
    }
    window.addEventListener('dragstart', onStart)
    window.addEventListener('dragend', onEnd)
    window.addEventListener('drop', onEnd)
    return () => {
      window.removeEventListener('dragstart', onStart)
      window.removeEventListener('dragend', onEnd)
      window.removeEventListener('drop', onEnd)
    }
  }, [])

  if (!active) return null
  return <TimerDropTarget over={over} label={running ? t('timerDrop.switch') : t('timerDrop.start')} />
}

function TimerDropTarget({ over, label }: { over: boolean; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: TIMER_DROP_ID })
  const highlighted = over || isOver
  return (
    <div
      ref={setNodeRef}
      {...{ [TIMER_DROP_ATTR]: '' }}
      role="region"
      aria-label={label}
      onDragOver={(e) => {
        if (acceptTaskDrag(e)) setTimerDropHover(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setTimerDropHover(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setTimerDropHover(false)
        const id = e.dataTransfer.getData(TASK_DND_TYPE)
        if (id) startTimerForTask(id)
      }}
      className={`fixed left-1/2 z-[60] -translate-x-1/2 top-[calc(0.75rem+env(safe-area-inset-top))]
        flex items-center gap-2.5 whitespace-nowrap rounded-full border px-5 py-3 text-sm font-medium shadow-xl
        transition-[scale,background-color,border-color,box-shadow] duration-150
        ${
          highlighted
            ? 'scale-105 border-accent-400 bg-accent-50 text-accent-700 ring-2 ring-accent-400 dark:border-accent-400 dark:bg-zinc-800 dark:text-accent-300'
            : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
        }`}
    >
      <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full bg-red-500 ${highlighted ? 'animate-pulse' : ''}`} />
      {label}
    </div>
  )
}
