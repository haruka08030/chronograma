import { useState } from 'react'
import { useTaskStore } from '../store/taskStore'
import type { Task, Priority } from '../types/task'
import { TaskItem } from './TaskItem'

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: 'none', label: 'なし', color: 'text-zinc-400' },
  { value: 'low', label: '低', color: 'text-blue-500' },
  { value: 'medium', label: '中', color: 'text-amber-500' },
  { value: 'high', label: '高', color: 'text-red-500' },
]

export function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const { updateTask, addTask, tasks } = useTaskStore()
  const [tagInput, setTagInput] = useState('')
  const [subInput, setSubInput] = useState('')

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
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 break-words">
              {task.title}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
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