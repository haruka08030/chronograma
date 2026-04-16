import { useMemo, useState } from 'react'
import { useTaskStore, type SortMode } from '../store/taskStore'
import { SortableTaskItem, TASK_PREFIX } from './SortableTaskItem'
import { TaskItem } from './TaskItem'
import { TaskDetail } from './TaskDetail'
import { QuickAdd } from './QuickAdd'
import { isToday, parseISO, addDays, isBefore, isSameDay, startOfDay } from 'date-fns'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

const VIEW_LABELS: Record<string, string> = {
  all: 'すべて', today: '今日', upcoming: '近日中',
  calendar: 'カレンダー', 'week-calendar': '週カレンダー',
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'manual', label: '手動' },
  { value: 'dueDate', label: '期限日' },
  { value: 'priority', label: '優先度' },
  { value: 'title', label: 'タイトル' },
  { value: 'createdAt', label: '作成日' },
]

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 }

export function TaskList() {
  const tasks = useTaskStore((s) => s.tasks)
  const selectedListId = useTaskStore((s) => s.selectedListId)
  const selectedView = useTaskStore((s) => s.selectedView)
  const lists = useTaskStore((s) => s.lists)
  const sortMode = useTaskStore((s) => s.sortMode)
  const setSortMode = useTaskStore((s) => s.setSortMode)
  const filterTag = useTaskStore((s) => s.filterTag)
  const setFilterTag = useTaskStore((s) => s.setFilterTag)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [showSort, setShowSort] = useState(false)

  const currentList = selectedListId ? lists.find((l) => l.id === selectedListId) : null
  const title = selectedView ? VIEW_LABELS[selectedView] ?? '' : (currentList?.name ?? 'タスク')

  const filtered = useMemo(() => {
    let result = tasks.filter((t) => t.parentId === null)

    if (selectedView === 'today') {
      result = result.filter((t) => t.dueDate && isToday(parseISO(t.dueDate)))
    } else if (selectedView === 'upcoming') {
      const today = startOfDay(new Date())
      const limit = startOfDay(addDays(new Date(), 7))
      result = result.filter((t) => {
        if (!t.dueDate) return false
        const d = parseISO(t.dueDate)
        return (isSameDay(d, today) || isBefore(today, d)) && (isBefore(d, limit) || isSameDay(d, limit))
      })
    } else if (selectedView === 'all') {
      // show all
    } else if (selectedListId) {
      result = result.filter((t) => t.listId === selectedListId)
    }

    if (filterTag) {
      result = result.filter((t) => t.tags?.includes(filterTag))
    }

    switch (sortMode) {
      case 'dueDate':
        return result.sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return a.order - b.order
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return a.dueDate.localeCompare(b.dueDate)
        })
      case 'priority':
        return result.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))
      case 'title':
        return result.sort((a, b) => a.title.localeCompare(b.title, 'ja'))
      case 'createdAt':
        return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      default:
        return result.sort((a, b) => a.order - b.order)
    }
  }, [tasks, selectedView, selectedListId, sortMode, filterTag])

  const active = filtered.filter((t) => !t.completed)
  const completed = filtered.filter((t) => t.completed)
  const showQuickAdd = selectedView === null || selectedView === 'all' || selectedView === 'today' || selectedView === 'upcoming'
  const detailTask = detailId ? tasks.find((t) => t.id === detailId) : null
  const canDrag = sortMode === 'manual'

  const activeContent = canDrag ? (
    <SortableContext items={active.map((t) => `${TASK_PREFIX}${t.id}`)} strategy={verticalListSortingStrategy}>
      {active.map((t) => (
        <SortableTaskItem key={t.id} task={t} onClick={() => setDetailId(t.id)} />
      ))}
    </SortableContext>
  ) : (
    active.map((t) => (
      <TaskItem key={t.id} task={t} onClick={() => setDetailId(t.id)} />
    ))
  )

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <div className="px-6 pt-8 pb-2 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                {active.length} 件の未完了タスク
              </p>
              {filterTag && (
                <button
                  onClick={() => setFilterTag(null)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md
                             bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400
                             hover:bg-accent-100 dark:hover:bg-accent-500/20 transition-colors"
                >
                  {filterTag}
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSort(!showSort)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg
                         text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
              </svg>
              {SORT_OPTIONS.find((o) => o.value === sortMode)?.label}
            </button>
            {showSort && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-zinc-800 rounded-lg shadow-lg
                                border border-zinc-200 dark:border-zinc-700 py-1 min-w-[120px]">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortMode(opt.value); setShowSort(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors
                        ${sortMode === opt.value
                          ? 'text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-500/10'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 px-4 pb-4 space-y-0.5">
          {active.length === 0 && !showQuickAdd && (
            <div className="py-16 text-center">
              <svg className="w-16 h-16 mx-auto text-zinc-200 dark:text-zinc-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-zinc-400 dark:text-zinc-500">すべて完了です！</p>
              <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">お疲れさまでした</p>
            </div>
          )}

          {activeContent}

          {showQuickAdd && (
            <div className="pt-2">
              <QuickAdd />
            </div>
          )}

          {completed.length > 0 && (
            <details className="pt-4">
              <summary className="text-xs font-medium text-zinc-400 dark:text-zinc-500 cursor-pointer select-none px-4 py-2">
                完了済み ({completed.length})
              </summary>
              <div className="space-y-0.5 mt-1">
                {completed.map((t) => (
                  <TaskItem key={t.id} task={t} onClick={() => setDetailId(t.id)} />
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {detailTask && (
        <TaskDetail task={detailTask} onClose={() => setDetailId(null)} />
      )}
    </>
  )
}