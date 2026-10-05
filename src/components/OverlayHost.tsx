import { Suspense, useEffect } from 'react'
import { useTaskStore } from '../store/taskStore'
import { closeTaskDetail, closeTaskMenu, openTaskDetail, useOverlays } from '../lib/overlays'
import { GoogleEventMenu, preloadOverlays, TaskContextMenu, TaskDetail, TaskEventMenu, TimeSlotMenu } from './lazyOverlays'
import { usePresence } from '../hooks/usePresence'

/** タスクの詳細と右クリックメニューの置き場（App に 1 つ）。開くのは `openTaskDetail` / `openTaskMenu` */
export function OverlayHost() {
  const detailTaskId = useOverlays((s) => s.detailTaskId)
  const menu = useOverlays((s) => s.menu)
  const detailTask = useTaskStore((s) => (detailTaskId ? s.tasks.find((t) => t.id === detailTaskId) ?? null : null))
  // 閉じたあとも、右へ引っ込む動きのあいだは残す
  const detail = usePresence(detailTask)
  // 詳細・メニューは別ファイル。最初に開くときも待たないよう、手すきのときに読んでおく
  useEffect(() => preloadOverlays(), [])
  return (
    <Suspense fallback={null}>
      {detail.shown && <TaskDetail task={detail.shown} closing={detail.closing} onClose={closeTaskDetail} />}
      {menu?.kind === 'task' && (
        <TaskContextMenu
          x={menu.x}
          y={menu.y}
          above={menu.above}
          quick={menu.quick}
          taskIds={menu.taskIds}
          onClose={closeTaskMenu}
          onDone={menu.onDone}
          onOpenDetail={openTaskDetail}
        />
      )}
      {menu?.kind === 'event' && <TaskEventMenu x={menu.x} y={menu.y} taskId={menu.taskId} onClose={closeTaskMenu} onOpenDetail={openTaskDetail} />}
      {menu?.kind === 'timeSlot' && (
        <TimeSlotMenu key={menu.taskId} x={menu.x} y={menu.y} taskId={menu.taskId} dateKey={menu.dateKey} onClose={closeTaskMenu} />
      )}
      {menu?.kind === 'google' && <GoogleEventMenu x={menu.x} y={menu.y} eventId={menu.eventId} onClose={closeTaskMenu} />}
    </Suspense>
  )
}
