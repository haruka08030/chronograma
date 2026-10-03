import { useState, useRef, useEffect, useCallback, useMemo, type MouseEvent } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { POPOVER_PANEL } from './ui/surface'
import { useTranslation } from 'react-i18next'
import { isTodoSurfaceView } from '../lib/todoSurfaceView'
import { labelForHex } from '../lib/logCategoryColors'
import { colorLabelText } from '../lib/todoColorLabels'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import type { Locale } from 'date-fns'
import { format, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { TASK_DND_TYPE, TASK_MULTI_DND_TYPE } from '../lib/useTimelineDrop'
import { startNativeTaskDragGhost } from '../lib/nativeTaskDragGhost'
import { isListedTimeLog } from '../lib/timeLogTask'
import { isModKey, isSubmitEnter } from '../lib/keyboard'
import { displayListName } from '../lib/displayListName'
import { PRIORITY_RING_CLASS } from '../lib/priorityColor'
import { DueDatePopover } from './DueDatePopover'
import { isAppPast, isAppToday, isAppTomorrow, zonedNow } from '../lib/timeZone'
import { CalendarIcon, CheckIcon, ClockIcon, RepeatIcon, TrashIcon } from './icons'

const LONG_PRESS_MS = 450
const LONG_PRESS_SLOP_PX = 8

/** 日付ラベルの緊急度。色は「期限切れ > 今日 > 明日 > それ以外」の順に強くする */
type DateTone = 'overdue' | 'today' | 'tomorrow' | 'future' | 'past'

const DUE_TONE_CLASS: Record<DateTone, string> = {
  overdue: 'text-red-500 dark:text-red-400 font-medium',
  today: 'text-amber-600 dark:text-amber-400 font-medium',
  tomorrow: 'text-amber-500/90 dark:text-amber-300/80',
  future: 'text-zinc-500 dark:text-zinc-400',
  past: 'text-zinc-400 dark:text-zinc-500',
}

const SCHEDULED_TONE_CLASS: Record<DateTone, string> = {
  overdue: 'text-zinc-400 dark:text-zinc-500',
  today: 'text-date-600 dark:text-date-400 font-medium',
  tomorrow: 'text-date-500/90 dark:text-date-300/80',
  future: 'text-zinc-500 dark:text-zinc-400',
  past: 'text-zinc-400 dark:text-zinc-500',
}

function dateTone(d: Date): DateTone {
  if (isAppToday(d)) return 'today'
  if (isAppTomorrow(d)) return 'tomorrow'
  return isAppPast(d) ? 'overdue' : 'future'
}

function dueDateLabel(iso: string, todayLabel: string, locale: Locale): { text: string; tone: DateTone } {
  const d = parseISO(iso)
  if (isAppToday(d)) return { text: todayLabel, tone: 'today' }
  const fmt = d.getFullYear() !== zonedNow().getFullYear() ? 'yyyy/M/d (E)' : 'M/d (E)'
  return { text: format(d, fmt, { locale }), tone: dateTone(d) }
}

export type TaskItemSelection = {
  selected: boolean
  onToggle: (e: React.MouseEvent) => void
  /** 一覧で何か選択中、または当該行が選択中のときチェック列を常時表示 */
  reveal: boolean
}

export function TaskItem({ task, onClick, onRowClick, onCompleteRequest, onEnterCreateSibling, dragHandle, isSubtask, selection, rowClassName, autoEdit, hideDueDatePicker = false, dragGroupIds, onNativeDragEnd, sectionLabel }: {
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
  /** セクションの塊で分けずに並べるとき、行に出すセクション名（Canvas なら科目） */
  sectionLabel?: string | null
}) {
  const { t, i18n } = useTranslation()
  const hasSortableHandle = !!dragHandle
  const discardBlankTask = useTaskStore((s) => s.discardBlankTask)
  const tagsEnabled = useTaskStore((s) => s.tagsEnabled)
  const selectColor = useTaskStore((s) => s.selectColor)
  const selectedView = useTaskStore((s) => s.selectedView)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const categoryColors = useTaskStore((s) => s.logCategoryColors)
  // 記録の色は分類で決まるので、ここで出すのは予定・タスクに付けた色（ラベル）だけ
  const colorLabel = !isListedTimeLog(task) && task.color ? labelForHex(task.color, presets, categoryColors) : null
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

  useDismiss({ open: rowMenuOpen, onClose: () => setRowMenuOpen(false), inside: [rowMenuRef] })

  const sortedLists = useMemo(() => [...lists].sort((a, b) => a.order - b.order), [lists])
  const sections = useTaskStore((s) => s.sections)
  /** このタスクのリストのセクション（メニューで移す先） */
  const sectionsForTaskList = useMemo(
    () => sections.filter((s) => s.listId === task.listId).sort((a, b) => a.order - b.order),
    [sections, task.listId],
  )

  /** 名前のないまま離れたら作らなかったことにする（Enter で増やした行など） */
  const discardIfBlank = () => {
    if (task.title.trim() || editValue.trim()) return false
    setEditing(false)
    discardBlankTask(task.id)
    return true
  }

  const commitEdit = () => {
    if (discardIfBlank()) return
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== task.title) {
      updateTask(task.id, { title: trimmed })
    }
    setEditing(false)
    setEditValue(trimmed || task.title)
  }

  const timeLog = isListedTimeLog(task)
  const notePreview = task.description.split('\n').find((line) => line.trim())?.trim() ?? ''
  const priorityColor = PRIORITY_RING_CLASS[task.priority]
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const due = task.dueDate ? dueDateLabel(task.dueDate, t('common.today'), dateLocale) : null
  const dueText = due ? (task.dueTime ? `${due.text} ${task.dueTime}` : due.text) : null
  // 完了済みタイムログの期限（= ログ開始日）は緊急度を持たないので常に控えめに
  const dueTone: DateTone | null = due ? (timeLog && task.completed ? 'past' : due.tone) : null
  const scheduled = useMemo(() => {
    if (timeLog || !task.scheduledDate) return null
    const d = parseISO(`${task.scheduledDate}T12:00:00`)
    const fmt = d.getFullYear() !== zonedNow().getFullYear() ? 'yyyy/M/d (E)' : 'M/d (E)'
    const datePart = isAppToday(d) ? t('common.today') : format(d, fmt, { locale: dateLocale })
    const timePart = task.startTime ? ` ${task.startTime}${task.endTime ? `–${task.endTime}` : ''}` : ''
    return { text: `${datePart}${timePart}`, tone: dateTone(d) }
  }, [timeLog, task.scheduledDate, task.startTime, task.endTime, dateLocale, t])
  const [isDragging, setIsDragging] = useState(false)

  const handleDragStart = useCallback((e: React.DragEvent) => {
    const group =
      dragGroupIds && dragGroupIds.length > 1 && dragGroupIds.includes(task.id)
        ? dragGroupIds
        : [task.id]
    e.dataTransfer.setData(TASK_DND_TYPE, task.id)
    e.dataTransfer.setData('text/plain', task.id)
    if (group.length > 1) e.dataTransfer.setData(TASK_MULTI_DND_TYPE, JSON.stringify(group))
    startNativeTaskDragGhost(e, task.title || '', group.length)
    e.dataTransfer.effectAllowed = 'copy'
    setIsDragging(true)
  }, [task.id, task.title, dragGroupIds])

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    onNativeDragEnd?.()
  }, [onNativeDragEnd])

  const rowNativeDraggable = !hasSortableHandle

  // スマホ: 行を長押しで一括選択を始める（ドラッグは左の ⋮⋮ だけなので競合しない）
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)
  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current.timer)
    longPressRef.current = null
  }, [])
  const onRowPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || !selection || editing) return
    const timer = window.setTimeout(() => {
      longPressRef.current = null
      suppressClickRef.current = true
      navigator.vibrate?.(15)
      selection.onToggle(e as unknown as React.MouseEvent)
    }, LONG_PRESS_MS)
    longPressRef.current = { timer, x: e.clientX, y: e.clientY }
  }
  const onRowPointerMove = (e: React.PointerEvent) => {
    const lp = longPressRef.current
    if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > LONG_PRESS_SLOP_PX) cancelLongPress()
  }

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
      className={`group flex items-center gap-2 rounded-xl transition-colors cursor-pointer select-none md:select-auto
                  hover:bg-zinc-50 dark:hover:bg-zinc-800/40
                  ${isSubtask ? 'px-2.5 py-1.5' : 'px-2.5 py-2'}
                  ${selection?.selected ? 'bg-accent-50/70 dark:bg-accent-500/10' : ''}
                  ${isDragging ? 'opacity-30' : ''}
                  ${rowClassName ?? ''}`}
      style={{ WebkitTouchCallout: 'none' }}
      onPointerDown={onRowPointerDown}
      onPointerMove={onRowPointerMove}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onContextMenu={(e) => {
        // 長押しで出る OS のメニューを抑える（選択に使う）
        if (suppressClickRef.current || longPressRef.current) e.preventDefault()
      }}
      onClickCapture={(e) => {
        // 長押しで選択した直後の click で詳細・編集が開かないように
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          e.stopPropagation()
          e.preventDefault()
        }
      }}
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
              : 'hidden md:flex md:opacity-0 md:group-hover:opacity-100'}
            ${selection.selected
              ? 'border-accent-500 bg-accent-500 text-on-accent'
              : 'border-zinc-300 dark:border-zinc-600 bg-transparent hover:border-zinc-400 dark:hover:border-zinc-500'}`}
        >
          {selection.selected && (
            <CheckIcon className={isSubtask ? 'w-2.5 h-2.5 md:w-2 md:h-2' : 'w-3 h-3 md:w-2.5 md:h-2.5'} strokeWidth={3} />
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
              ? 'bg-accent-500 border-accent-500 text-on-accent'
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
          <CheckIcon className={isSubtask ? 'w-3 h-3 md:w-2.5 md:h-2.5' : 'w-3.5 h-3.5 md:w-3 md:h-3'} strokeWidth={3} />
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
              if (isSubmitEnter(e)) {
                e.preventDefault()
                if (discardIfBlank()) return
                commitEdit()
                onEnterCreateSibling?.(task)
              }
              if (e.key === 'Escape') {
                if (discardIfBlank()) return
                setEditValue(task.title)
                setEditing(false)
              }
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
          {dueTone && dueText && (!task.completed || timeLog) && (
            <span className={`inline-flex items-center gap-0.5 text-[11px] ${DUE_TONE_CLASS[dueTone]}`}>
              <CalendarIcon className="w-3 h-3" />
              {dueText}
            </span>
          )}
          {scheduled && (!task.completed || timeLog) && (
            <span className={`inline-flex items-center gap-0.5 text-[11px] ${SCHEDULED_TONE_CLASS[scheduled.tone]}`}>
              <ClockIcon className="w-3 h-3" />
              {scheduled.text}
            </span>
          )}
          {sectionLabel && (
            <span className="max-w-[12rem] truncate text-[11px] text-zinc-500 dark:text-zinc-400">{sectionLabel}</span>
          )}
          {task.recurrence && (
            <RepeatIcon className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
          )}
          {!timeLog && task.color && (
            <button
              type="button"
              // To‑Do ではその色ラベルを開く（カレンダー横の一覧などでは何もしない）
              onClick={(e) => { e.stopPropagation(); if (isTodoSurfaceView(selectedView)) selectColor(task.color!) }}
              title={colorLabelText(task.color, presets, categoryColors, t)}
              aria-label={colorLabelText(task.color, presets, categoryColors, t)}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: task.color }} aria-hidden />
              {colorLabel}
            </button>
          )}
          {task.tags.length > 0 && (tagsEnabled || task.isTimeLog) && (
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
                ${open ? '' : 'md:[@media(hover:hover)]:hidden md:group-hover:inline-flex md:group-focus-within:inline-flex'}`}
            >
              <CalendarIcon className={`w-5 h-5 md:w-4 md:h-4 ${task.dueDate ? 'text-date-500' : 'text-zinc-400'}`} />
            </button>
          )}
        />
      )}

      {/* スマホだけ: アーカイブ・削除・リストの移動をこのメニューに畳む。PC は行の横のボタン・詳細・サイドバーへのドラッグで足りる */}
      <div className="relative flex-shrink-0 md:hidden" ref={rowMenuRef}>
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
            className={`absolute right-0 top-full z-30 mt-1 w-52 py-2 ${POPOVER_PANEL}`}
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
                {/* ドラッグできない並べ替え中やスマホでも、セクションを移せるように */}
                {sectionsForTaskList.length > 0 && (
                  <>
                    <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 block mt-2 mb-1">{t('taskDetail.section')}</label>
                    <select
                      className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-1.5 py-1"
                      value={task.sectionId ?? ''}
                      onChange={(e) => {
                        updateTask(task.id, { sectionId: e.target.value || null })
                        setRowMenuOpen(false)
                      }}
                    >
                      <option value="">{t('taskDetail.sectionNone')}</option>
                      {sectionsForTaskList.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </>
                )}
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
                <TrashIcon className="h-4 w-4 shrink-0 text-zinc-400" />
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
        className="hidden rounded-md p-1 transition-colors hover:bg-zinc-200 md:group-hover:block md:group-focus-within:block md:[@media(hover:none)]:block dark:hover:bg-zinc-700"
        aria-label={t('taskItem.archiveAria')}
        title={t('taskItem.archive')}
      >
        <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); deleteTask(task.id) }}
        className="hidden rounded-md p-1 transition-colors hover:bg-zinc-200 md:group-hover:block md:group-focus-within:block md:[@media(hover:none)]:block dark:hover:bg-zinc-700"
        aria-label={t('taskItem.deleteAria')}
        title={t('taskItem.deleteAria')}
      >
        <TrashIcon className="h-4 w-4 text-zinc-400" />
      </button>
    </div>
  )
}
