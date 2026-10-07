import { useEffect } from 'react'
import { OverlaySuspense } from './ui/OverlaySuspense'
import { PartBoundary } from './ui/ErrorBoundary'
import { useTaskStore } from '../store/taskStore'
import { closeTaskDetail, closeTaskMenu, openTaskDetail, useOverlays } from '../lib/overlays'
import { DueDateTimeMenu, GoogleEventMenu, preloadOverlays, TaskContextMenu, TaskDetail, TaskEventMenu, TimeSlotMenu } from './lazyOverlays'
import { usePresence } from '../hooks/usePresence'

/** タスクの詳細と右クリックメニューの置き場（App に 1 つ）。開くのは `openTaskDetail` / `openTaskMenu` */
export function OverlayHost() {
  const detailTaskId = useOverlays((s) => s.detailTaskId)
  const menu = useOverlays((s) => s.menu)
  const detailTask = useTaskStore((s) => (detailTaskId ? (s.tasks.find((t) => t.id === detailTaskId) ?? null) : null))
  // 閉じたあとも、右へ引っ込む動きのあいだは残す
  const detail = usePresence(detailTask)
  // 詳細・メニューは別ファイル。最初に開くときも待たないよう、手すきのときに読んでおく
  useEffect(() => preloadOverlays(), [])
  // 詳細・メニューで落ちても、その部品だけ閉じる（メイン画面と書きかけは残す）
  const menuKey = menu ? `${menu.kind}:${menu.x},${menu.y}` : ''
  return (
    <>
      <PartBoundary name="detail" resetKey={detailTaskId ?? ''} onCrash={closeTaskDetail}>
        <OverlaySuspense>
          {detail.shown && <TaskDetail task={detail.shown} closing={detail.closing} onClose={closeTaskDetail} />}
        </OverlaySuspense>
      </PartBoundary>
      <PartBoundary name="menu" resetKey={menuKey} onCrash={closeTaskMenu}>
        <OverlaySuspense>
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
          {menu?.kind === 'event' && (
            <TaskEventMenu x={menu.x} y={menu.y} taskId={menu.taskId} onClose={closeTaskMenu} onOpenDetail={openTaskDetail} />
          )}
          {menu?.kind === 'timeSlot' && (
            <TimeSlotMenu key={menu.taskId} x={menu.x} y={menu.y} taskId={menu.taskId} dateKey={menu.dateKey} onClose={closeTaskMenu} />
          )}
          {menu?.kind === 'dueDateTime' && (
            <DueDateTimeMenu x={menu.x} y={menu.y} taskIds={menu.taskIds} onClose={closeTaskMenu} onDone={menu.onDone} />
          )}
          {menu?.kind === 'google' && <GoogleEventMenu x={menu.x} y={menu.y} eventId={menu.eventId} onClose={closeTaskMenu} />}
        </OverlaySuspense>
      </PartBoundary>
    </>
  )
}
