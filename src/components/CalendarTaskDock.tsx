import { useMemo, useState } from 'react'
import { useTaskStore, INBOX_LIST_ID } from '../store/taskStore'
import { getFilteredRootTasks } from '../lib/mainListTasks'
import { TaskItem } from './TaskItem'
import { TaskDetail } from './TaskDetail'

export function CalendarTaskDock() {
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const sortMode = useTaskStore((s) => s.sortMode)
  const filterTag = useTaskStore((s) => s.filterTag)
  const sections = useTaskStore((s) => s.sections)

  const [dockListId, setDockListId] = useState(INBOX_LIST_ID)
  const [detailId, setDetailId] = useState<string | null>(null)

  const sortedLists = useMemo(() => [...lists].sort((a, b) => a.order - b.order), [lists])

  const filtered = useMemo(
    () =>
      getFilteredRootTasks({
        tasks,
        selectedView: null,
        selectedListId: dockListId,
        sortMode,
        filterTag,
        sections,
      }),
    [tasks, dockListId, sortMode, filterTag, sections],
  )

  const active = filtered.filter((t) => !t.completed)
  const completed = filtered.filter((t) => t.completed)
  const detailTask = detailId ? tasks.find((t) => t.id === detailId) : null

  return (
    <>
      <div className="flex h-full min-h-0 min-w-0 flex-col bg-zinc-50/80 dark:bg-zinc-900/80">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <label htmlFor="calendar-dock-list" className="shrink-0 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            リスト
          </label>
          <select
            id="calendar-dock-list"
            value={dockListId}
            onChange={(e) => setDockListId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {sortedLists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {active.length === 0 && completed.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">タスクがありません</p>
          )}
          {active.map((t) => (
            <TaskItem key={t.id} task={t} onClick={() => setDetailId(t.id)} />
          ))}
          {completed.length > 0 && (
            <div className="pt-2">
              <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">完了</div>
              {completed.map((t) => (
                <TaskItem key={t.id} task={t} onClick={() => setDetailId(t.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
      {detailTask && <TaskDetail task={detailTask} onClose={() => setDetailId(null)} />}
    </>
  )
}
