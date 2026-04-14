import { useState, useRef, useEffect } from 'react'
import { useTaskStore } from '../store/taskStore'
import type { Task, Priority, Recurrence } from '../types/task'
import { TaskItem } from './TaskItem'

const RECURRENCE_TYPES: { value: Recurrence['type'] | 'none'; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'daily', label: '毎日' },
  { value: 'weekly', label: '毎週' },
  { value: 'monthly', label: '毎月' },
  { value: 'yearly', label: '毎年' },
]

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: 'none', label: 'なし', color: 'text-zinc-400' },
  { value: 'low', label: '低', color: 'text-blue-500' },
  { value: 'medium', label: '中', color: 'text-amber-500' },
  { value: 'high', label: '高', color: 'text-red-500' },
]

export function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const { updateTask, addTask, tasks, lists } = useTaskStore()
  const [tagInput, setTagInput] = useState('')
  const [subInput, setSubInput] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task.title)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTitleValue(task.title) }, [task.title])
  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [editingTitle])

  const commitTitle = () => {
    const trimmed = titleValue.trim()
    if (trimmed && trimmed !== task.title) {
      updateTask(task.id, { title: trimmed })
    }
    setEditingTitle(false)
    setTitleValue(trimmed || task.title)
  }

  const subtasks = tasks
    .filter((t) => t.parentId === task.id)
    .sort((a, b) => a.order - b.order)

  const addSubtask = () => {
    const trimmed = subInput.trim()
    if (!trimmed) return
    addTask(trimmed, task.listId)
    const newTask = useTaskStore.getState().tasks.at(-1)
    if (newTask) updateTask(newTask.id, { parentId: task.id })
    setSubInput('')
  }

  const addTag = () => {
    const trimmed = tagInput.trim()
    if (!trimmed || task.tags.includes(trimmed)) return
    updateTask(task.id, { tags: [...task.tags, trimmed] })
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    updateTask(task.id, { tags: task.tags.filter((t) => t !== tag) })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40" />
      <div
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800
                   h-full overflow-y-auto shadow-xl animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-6">
          {/* header */}
          <div className="flex items-start justify-between gap-4">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTitle()
                  if (e.key === 'Escape') { setTitleValue(task.title); setEditingTitle(false) }
                }}
                className="flex-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100 bg-transparent outline-none
                           border-b-2 border-accent-400 pb-0.5 break-words"
              />
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 break-words cursor-text
                           hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded-md px-1 -mx-1 transition-colors"
              >
                {task.title}
              </h2>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* description */}
          <div>
            <textarea
              value={task.description}
              onChange={(e) => updateTask(task.id, { description: e.target.value })}
              placeholder="メモを追加..."
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                         bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                         focus:ring-2 focus:ring-accent-500/40 placeholder:text-zinc-400
                         resize-none min-h-[4rem]"
            />
          </div>

          {/* priority */}
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">優先度</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateTask(task.id, { priority: opt.value })}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-all
                    ${task.priority === opt.value
                      ? 'border-accent-400 bg-accent-50 dark:bg-accent-500/10 font-medium'
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'}
                    ${opt.color}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* due date */}
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">期限日</label>
            <input
              type="date"
              value={task.dueDate ?? ''}
              onChange={(e) => updateTask(task.id, { dueDate: e.target.value || null })}
              className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                         bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                         focus:ring-2 focus:ring-accent-500/40"
            />
          </div>

          {/* time */}
          {task.dueDate && (
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">時間</label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={task.startTime ?? ''}
                  onChange={(e) => updateTask(task.id, { startTime: e.target.value || null })}
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                             bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                             focus:ring-2 focus:ring-accent-500/40"
                />
                <span className="text-zinc-400 text-sm">〜</span>
                <input
                  type="time"
                  value={task.endTime ?? ''}
                  onChange={(e) => updateTask(task.id, { endTime: e.target.value || null })}
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                             bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                             focus:ring-2 focus:ring-accent-500/40"
                />
              </div>
            </div>
          )}

          {/* recurrence */}
          {task.dueDate && (
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">繰り返し</label>
              <div className="flex items-center gap-2">
                <select
                  value={task.recurrence?.type ?? 'none'}
                  onChange={(e) => {
                    const val = e.target.value as Recurrence['type'] | 'none'
                    if (val === 'none') {
                      updateTask(task.id, { recurrence: null })
                    } else {
                      updateTask(task.id, {
                        recurrence: { type: val, interval: task.recurrence?.interval ?? 1 },
                      })
                    }
                  }}
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                             bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                             focus:ring-2 focus:ring-accent-500/40"
                >
                  {RECURRENCE_TYPES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                {task.recurrence && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      value={task.recurrence.interval}
                      onChange={(e) => {
                        const interval = Math.max(1, parseInt(e.target.value) || 1)
                        updateTask(task.id, {
                          recurrence: { ...task.recurrence!, type: task.recurrence!.type, interval },
                        })
                      }}
                      className="w-16 px-2 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                                 bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                                 focus:ring-2 focus:ring-accent-500/40 text-center"
                    />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {{ daily: '日ごと', weekly: '週ごと', monthly: 'ヶ月ごと', yearly: '年ごと' }[task.recurrence.type]}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* tags */}
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">タグ</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {task.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md
                             bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300"
                >
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-red-500 transition-colors">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTag() }}
                placeholder="タグを追加"
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                           bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                           focus:ring-2 focus:ring-accent-500/40 placeholder:text-zinc-400"
              />
              <button
                onClick={addTag}
                disabled={!tagInput.trim()}
                className="px-3 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800
                           hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                追加
              </button>
            </div>
          </div>

          {/* list */}
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">リスト</label>
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: lists.find((l) => l.id === task.listId)?.color ?? '#6366f1' }}
              />
              <select
                value={task.listId}
                onChange={(e) => updateTask(task.id, { listId: e.target.value })}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                           bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                           focus:ring-2 focus:ring-accent-500/40"
              >
                {lists
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
              </select>
            </div>
          </div>

          {/* subtasks */}
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">
              サブタスク ({subtasks.length})
            </label>
            <div className="space-y-1">
              {subtasks.map((st) => (
                <TaskItem key={st.id} task={st} />
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addSubtask() }}
                placeholder="サブタスクを追加"
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                           bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                           focus:ring-2 focus:ring-accent-500/40 placeholder:text-zinc-400"
              />
              <button
                onClick={addSubtask}
                disabled={!subInput.trim()}
                className="px-3 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800
                           hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                追加
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}