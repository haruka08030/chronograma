import { useTaskStore } from '../store/taskStore'
import { closeTaskDetail, closeTaskMenu, openTaskDetail, useOverlays } from '../lib/overlays'
import { TaskDetail } from './TaskDetail'
import { TaskContextMenu } from './TaskContextMenu'
import { GoogleEventMenu, TaskEventMenu } from './timeline/EventContextMenu'

/** タスクの詳細と右クリックメニューの置き場（App に 1 つ）。開くのは `openTaskDetail` / `openTaskMenu` */
export function OverlayHost() {
  const detailTaskId = useOverlays((s) => s.detailTaskId)
  const menu = useOverlays((s) => s.menu)
  const detailTask = useTaskStore((s) => (detailTaskId ? s.tasks.find((t) => t.id === detailTaskId) ?? null : null))
  return (
    <>
      {detailTask && <TaskDetail task={detailTask} onClose={closeTaskDetail} />}
      {menu?.kind === 'task' && (
        <TaskContextMenu
          x={menu.x}
          y={menu.y}
          above={menu.above}
          taskIds={menu.taskIds}
          onClose={closeTaskMenu}
          onDone={menu.onDone}
          onOpenDetail={openTaskDetail}
        />
      )}
      {menu?.kind === 'event' && <TaskEventMenu x={menu.x} y={menu.y} taskId={menu.taskId} onClose={closeTaskMenu} onOpenDetail={openTaskDetail} />}
      {menu?.kind === 'google' && <GoogleEventMenu x={menu.x} y={menu.y} eventId={menu.eventId} onClose={closeTaskMenu} />}
    </>
  )
}
