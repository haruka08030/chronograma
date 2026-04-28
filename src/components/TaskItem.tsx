import { useState, useRef, useEffect, useCallback, useMemo, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import { TASK_DND_TYPE } from '../lib/useTimelineDrop'
import { isListedTimeLog } from '../lib/timeLogTask'
import { isModKey } from '../lib/keyboard'
import { displayListName } from '../lib/displayListName'

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-500',
  medium: 'text-amber-500',
  low: 'text-blue-500',
}

export type TaskItemSelection = {
  selected: boolean
  onToggle: (e: React.MouseEvent) => void
  /** 一覧で何か選択中、または当該行が選択中のときチェック列を常時表示 */
  reveal: boolean
}

export function TaskItem({ task, onClick, onRowClick, onCompleteRequest, onEnterCreateSibling, dragHandle, isSubtask, selection, rowClassName, autoEdit }: {
  task: Task
  onClick?: () => void
  /** 修飾キー・一括選択時の行クリック（指定時はこちらを優先） */
  onRowClick?: (e: React.MouseEvent) => void
  /** 未完了タスクを完了する直前のフック。指定時は通常トグルより優先。 */
  onCompleteRequest?: (task: Task) => void
  /** タイトル編集中 Enter で、同階層の次タスクを作成する */
  onEnterCreateSibling?: (task: Task) => void
  dragHandle?: React.ReactNode
  /** TickTick 風一覧のインデント行 */
  isSubtask?: boolean
  selection?: TaskItemSelection
  /** 行ラッパーに付与（例: 右端ネスト帯と並べたときの `rounded-r-none min-w-0`） */
  rowClassName?: string
  /** true のとき初回レンダーでタイトル編集へ入る */
  autoEdit?: boolean
}) {
  const { t } = useTranslation()
  const hasSortableHandle = !!dragHandle
  const { toggleTask, updateTask, deleteTask, setFilterTag, lists, moveTaskToList, showMoveBanner } = useTaskStore()
  const [editing, setEditing] = useState(Boolean(autoEdit))
  const [rowMenuOpen, setRowMenuOpen] = useState(false)
  const rowMenuRef = useRef<HTMLDivElement>(null)
  const [editValue, setEditValue] = useState(task.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      const el = inputRef.current
      el?.focus()
      if (el) {
        const len = el.value.length
        queueMicrotask(() => el.setSelectionRange(len, len))
      }
    }
  }, [editing])

  useEffect(() => {
    if (!rowMenuOpen) return
    const close = (e: Event) => {
      const t = e.target
      if (rowMenuRef.current && t instanceof Node && !rowMenuRef.current.contains(t)) setRowMenuOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [rowMenuOpen])

  const sortedLists = useMemo(() => [...lists].sort((a, b) => a.order - b.order), [lists])

  const commitEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== task.title) {
      updateTask(task.id, { title: trimmed })
    }
    setEditing(false)
    setEditValue(trimmed || task.title)
  }

  const timeLog = isListedTimeLog(task)
  const showRowExtras = !task.completed && !timeLog
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
  const canShowPin = !task.parentId && showRowExtras

  const beginTitleInteraction = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.shiftKey || isModKey(e)) {
      onRowClick?.(e as unknown as MouseEvent)
      return
    }
    if (selection?.reveal && onRowClick) {
      onRowClick(e as unknown as MouseEvent)
      return
    }
    setEditValue(task.title)
    setEditing(true)
  }, [onRowClick, selection?.reveal, task.title])

  return (
    <div
      draggable={rowNativeDraggable}
      onDragStart={rowNativeDraggable ? handleDragStart : undefined}
      onDragEnd={rowNativeDraggable ? handleDragEnd : undefined}
      className={`group flex items-center gap-2 rounded-xl transition-colors cursor-pointer
                  hover:bg-zinc-50 dark:hover:bg-zinc-800/40
                  ${isSubtask ? 'px-2.5 py-1.5' : 'px-2.5 py-2'}
                  ${task.completed && !timeLog ? 'opacity-50' : ''}
                  ${isDragging ? 'opacity-30' : ''}
                  ${rowClassName ?? ''}`}
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
          aria-label={t('taskItem.bulkSelectAria')}
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
        onClick={(e) => {
          e.stopPropagation()
          if (!task.completed && !timeLog && onCompleteRequest) {
            onCompleteRequest(task)
            return
          }
          toggleTask(task.id)
        }}
        className={`rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all
          ${isSubtask ? 'w-4 h-4' : 'w-[18px] h-[18px]'}
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
          !task.completed && !timeLog && onCompleteRequest
            ? t('taskItem.completeWithLog')
            : task.completed
            ? timeLog
              ? t('taskItem.unlogIncomplete')
              : t('taskItem.markIncomplete')
            : t('taskItem.markComplete')
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
              if (e.key === 'Enter') {
                if (e.nativeEvent.isComposing) return
                e.preventDefault()
                commitEdit()
                onEnterCreateSibling?.(task)
              }
              if (e.key === 'Escape') { setEditValue(task.title); setEditing(false) }
            }}
            className={`w-full bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                       border-b border-accent-400 pb-0.5 ${isSubtask ? 'text-[13px]' : 'text-sm'}`}
          />
        ) : (
          <span
            data-task-title
            role="button"
            tabIndex={0}
            onClick={beginTitleInteraction}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              beginTitleInteraction(e)
            }}
            className={`block truncate cursor-text outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-accent-400/50
                        ${isSubtask ? 'text-[13px]' : 'text-sm'}
                        ${task.completed && !timeLog ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}
          >
            {task.title || '\u00A0'}
          </span>
        )}

        <div className="flex items-center gap-2 mt-0.5 empty:hidden flex-wrap">
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
        className="opacity-0 group-hover:opacity-100 transition-all cursor-pointer flex-shrink-0"
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

      <div className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" ref={rowMenuRef}>
        <button
          type="button"
          className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400"
          aria-expanded={rowMenuOpen}
          aria-haspopup="true"
          aria-label={t('taskItem.moreMenuAria')}
          onClick={(e) => {
            e.stopPropagation()
            setRowMenuOpen((o) => !o)
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.75h16.5M3.75 14.25h16.5M12 6v12" />
          </svg>
        </button>
        {rowMenuOpen && (
          <div
            className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-zinc-200 bg-white py-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            {!task.parentId && (
              <div className="px-2 pb-2">
                <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 block mb-1">{t('taskDetail.list')}</label>
                <select
                  className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-1.5 py-1"
                  value={task.listId}
                  onChange={(e) => {
                    const next = e.target.value
                    const r = moveTaskToList(task.id, next)
                    setRowMenuOpen(false)
                    if (r.moved && r.listName) {
                      showMoveBanner(
                        t('toast.taskMovedToList', {
                          name: displayListName(r.listId ?? next, r.listName),
                        }),
                      )
                    }
                  }}
                >
                  {sortedLists.map((l) => (
                    <option key={l.id} value={l.id}>{displayListName(l.id, l.name)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {canShowPin && (
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all flex-shrink-0 text-zinc-400"
          aria-pressed={task.pinned === true}
          aria-label={task.pinned ? t('taskItem.unpinAria') : t('taskItem.pinAria')}
          onClick={(e) => {
            e.stopPropagation()
            updateTask(task.id, { pinned: !task.pinned })
          }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill={task.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5l-4.5-3-4.5 3V3.75A1.5 1.5 0 017.5 3h9A1.5 1.5 0 0116.5 3.75z" />
          </svg>
        </button>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); deleteTask(task.id) }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
        aria-label={t('taskItem.deleteAria')}
      >
        <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    </div>
  )
}
