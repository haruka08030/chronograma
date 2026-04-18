import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useDndMonitor } from '@dnd-kit/core'
import { useTaskStore, type SortMode } from '../store/taskStore'
import { SortableTaskItem, TASK_PREFIX } from './SortableTaskItem'
import { TaskItem, type TaskItemSelection } from './TaskItem'
import { TaskDetail } from './TaskDetail'
import { QuickAdd } from './QuickAdd'
import type { Priority } from '../types/task'
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

const BULK_PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
  { value: 'none', label: 'なし' },
]

export function TaskList() {
  const tasks = useTaskStore((s) => s.tasks)
  const selectedListId = useTaskStore((s) => s.selectedListId)
  const selectedView = useTaskStore((s) => s.selectedView)
  const lists = useTaskStore((s) => s.lists)
  const sortMode = useTaskStore((s) => s.sortMode)
  const setSortMode = useTaskStore((s) => s.setSortMode)
  const filterTag = useTaskStore((s) => s.filterTag)
  const setFilterTag = useTaskStore((s) => s.setFilterTag)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const bulkUpdateTasks = useTaskStore((s) => s.bulkUpdateTasks)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [showSort, setShowSort] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const lastAnchorRef = useRef<string | null>(null)

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    lastAnchorRef.current = null
  }, [])

  useEffect(() => {
    clearSelection()
  }, [selectedListId, selectedView, filterTag, sortMode, clearSelection])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = document.activeElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      if (t instanceof HTMLElement && t.isContentEditable) return
      if (selectedRef.current.size === 0) return
      e.preventDefault()
      clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection, selected.size])

  const dndMonitor = useMemo(
    () => ({
      onDragStart({ active }: { active: { id: string | number } }) {
        const id = String(active.id)
        if (id.startsWith(TASK_PREFIX)) clearSelection()
      },
    }),
    [clearSelection],
  )
  useDndMonitor(dndMonitor)

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

  /** 親 ID → サブタスク（`order` 昇順）。TickTick 風に一覧で親の直下へ出す */
  const childrenByParent = useMemo(() => {
    const m = new Map<string, typeof tasks>()
    for (const t of tasks) {
      if (!t.parentId) continue
      const arr = m.get(t.parentId)
      if (arr) arr.push(t)
      else m.set(t.parentId, [t])
    }
    for (const arr of m.values()) arr.sort((a, b) => a.order - b.order)
    return m
  }, [tasks])

  const incompleteCount = useMemo(() => {
    let n = 0
    for (const p of filtered) {
      if (!p.completed) n++
      for (const st of childrenByParent.get(p.id) ?? []) {
        if (!st.completed) n++
      }
    }
    return n
  }, [filtered, childrenByParent])

  const active = filtered.filter((t) => !t.completed)
  const completed = filtered.filter((t) => t.completed)
  const showQuickAdd = selectedView === null || selectedView === 'all' || selectedView === 'today' || selectedView === 'upcoming'
  const detailTask = detailId ? tasks.find((t) => t.id === detailId) : null
  const canDrag = sortMode === 'manual'

  const flatActiveIds = useMemo(() => {
    const out: string[] = []
    for (const p of active) {
      out.push(p.id)
      for (const st of childrenByParent.get(p.id) ?? []) {
        if (!st.completed) out.push(st.id)
      }
    }
    return out
  }, [active, childrenByParent])

  const flatCompletedIds = useMemo(() => {
    const out: string[] = []
    for (const p of completed) {
      out.push(p.id)
      for (const st of childrenByParent.get(p.id) ?? []) {
        out.push(st.id)
      }
    }
    return out
  }, [completed, childrenByParent])

  const flatCombined = useMemo(
    () => [...flatActiveIds, ...flatCompletedIds],
    [flatActiveIds, flatCompletedIds],
  )

  const toggleInSelection = useCallback((taskId: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(taskId)) n.delete(taskId)
      else n.add(taskId)
      return n
    })
    lastAnchorRef.current = taskId
  }, [])

  const makeRowClick = useCallback(
    (taskId: string) => (e: React.MouseEvent) => {
      if (e.shiftKey && lastAnchorRef.current !== null) {
        const anchor = lastAnchorRef.current
        const ia = flatCombined.indexOf(anchor)
        const ib = flatCombined.indexOf(taskId)
        if (ia >= 0 && ib >= 0) {
          const lo = Math.min(ia, ib)
          const hi = Math.max(ia, ib)
          setSelected((prev) => {
            const n = new Set(prev)
            for (let i = lo; i <= hi; i++) n.add(flatCombined[i])
            return n
          })
        }
        lastAnchorRef.current = taskId
        return
      }
      if (e.metaKey || e.ctrlKey) {
        toggleInSelection(taskId)
        return
      }
      if (selectedRef.current.size > 0) {
        toggleInSelection(taskId)
        return
      }
      setDetailId(taskId)
      lastAnchorRef.current = taskId
    },
    [flatCombined, toggleInSelection],
  )

  const makeSelection = useCallback(
    (taskId: string): TaskItemSelection => ({
      selected: selected.has(taskId),
      reveal: selected.size > 0,
      onToggle: () => toggleInSelection(taskId),
    }),
    [selected, toggleInSelection],
  )

  const selectedIds = useMemo(() => [...selected], [selected])

  const bulkComplete = useCallback(() => {
    const ids = [...selected]
    for (const id of ids) toggleTask(id)
    clearSelection()
  }, [selected, toggleTask, clearSelection])

  const bulkDelete = useCallback(() => {
    if (selected.size === 0) return
    deleteTasks([...selected])
    clearSelection()
  }, [selected, deleteTasks, clearSelection])

  const sortedLists = useMemo(() => [...lists].sort((a, b) => a.order - b.order), [lists])

  const subtaskNestClass =
    'pl-11 ml-3 border-l border-zinc-200 dark:border-zinc-700'

  const activeContent = canDrag ? (
    <SortableContext items={active.map((t) => `${TASK_PREFIX}${t.id}`)} strategy={verticalListSortingStrategy}>
      {active.map((t) => (
        <SortableTaskItem
          key={t.id}
          task={t}
          onRowClick={makeRowClick(t.id)}
          selection={makeSelection(t.id)}
        >
          {(childrenByParent.get(t.id) ?? [])
            .filter((st) => !st.completed)
            .map((st) => (
              <div key={st.id} className={subtaskNestClass}>
                <TaskItem task={st} isSubtask onRowClick={makeRowClick(st.id)} selection={makeSelection(st.id)} />
              </div>
            ))}
        </SortableTaskItem>
      ))}
    </SortableContext>
  ) : (
    active.map((t) => (
      <div key={t.id}>
        <TaskItem task={t} onRowClick={makeRowClick(t.id)} selection={makeSelection(t.id)} />
        {(childrenByParent.get(t.id) ?? [])
          .filter((st) => !st.completed)
          .map((st) => (
            <div key={st.id} className={subtaskNestClass}>
              <TaskItem task={st} isSubtask onRowClick={makeRowClick(st.id)} selection={makeSelection(st.id)} />
            </div>
          ))}
      </div>
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
                {incompleteCount} 件の未完了タスク
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

        {selected.size > 0 && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/90 dark:bg-zinc-800/80
                          flex flex-wrap items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200">
            <span className="font-medium text-zinc-600 dark:text-zinc-300 mr-1">{selected.size} 件選択中</span>
            <button
              type="button"
              onClick={bulkComplete}
              className="px-2 py-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              完了にする
            </button>
            <button
              type="button"
              onClick={bulkDelete}
              className="px-2 py-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400"
            >
              削除
            </button>
            <label className="inline-flex items-center gap-1">
              <span className="text-zinc-500 dark:text-zinc-400">リスト</span>
              <select
                className="max-w-[140px] rounded-md border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-1.5 py-1 text-xs"
                value=""
                onChange={(e) => {
                  const listId = e.target.value
                  e.target.value = ''
                  if (!listId) return
                  bulkUpdateTasks(selectedIds, { listId })
                }}
              >
                <option value="">移動…</option>
                {sortedLists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1">
              <span className="text-zinc-500 dark:text-zinc-400">優先度</span>
              <select
                className="rounded-md border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-1.5 py-1 text-xs"
                value=""
                onChange={(e) => {
                  const v = e.target.value as Priority | ''
                  e.target.value = ''
                  if (!v) return
                  bulkUpdateTasks(selectedIds, { priority: v })
                }}
              >
                <option value="">設定…</option>
                {BULK_PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1">
              <span className="text-zinc-500 dark:text-zinc-400">期限</span>
              <input
                type="date"
                className="rounded-md border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-1 py-0.5 text-xs w-[118px]"
                onChange={(e) => {
                  const v = e.target.value
                  e.target.value = ''
                  if (!v) return
                  bulkUpdateTasks(selectedIds, { dueDate: v })
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => bulkUpdateTasks(selectedIds, { dueDate: null })}
              className="px-2 py-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              期限なし
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="px-2 py-1 rounded-md text-zinc-500 dark:text-zinc-400 hover:underline"
            >
              選択解除
            </button>
          </div>
        )}

        <div className="flex-1 px-4 pb-4 space-y-0.5">
          {showQuickAdd && <QuickAdd />}

          {incompleteCount === 0 && !showQuickAdd && (
            <div className="py-16 text-center">
              <svg className="w-16 h-16 mx-auto text-zinc-200 dark:text-zinc-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-zinc-400 dark:text-zinc-500">すべて完了です！</p>
              <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">お疲れさまでした</p>
            </div>
          )}

          {activeContent}

          {completed.length > 0 && (
            <details className="pt-4">
              <summary className="text-xs font-medium text-zinc-400 dark:text-zinc-500 cursor-pointer select-none px-4 py-2">
                完了済み ({completed.length})
              </summary>
              <div className="space-y-0.5 mt-1">
                {completed.map((t) => (
                  <div key={t.id}>
                    <TaskItem task={t} onRowClick={makeRowClick(t.id)} selection={makeSelection(t.id)} />
                    {(childrenByParent.get(t.id) ?? []).map((st) => (
                      <div key={st.id} className={subtaskNestClass}>
                        <TaskItem task={st} isSubtask onRowClick={makeRowClick(st.id)} selection={makeSelection(st.id)} />
                      </div>
                    ))}
                  </div>
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
