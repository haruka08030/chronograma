import { useState, useRef, useEffect, useCallback } from 'react'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import { isToday, isPast, format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { TASK_DND_TYPE } from '../lib/useTimelineDrop'
import { isListedTimeLog } from '../lib/timeLogTask'

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-500',
  medium: 'text-amber-500',
  low: 'text-blue-500',
}

function dueDateLabel(iso: string): { text: string; overdue: boolean } {
  const d = parseISO(iso)
  if (isToday(d)) return { text: '今日', overdue: false }
  const overdue = isPast(d) && !isToday(d)
  return { text: format(d, 'M/d (E)', { locale: ja }), overdue }
}

export type TaskItemSelection = {
  selected: boolean
  onToggle: (e: React.MouseEvent) => void
  /** 一覧で何か選択中、または当該行が選択中のときチェック列を常時表示 */
  reveal: boolean
}

export function TaskItem({ task, onClick, onRowClick, dragHandle, isSubtask, selection }: {
  task: Task
  onClick?: () => void
  /** 修飾キー・一括選択時の行クリック（指定時はこちらを優先） */
  onRowClick?: (e: React.MouseEvent) => void
  dragHandle?: React.ReactNode
  /** TickTick 風一覧のインデント行 */
  isSubtask?: boolean
  selection?: TaskItemSelection
}) {
  const hasSortableHandle = !!dragHandle
  const { toggleTask, updateTask, deleteTask, setFilterTag } = useTaskStore()
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(task.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commitEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== task.title) {
      updateTask(task.id, { title: trimmed })
    }
    setEditing(false)
    setEditValue(trimmed || task.title)
  }

  const due = task.dueDate ? dueDateLabel(task.dueDate) : null
  const timeLog = isListedTimeLog(task)
  const priorityColor = PRIORITY_COLORS[task.priority]
  const [isDragging, setIsDragging] = useState(false)

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData(TASK_DND_TYPE, task.id)
    e.dataTransfer.setData('text/plain', task.id)
    e.dataTransfer.effectAllowed = 'copy'
    setIsDragging(true)
  }, [task.id])

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  const rowNativeDraggable = !hasSortableHandle

  return (
    <div
      draggable={rowNativeDraggable}
      onDragStart={rowNativeDraggable ? handleDragStart : undefined}
      onDragEnd={rowNativeDraggable ? handleDragEnd : undefined}
      className={`group flex items-center gap-2 rounded-xl transition-colors cursor-pointer
                  hover:bg-zinc-50 dark:hover:bg-zinc-800/40
                  ${isSubtask ? 'px-2 py-2' : 'px-3 py-2.5'}
                  ${task.completed && !timeLog ? 'opacity-50' : ''}
                  ${isDragging ? 'opacity-30' : ''}`}
      onClick={(e) => {
        if (editing) return
        if (onRowClick) onRowClick(e)
        else onClick?.()
      }}
    >
      {hasSortableHandle ? (
        <span className="touch-none flex-shrink-0">{dragHandle}</span>
      ) : null}

      {selection ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selection.selected}
          aria-label="一括選択に含める"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            selection.onToggle(e)
          }}
          className={`flex-shrink-0 rounded border flex items-center justify-center transition-all touch-none
            ${isSubtask ? 'w-3.5 h-3.5' : 'w-4 h-4'}
            ${selection.reveal || selection.selected
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100'}
            ${selection.selected
              ? 'border-accent-500 bg-accent-500 text-white'
              : 'border-zinc-300 dark:border-zinc-600 bg-transparent hover:border-zinc-400 dark:hover:border-zinc-500'}`}
        >
          {selection.selected && (
            <svg className={isSubtask ? 'w-2 h-2' : 'w-2.5 h-2.5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </button>
      ) : null}

      <button
        onClick={(e) => { e.stopPropagation(); toggleTask(task.id) }}
        className={`rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all
          ${isSubtask ? 'w-4 h-4' : 'w-5 h-5'}
          ${
            task.completed
              ? timeLog
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'bg-accent-500 border-accent-500 text-white'
              : priorityColor
                ? `border-current ${priorityColor}`
                : 'border-zinc-300 dark:border-zinc-600 hover:border-accent-400'
          }`}
        aria-label={
          task.completed
            ? timeLog
              ? 'タイムログを取り消して未完了に戻す'
              : 'タスクを未完了に戻す'
            : 'タスクを完了にする'
        }
      >
        {task.completed && (
          <svg className={isSubtask ? 'w-2.5 h-2.5' : 'w-3 h-3'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') { setEditValue(task.title); setEditing(false) }
            }}
            className={`w-full bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                       border-b border-accent-400 pb-0.5 ${isSubtask ? 'text-[13px]' : 'text-sm'}`}
          />
        ) : (
          <span
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
            className={`block truncate select-none
                        ${isSubtask ? 'text-[13px]' : 'text-sm'}
                        ${task.completed && !timeLog ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}
          >
            {task.title}
          </span>
        )}

        <div className="flex items-center gap-2 mt-0.5 empty:hidden flex-wrap">
          {due && (!task.completed || timeLog) && (
            <span className={`text-[11px] ${due.overdue ? 'text-red-500' : 'text-zinc-400 dark:text-zinc-500'}`}>
              {due.text}
            </span>
          )}
          {task.recurrence && (
            <svg className="w-3 h-3 text-zinc-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          )}
          {task.tags.length > 0 && (
            <div className="flex gap-1">
              {task.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={(e) => { e.stopPropagation(); setFilterTag(tag) }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-accent-50 dark:bg-accent-500/10
                             text-accent-600 dark:text-accent-400 hover:bg-accent-100 dark:hover:bg-accent-500/20 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <label
        className="opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="date"
          value={task.dueDate ?? ''}
          onChange={(e) => updateTask(task.id, { dueDate: e.target.value || null })}
          className="sr-only"
        />
        <svg className={`w-4 h-4 ${task.dueDate ? 'text-accent-500' : 'text-zinc-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      </label>

      <button
        onClick={(e) => { e.stopPropagation(); deleteTask(task.id) }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
        aria-label="削除"
      >
        <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    </div>
  )
}
