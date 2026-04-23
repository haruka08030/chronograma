import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useDndMonitor, useDroppable } from '@dnd-kit/core'
import { useTaskStore, type SortMode } from '../store/taskStore'
import {
  getFilteredRootTasks,
  getOrderedActiveRootTasksForDnD,
  sectionDropId,
} from '../lib/mainListTasks'
import { isListedTimeLog } from '../lib/timeLogTask'
import { isModKey } from '../lib/keyboard'
import { SortableTaskItem, TASK_PREFIX } from './SortableTaskItem'
import { SectionHeaderDnD } from './SectionHeaderDnD'
import { DRAGSEC_PREFIX } from '../lib/sectionReorderDnD'
import { TaskItem, type TaskItemSelection } from './TaskItem'
import { TaskDetail } from './TaskDetail'
import { QuickAdd } from './QuickAdd'
import { TimeInput } from './TimeInput'
import type { Priority, Task } from '../types/task'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

const VIEW_LABELS: Record<string, string> = {
  all: 'すべて', today: '今日', upcoming: '近日中', overdue: '期限切れ',
  calendar: 'カレンダー',
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'manual', label: '手動' },
  { value: 'dueDate', label: '期限日' },
  { value: 'priority', label: '優先度' },
  { value: 'title', label: 'タイトル' },
  { value: 'createdAt', label: '作成日' },
]

function SectionDropZone({ listId, sectionId }: { listId: string; sectionId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: sectionDropId(listId, sectionId) })
  return (
    <div
      ref={setNodeRef}
      className={`min-h-3 mx-2 rounded-md transition-colors ${isOver ? 'bg-accent-500/15 ring-1 ring-accent-400/40' : ''}`}
      aria-hidden
    />
  )
}

const BULK_PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
  { value: 'none', label: 'なし' },
]

type CompletionMode = 'as-planned' | 'shifted'

interface CompleteWithLogDraft {
  taskId: string
  title: string
  date: string
  startTime: string
  endTime: string
  memo: string
  mode: CompletionMode
  tags: string[]
}

function CompleteWithLogModal({
  draft,
  onClose,
  onChange,
  onSubmit,
}: {
  draft: CompleteWithLogDraft
  onClose: () => void
  onChange: (patch: Partial<CompleteWithLogDraft>) => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" />
      <div
        className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">完了を記録</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          実績ログを作成してから、予定タスクを完了にします。
        </p>

        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="completion-mode"
              checked={draft.mode === 'as-planned'}
              onChange={() => onChange({ mode: 'as-planned' })}
            />
            <span className="text-zinc-700 dark:text-zinc-300">予定どおり完了</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="completion-mode"
              checked={draft.mode === 'shifted'}
              onChange={() => onChange({ mode: 'shifted' })}
            />
            <span className="text-zinc-700 dark:text-zinc-300">時間をずらして実行</span>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">開始</label>
            <TimeInput
              value={draft.startTime}
              onChange={(v) => onChange({ startTime: v, mode: 'shifted' })}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500/40 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">終了</label>
            <TimeInput
              value={draft.endTime}
              onChange={(v) => onChange({ endTime: v, mode: 'shifted' })}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500/40 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">メモ（任意）</label>
          <textarea
            value={draft.memo}
            onChange={(e) => onChange({ memo: e.target.value })}
            rows={4}
            placeholder="実行内容のメモを入力"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500/40 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600"
          >
            保存して完了
          </button>
        </div>
      </div>
    </div>
  )
}

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
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const bulkUpdateTasks = useTaskStore((s) => s.bulkUpdateTasks)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const sections = useTaskStore((s) => s.sections)
  const addSectionStore = useTaskStore((s) => s.addSection)
  const renameSectionStore = useTaskStore((s) => s.renameSection)
  const deleteSectionStore = useTaskStore((s) => s.deleteSection)
  const setQuickAddSectionId = useTaskStore((s) => s.setQuickAddSectionId)
  const quickAddSectionId = useTaskStore((s) => s.quickAddSectionId)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [showSort, setShowSort] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [completionDraft, setCompletionDraft] = useState<CompleteWithLogDraft | null>(null)
  const selectedRef = useRef(selected)
  const lastAnchorRef = useRef<string | null>(null)

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    lastAnchorRef.current = null
  }, [])

  useEffect(() => {
    queueMicrotask(() => clearSelection())
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
        if (id.startsWith(TASK_PREFIX) || id.startsWith(DRAGSEC_PREFIX)) clearSelection()
      },
    }),
    [clearSelection],
  )
  useDndMonitor(dndMonitor)

  const currentList = selectedListId ? lists.find((l) => l.id === selectedListId) : null
  const title = selectedView ? VIEW_LABELS[selectedView] ?? '' : (currentList?.name ?? 'タスク')

  const filtered = useMemo(
    () =>
      getFilteredRootTasks({
        tasks,
        selectedView,
        selectedListId,
        sortMode,
        filterTag,
        sections,
      }),
    [tasks, selectedView, selectedListId, sortMode, filterTag, sections],
  )

  const listSectionsOrdered = useMemo(() => {
    if (!selectedListId) return []
    return sections.filter((s) => s.listId === selectedListId).sort((a, b) => a.order - b.order)
  }, [sections, selectedListId])

  const showSectionBlocks =
    Boolean(selectedListId) && sortMode === 'manual' && listSectionsOrdered.length > 0

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
      if (!p.completed && !isListedTimeLog(p)) n++
      for (const st of childrenByParent.get(p.id) ?? []) {
        if (!st.completed && !isListedTimeLog(st)) n++
      }
    }
    return n
  }, [filtered, childrenByParent])

  const active = useMemo(() => {
    const incomplete = filtered.filter((t) => !t.completed && !isListedTimeLog(t))
    if (!showSectionBlocks) return incomplete
    return getOrderedActiveRootTasksForDnD({
      tasks,
      selectedView,
      selectedListId,
      sortMode,
      filterTag,
      sections,
    })
  }, [filtered, showSectionBlocks, tasks, selectedView, selectedListId, sortMode, filterTag, sections])

  const sectionBlocks = useMemo(() => {
    if (!showSectionBlocks || !selectedListId) return null
    const map = new Map<string | null, typeof active>()
    map.set(null, [])
    for (const s of listSectionsOrdered) map.set(s.id, [])
    for (const t of active) {
      const sid = t.sectionId ?? null
      const bucket = map.get(sid)
      if (bucket) bucket.push(t)
      else map.get(null)!.push(t)
    }
    const rows: { sectionId: string | null; title: string; tasks: typeof active }[] = [
      { sectionId: null, title: 'セクションなし', tasks: map.get(null) ?? [] },
    ]
    for (const s of listSectionsOrdered) {
      rows.push({ sectionId: s.id, title: s.name, tasks: map.get(s.id) ?? [] })
    }
    return rows
  }, [showSectionBlocks, selectedListId, listSectionsOrdered, active])
  const completedTodos = filtered.filter((t) => t.completed && !isListedTimeLog(t))
  const showQuickAdd =
    selectedView === null ||
    selectedView === 'all' ||
    selectedView === 'today' ||
    selectedView === 'upcoming' ||
    selectedView === 'overdue'
  const detailTask = detailId ? tasks.find((t) => t.id === detailId) : null
  const canDrag = sortMode === 'manual'

  const openCompleteWithLog = useCallback((task: Task) => {
    if (task.completed || isListedTimeLog(task) || !task.dueDate || !task.startTime || !task.endTime) {
      toggleTask(task.id)
      return
    }
    setCompletionDraft({
      taskId: task.id,
      title: task.title,
      date: task.dueDate,
      startTime: task.startTime,
      endTime: task.endTime,
      memo: task.description.trim(),
      mode: 'as-planned',
      tags: [...task.tags],
    })
  }, [toggleTask])

  const submitCompleteWithLog = useCallback(() => {
    if (!completionDraft) return
    const memo = completionDraft.memo.trim()
    const toMin = (v: string) => {
      const [h, m] = v.split(':').map(Number)
      return h * 60 + m
    }
    if (toMin(completionDraft.endTime) <= toMin(completionDraft.startTime)) {
      alert('終了時刻は開始時刻より後にしてください')
      return
    }
    addTimeLog(
      completionDraft.title,
      completionDraft.date,
      completionDraft.startTime,
      completionDraft.endTime,
      completionDraft.tags,
      memo || undefined,
    )
    toggleTask(completionDraft.taskId)
    setCompletionDraft(null)
  }, [completionDraft, addTimeLog, toggleTask])

  const flatActiveIds = useMemo(() => {
    const out: string[] = []
    for (const p of active) {
      out.push(p.id)
      for (const st of childrenByParent.get(p.id) ?? []) {
        if (!st.completed && !isListedTimeLog(st)) out.push(st.id)
      }
    }
    return out
  }, [active, childrenByParent])

  const flatCompletedTodoIds = useMemo(() => {
    const out: string[] = []
    for (const p of completedTodos) {
      out.push(p.id)
      for (const st of childrenByParent.get(p.id) ?? []) {
        out.push(st.id)
      }
    }
    return out
  }, [completedTodos, childrenByParent])

  const flatCombined = useMemo(
    () => [...flatActiveIds, ...flatCompletedTodoIds],
    [flatActiveIds, flatCompletedTodoIds],
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
      if (isModKey(e)) {
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

  /** 縦線を親の完了サークル列の下（中心付近）に合わす。DnD ハンドル有無で前段幅が変わる */
  const subtaskNestNoDrag =
    'border-l border-zinc-200 dark:border-zinc-700 ml-[45px] pl-3'
  const subtaskNestWithDrag =
    'border-l border-zinc-200 dark:border-zinc-700 ml-[73px] pl-3'

  const activeContent = canDrag ? (
    showSectionBlocks && sectionBlocks && selectedListId ? (
      <SortableContext items={active.map((t) => `${TASK_PREFIX}${t.id}`)} strategy={verticalListSortingStrategy}>
        {sectionBlocks.map((block) => {
          const isQuickTarget =
            (block.sectionId === null && quickAddSectionId === '') ||
            (block.sectionId !== null && quickAddSectionId === block.sectionId)
          return (
            <div key={block.sectionId ?? 'none'} className="pt-3 first:pt-1">
              {block.sectionId !== null && selectedListId ? (
                <SectionHeaderDnD
                  listId={selectedListId}
                  sectionId={block.sectionId}
                  isQuickTarget={isQuickTarget}
                  titleButton={
                    <button
                      type="button"
                      className="w-full text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 truncate"
                      onClick={() => setQuickAddSectionId(block.sectionId)}
                    >
                      {block.title}
                    </button>
                  }
                  actions={
                    <span className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        title="名前を変更"
                        onClick={() => {
                          const n = window.prompt('セクション名', block.title)
                          if (n?.trim() && block.sectionId) renameSectionStore(block.sectionId, n.trim())
                        }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded text-zinc-400 hover:text-red-500"
                        title="削除"
                        onClick={() => {
                          if (window.confirm('このセクションを削除しますか？（タスクは「セクションなし」に移ります）')) {
                            deleteSectionStore(block.sectionId!)
                          }
                        }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  }
                />
              ) : (
                <div
                  className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg mb-0.5 transition-colors
                    ${isQuickTarget ? 'bg-accent-50 dark:bg-accent-500/10 ring-1 ring-accent-400/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'}`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 truncate"
                    onClick={() => setQuickAddSectionId('')}
                  >
                    {block.title}
                  </button>
                </div>
              )}
              {block.tasks.map((t) => (
                <SortableTaskItem
                  key={t.id}
                  task={t}
                  onRowClick={makeRowClick(t.id)}
                  onCompleteRequest={openCompleteWithLog}
                  selection={makeSelection(t.id)}
                >
                  {(childrenByParent.get(t.id) ?? [])
                    .filter((st) => !st.completed && !isListedTimeLog(st))
                    .map((st) => (
                      <div key={st.id} className={subtaskNestWithDrag}>
                        <TaskItem
                          task={st}
                          isSubtask
                          onRowClick={makeRowClick(st.id)}
                          onCompleteRequest={openCompleteWithLog}
                          selection={makeSelection(st.id)}
                        />
                      </div>
                    ))}
                </SortableTaskItem>
              ))}
              <SectionDropZone listId={selectedListId} sectionId={block.sectionId} />
            </div>
          )
        })}
      </SortableContext>
    ) : (
      <SortableContext items={active.map((t) => `${TASK_PREFIX}${t.id}`)} strategy={verticalListSortingStrategy}>
        {active.map((t) => (
          <SortableTaskItem
            key={t.id}
            task={t}
            onRowClick={makeRowClick(t.id)}
            onCompleteRequest={openCompleteWithLog}
            selection={makeSelection(t.id)}
          >
            {(childrenByParent.get(t.id) ?? [])
              .filter((st) => !st.completed && !isListedTimeLog(st))
              .map((st) => (
                <div key={st.id} className={subtaskNestWithDrag}>
                  <TaskItem
                    task={st}
                    isSubtask
                    onRowClick={makeRowClick(st.id)}
                    onCompleteRequest={openCompleteWithLog}
                    selection={makeSelection(st.id)}
                  />
                </div>
              ))}
          </SortableTaskItem>
        ))}
      </SortableContext>
    )
  ) : showSectionBlocks && sectionBlocks && selectedListId ? (
    sectionBlocks.map((block) => (
      <div key={block.sectionId ?? 'none'} className="pt-3 first:pt-1">
        <button
          type="button"
          className="w-full text-left px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-0.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          onClick={() => setQuickAddSectionId(block.sectionId === null ? '' : block.sectionId)}
        >
          {block.title}
        </button>
        {block.tasks.map((t) => (
          <div key={t.id}>
            <TaskItem
              task={t}
              onRowClick={makeRowClick(t.id)}
              onCompleteRequest={openCompleteWithLog}
              selection={makeSelection(t.id)}
            />
            {(childrenByParent.get(t.id) ?? [])
              .filter((st) => !st.completed && !isListedTimeLog(st))
              .map((st) => (
                <div key={st.id} className={subtaskNestNoDrag}>
                  <TaskItem
                    task={st}
                    isSubtask
                    onRowClick={makeRowClick(st.id)}
                    onCompleteRequest={openCompleteWithLog}
                    selection={makeSelection(st.id)}
                  />
                </div>
              ))}
          </div>
        ))}
      </div>
    ))
  ) : (
    active.map((t) => (
      <div key={t.id}>
        <TaskItem
          task={t}
          onRowClick={makeRowClick(t.id)}
          onCompleteRequest={openCompleteWithLog}
          selection={makeSelection(t.id)}
        />
        {(childrenByParent.get(t.id) ?? [])
          .filter((st) => !st.completed && !isListedTimeLog(st))
          .map((st) => (
            <div key={st.id} className={subtaskNestNoDrag}>
              <TaskItem
                task={st}
                isSubtask
                onRowClick={makeRowClick(st.id)}
                onCompleteRequest={openCompleteWithLog}
                selection={makeSelection(st.id)}
              />
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

          <div className="flex items-center gap-2">
            {selectedListId && sortMode === 'manual' && (
              <button
                type="button"
                onClick={() => addSectionStore(selectedListId)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-600
                           text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                ＋ セクション
              </button>
            )}
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

          {completedTodos.length > 0 && (
            <details className="pt-4">
              <summary className="text-xs font-medium text-zinc-400 dark:text-zinc-500 cursor-pointer select-none px-4 py-2">
                完了済み ({completedTodos.length})
              </summary>
              <div className="space-y-0.5 mt-1">
                {completedTodos.map((t) => (
                  <div key={t.id}>
                    <TaskItem
                      task={t}
                      onRowClick={makeRowClick(t.id)}
                      onCompleteRequest={openCompleteWithLog}
                      selection={makeSelection(t.id)}
                    />
                    {(childrenByParent.get(t.id) ?? []).map((st) => (
                      <div key={st.id} className={subtaskNestNoDrag}>
                        <TaskItem
                          task={st}
                          isSubtask
                          onRowClick={makeRowClick(st.id)}
                          onCompleteRequest={openCompleteWithLog}
                          selection={makeSelection(st.id)}
                        />
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
      {completionDraft && (
        <CompleteWithLogModal
          draft={completionDraft}
          onClose={() => setCompletionDraft(null)}
          onChange={(patch) => setCompletionDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
          onSubmit={submitCompleteWithLog}
        />
      )}
    </>
  )
}
