import { useState, useRef, useEffect, useCallback, useMemo, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import type { Locale } from 'date-fns'
import { isToday, isPast, format, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { TASK_DND_TYPE, TASK_MULTI_DND_TYPE } from '../lib/useTimelineDrop'
import { isListedTimeLog } from '../lib/timeLogTask'
import { isModKey } from '../lib/keyboard'
import { displayListName } from '../lib/displayListName'
import { DueDatePopover } from './DueDatePopover'

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-500',
  medium: 'text-amber-500',
  low: 'text-blue-500',
}

function dueDateLabel(iso: string, todayLabel: string, locale: Locale): { text: string; overdue: boolean } {
  const d = parseISO(iso)
  if (isToday(d)) return { text: todayLabel, overdue: false }
  const overdue = isPast(d) && !isToday(d)
  const fmt = d.getFullYear() !== new Date().getFullYear() ? 'yyyy/M/d (E)' : 'M/d (E)'
  return { text: format(d, fmt, { locale }), overdue }
}

export type TaskItemSelection = {
  selected: boolean
  onToggle: (e: React.MouseEvent) => void
  /** 一覧で何か選択中、または当該行が選択中のときチェック列を常時表示 */
  reveal: boolean
}

export function TaskItem({ task, onClick, onRowClick, onCompleteRequest, onEnterCreateSibling, dragHandle, isSubtask, selection, rowClassName, autoEdit, hideDueDatePicker = false, dragGroupIds, onNativeDragEnd }: {
  task: Task
  onClick?: () => void
  /** 修飾キー・一括選択時の行クリック（指定時はこちらを優先） */
  onRowClick?: (e: React.MouseEvent) => void
  /** 未完了タスクを完了する直前のフック。指定時は通常トグルより優先。 */
  onCompleteRequest?: (task: Task) => void
  /** タイトル編集中 Enter で、同階層の次タスクを作成する */
  onEnterCreateSibling?: (task: Task) => void
  dragHandle?: React.ReactNode
  /** ネイティブドラッグでまとめて動かす選択 ID（表示順・単体なら未指定/[task.id]） */
  dragGroupIds?: string[]
  /** ネイティブドラッグ終了時（成否問わず）。複数選択のクリアなどに使う */
  onNativeDragEnd?: () => void
  /** TickTick 風一覧のインデント行 */
  isSubtask?: boolean
  selection?: TaskItemSelection
  /** 行ラッパーに付与（例: 右端ネスト帯と並べたときの `rounded-r-none min-w-0`） */
  rowClassName?: string
  /** true のとき初回レンダーでタイトル編集へ入る */
  autoEdit?: boolean
  /** true のときホバー用のネイティブ期限ピッカー（カレンダー形アイコン）を出さない */
  hideDueDatePicker?: boolean
}) {
  const { t, i18n } = useTranslation()
  const hasSortableHandle = !!dragHandle
  const { toggleTask, updateTask, deleteTask, archiveTask, setFilterTag, lists, moveTaskToList, showMoveBanner } = useTaskStore()
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
  const notePreview = task.description.split('\n').find((line) => line.trim())?.trim() ?? ''
  const priorityColor = PRIORITY_COLORS[task.priority]
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const due = task.dueDate ? dueDateLabel(task.dueDate, t('common.today'), dateLocale) : null
  const dueText = due ? (task.dueTime ? `${due.text} ${task.dueTime}` : due.text) : null
  const scheduledText = useMemo(() => {
    if (timeLog || !task.scheduledDate) return null
    const d = parseISO(`${task.scheduledDate}T12:00:00`)
    const fmt = d.getFullYear() !== new Date().getFullYear() ? 'yyyy/M/d (E)' : 'M/d (E)'
    const datePart = isToday(d) ? t('common.today') : format(d, fmt, { locale: dateLocale })
    const timePart = task.startTime ? ` ${task.startTime}${task.endTime ? `–${task.endTime}` : ''}` : ''
    return `${datePart}${timePart}`
  }, [timeLog, task.scheduledDate, task.startTime, task.endTime, dateLocale, t])
  const [isDragging, setIsDragging] = useState(false)

  const handleDragStart = useCallback((e: React.DragEvent) => {
    const group =
      dragGroupIds && dragGroupIds.length > 1 && dragGroupIds.includes(task.id)
        ? dragGroupIds
        : [task.id]
    e.dataTransfer.setData(TASK_DND_TYPE, task.id)
    e.dataTransfer.setData('text/plain', task.id)
    if (group.length > 1) {
      e.dataTransfer.setData(TASK_MULTI_DND_TYPE, JSON.stringify(group))
      // dnd-kit のオーバーレイと見た目を揃えたドラッグ画像（カード＋件数バッジ）。
      // 画面外要素は一部ブラウザ（Safari 等）で無視されるため、ビューポート内に置いて
      // スナップショット後に除去する。
      const dark = document.documentElement.classList.contains('dark')
      const ghost = document.createElement('div')
      ghost.style.cssText =
        'position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;' +
        'display:flex;align-items:center;gap:8px;max-width:280px;padding:8px 12px;' +
        'border-radius:12px;font-size:13px;font-weight:500;white-space:nowrap;' +
        'box-shadow:0 10px 24px rgba(0,0,0,0.22);' +
        (dark
          ? 'background:#18181b;color:#fafafa;border:1px solid rgba(255,255,255,0.12);'
          : 'background:#ffffff;color:#18181b;border:1px solid rgba(0,0,0,0.08);')
      const label = document.createElement('span')
      label.textContent = task.title || ''
      label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;'
      const badge = document.createElement('span')
      badge.textContent = String(group.length)
      badge.style.cssText =
        'flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;' +
        'padding:0 6px;border-radius:9999px;font-size:12px;font-weight:600;' +
        (dark ? 'background:#fafafa;color:#18181b;' : 'background:#18181b;color:#fafafa;')
      ghost.appendChild(label)
      ghost.appendChild(badge)
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, 16, 16)
      requestAnimationFrame(() => ghost.remove())
    }
    e.dataTransfer.effectAllowed = 'copy'
    setIsDragging(true)
  }, [task.id, dragGroupIds])

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    onNativeDragEnd?.()
  }, [onNativeDragEnd])

  const rowNativeDraggable = !hasSortableHandle

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
          className={`flex-shrink-0 rounded border flex items-center justify-center transition-all touch-manipulation
            ${isSubtask ? 'h-5 w-5 md:h-3.5 md:w-3.5' : 'h-6 w-6 md:h-4 md:w-4'}
            ${selection.reveal || selection.selected
              ? 'opacity-100'
              : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}
            ${selection.selected
              ? 'border-accent-500 bg-accent-500 text-white'
              : 'border-zinc-300 dark:border-zinc-600 bg-transparent hover:border-zinc-400 dark:hover:border-zinc-500'}`}
        >
          {selection.selected && (
            <svg className={isSubtask ? 'w-2.5 h-2.5 md:w-2 md:h-2' : 'w-3 h-3 md:w-2.5 md:h-2.5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
        className={`rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all touch-manipulation
          ${isSubtask ? 'h-5 w-5 md:h-4 md:w-4' : 'h-6 w-6 md:h-[18px] md:w-[18px]'}
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
          <svg className={isSubtask ? 'w-3 h-3 md:w-2.5 md:h-2.5' : 'w-3.5 h-3.5 md:w-3 md:h-3'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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

        {notePreview && (
          <span
            className={`block truncate mt-0.5 ${isSubtask ? 'text-[11px]' : 'text-xs'}
                        ${task.completed && !timeLog ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-400 dark:text-zinc-500'}`}
          >
            {notePreview}
          </span>
        )}

        <div className="flex items-center gap-2 mt-0.5 empty:hidden flex-wrap">
          {due && dueText && (!task.completed || timeLog) && (
            <span className={`text-[11px] ${due.overdue ? 'text-red-500' : 'text-zinc-400 dark:text-zinc-500'}`}>
              {dueText}
            </span>
          )}
          {scheduledText && (!task.completed || timeLog) && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-accent-500 dark:text-accent-400">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {scheduledText}
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

      {!hideDueDatePicker && (
        <DueDatePopover
          value={task.dueDate ?? null}
          onChange={(v) => updateTask(task.id, { dueDate: v })}
          align="right"
          // md 未満はタイトル幅を確保するため出さない（期限は詳細シートで編集）
          wrapperClassName="relative hidden flex-shrink-0 md:block"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              aria-label={t('taskItem.dueDateAria')}
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={(e) => {
                e.stopPropagation()
                toggle()
              }}
              className={`transition-all cursor-pointer rounded-md p-1.5 md:p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 touch-manipulation
                ${open || task.dueDate ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}
            >
              <svg className={`w-5 h-5 md:w-4 md:h-4 ${task.dueDate ? 'text-accent-500' : 'text-zinc-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </button>
          )}
        />
      )}

      {/* md 未満はアーカイブ・削除もこのメニューに畳む（サブタスク行では md 以上は出さない） */}
      <div
        className={`relative flex-shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100
          ${task.parentId ? 'md:hidden' : ''}`}
        ref={rowMenuRef}
      >
        <button
          type="button"
          className="rounded-md p-1.5 text-zinc-400 touch-manipulation hover:bg-zinc-200 dark:hover:bg-zinc-700 md:p-1"
          aria-expanded={rowMenuOpen}
          aria-haspopup="true"
          aria-label={t('taskItem.moreMenuAria')}
          onClick={(e) => {
            e.stopPropagation()
            setRowMenuOpen((o) => !o)
          }}
        >
          <svg className="h-5 w-5 md:h-4 md:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0Z" />
          </svg>
        </button>
        {rowMenuOpen && (
          <div
            className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-zinc-200 bg-white py-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            {!task.parentId && (
              <div className="px-2">
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
            <div className={`md:hidden ${!task.parentId ? 'mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700' : ''}`}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setRowMenuOpen(false)
                  archiveTask(task.id)
                  showMoveBanner(t('toast.taskArchived'))
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-200"
              >
                <svg className="h-4 w-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
                {t('taskItem.archive')}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setRowMenuOpen(false)
                  deleteTask(task.id)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-200"
              >
                <svg className="h-4 w-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                {t('common.delete')}
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          archiveTask(task.id)
          showMoveBanner(t('toast.taskArchived'))
        }}
        className="hidden rounded-md p-1 opacity-0 transition-all hover:bg-zinc-200 group-hover:opacity-100 md:block dark:hover:bg-zinc-700"
        aria-label={t('taskItem.archiveAria')}
        title={t('taskItem.archive')}
      >
        <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); deleteTask(task.id) }}
        className="hidden rounded-md p-1 opacity-0 transition-all hover:bg-zinc-200 group-hover:opacity-100 md:block dark:hover:bg-zinc-700"
        aria-label={t('taskItem.deleteAria')}
        title={t('taskItem.deleteAria')}
      >
        <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    </div>
  )
}
