import { useState, useRef, useEffect, useCallback, useMemo, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { isLogTask, type Task } from '../types/task'
import { parseISO } from 'date-fns'
import { startNativeTaskDragGhost } from '../lib/nativeTaskDragGhost'
import { sourceLinkOf } from '../lib/sourceLink'
import { isModKey, isSubmitEnter } from '../lib/keyboard'
import { DueDatePopover } from './DueDatePopover'
import { isAppPast, isAppToday, isAppTomorrow, zonedNow } from '../lib/timeZone'
import { ArchiveIcon, CalendarIcon, CheckIcon, ClockIcon, ListBulletIcon, RepeatIcon, TrashIcon } from './icons'
import { CompletionCircle } from './ui/CompletionCircle'
import { useDeferredComplete } from '../hooks/useDeferredComplete'
import { useTextEntry } from '../hooks/useTextEntry'
import { tip } from '../lib/tooltip'
import { recurrenceLabel } from '../lib/recurrenceLabel'
import { startTaskDrag } from '../lib/taskDrag'
import { DUE_TONE_CLASS, SCHEDULED_TONE_CLASS, type DateTone } from './ui/dueTone'
import { fromDateKey } from '../lib/dateKey'
import { formatDate } from '../lib/dateFormat'
import { chipClass } from './ui/chipClass'
import { TaskSourceLink } from './ui/TaskSourceLink'
import { useScheduleWish } from '../hooks/useScheduleWish'
import { openTaskMenu } from '../lib/overlays'
import { useLongPress } from '../hooks/useLongPress'
import { ROW_CURSOR_CLASS, ROW_SELECTED_CLASS, ROW_PRESS_CLASS } from './ui/rowStateClass'

function dateTone(d: Date): DateTone {
  if (isAppToday(d)) return 'today'
  if (isAppTomorrow(d)) return 'tomorrow'
  return isAppPast(d) ? 'overdue' : 'future'
}

/** 行の日付: 今年なら「10/3 (土)」、ほかの年は年も付ける */
function rowDateText(d: Date, language: string | undefined): string {
  return formatDate(d, d.getFullYear() !== zonedNow().getFullYear() ? 'shortDateWeekdayYear' : 'shortDateWeekday', language)
}

function dueDateLabel(iso: string, todayLabel: string, language: string | undefined): { text: string; tone: DateTone } {
  const d = parseISO(iso)
  if (isAppToday(d)) return { text: todayLabel, tone: 'today' }
  return { text: rowDateText(d, language), tone: dateTone(d) }
}

export type TaskItemSelection = {
  selected: boolean
  onToggle: (e: React.MouseEvent) => void
  /** 一覧で何か選択中、または当該行が選択中のときチェック列を常時表示 */
  reveal: boolean
  /** ↑↓ で選んでいる行（キー操作中だけ枠を出す） */
  cursor?: boolean
  /** 右クリックでメニューを開く（PC のマウスだけ。スマホの長押しは選択に使う） */
  onContextMenu?: (e: React.MouseEvent) => void
}

export function TaskItem({ task, onClick, onRowClick, onEnterCreateSibling, dragHandle, isSubtask, selection, rowClassName, autoEdit, hideDueDatePicker = false, dragGroupIds, onNativeDragEnd, sectionLabel }: {
  task: Task
  onClick?: () => void
  /** 修飾キー・一括選択時の行クリック（指定時はこちらを優先） */
  onRowClick?: (e: React.MouseEvent) => void
  /** 未完了タスクを完了する直前のフック。指定時は通常トグルより優先。 */
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
  const { toggleTask, updateTask, archiveTask, deleteTasks, setFilterTag, showMoveBanner } = useTaskStore()
  const deferredComplete = useDeferredComplete(toggleTask)
  /** 押した直後は、完了の欄へ移る前からこの行を完了の見た目にする */
  const justCompleted = deferredComplete.isPending(task.id)
  const shownCompleted = task.completed || justCompleted
  // いつか・チェックリストのリストは完了の印・日付のボタンだけ変える（操作は To-Do と同じ）
  const listKind = useTaskStore((s) => s.lists.find((l) => l.id === task.listId)?.kind ?? 'tasks')
  const scheduleWish = useScheduleWish()
  const [editing, setEditing] = useState(Boolean(autoEdit))
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

  const titleEntry = useTextEntry({
    onSubmit: () => {
      if (discardIfBlank()) return
      commitEdit()
    },
    onCancel: () => {
      if (discardIfBlank()) return
      setEditValue(task.title)
      setEditing(false)
    },
  })
  const titleEntryWithSibling = {
    ...titleEntry,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      titleEntry.onKeyDown(e)
      // Enter で確定したら、下に同じ階層の行を足す（Enter で書き進める）
      if (isSubmitEnter(e) && editValue.trim()) onEnterCreateSibling?.(task)
    },
  }

  const timeLog = isLogTask(task)
  // メモが URL 1 つだけ（Canvas・Notion の取り込みなど）なら、文字列ではなく「開く」アイコンにする
  const sourceLink = sourceLinkOf(task.description)
  const repeatText = task.recurrence ? recurrenceLabel(t, task.recurrence, task.dueDate) : null
  const notePreview = sourceLink ? '' : task.description.split('\n').find((line) => line.trim())?.trim() ?? ''
  // タスクに付けた色（ラベル）は行の左の細い線だけで見せる。完了・記録には出さない
  const rowHex = !timeLog && task.color && !task.completed ? task.color : null
  const language = i18n.resolvedLanguage
  const due = task.dueDate ? dueDateLabel(task.dueDate, t('common.today'), language) : null
  const dueText = due ? (task.dueTime ? `${due.text} ${task.dueTime}` : due.text) : null
  // 完了済みタイムログの期限（= ログ開始日）は緊急度を持たないので常に控えめに
  const dueTone: DateTone | null = due ? (timeLog && task.completed ? 'past' : due.tone) : null
  const scheduled = useMemo(() => {
    if (timeLog || !task.scheduledDate) return null
    const d = fromDateKey(task.scheduledDate)
    const datePart = isAppToday(d) ? t('common.today') : rowDateText(d, language)
    const timePart = task.startTime ? ` ${task.startTime}${task.endTime ? `–${task.endTime}` : ''}` : ''
    return { text: `${datePart}${timePart}`, tone: dateTone(d) }
  }, [timeLog, task.scheduledDate, task.startTime, task.endTime, language, t])
  const [isDragging, setIsDragging] = useState(false)

  const handleDragStart = useCallback((e: React.DragEvent) => {
    const group =
      dragGroupIds && dragGroupIds.length > 1 && dragGroupIds.includes(task.id)
        ? dragGroupIds
        : [task.id]
    startTaskDrag(e, task.id, group)
    startNativeTaskDragGhost(e, task.title || '', group.length)
    setIsDragging(true)
  }, [task.id, task.title, dragGroupIds])

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    onNativeDragEnd?.()
  }, [onNativeDragEnd])

  const rowNativeDraggable = !hasSortableHandle

  // スマホ: 行を長押しで一括選択を始める（ドラッグは左の ⋮⋮ だけなので競合しない）
  const longPress = useLongPress((e) => selection?.onToggle(e as unknown as React.MouseEvent), !!selection && !editing)

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

  /** 一覧がメニューを持っていれば任せる（選択中のまとめて操作）。無ければこの行だけのメニューを開く */
  const openMenuAt = (p: { clientX: number; clientY: number }) => {
    if (selection?.onContextMenu) selection.onContextMenu(p as React.MouseEvent)
    else openTaskMenu({ kind: 'task', x: p.clientX, y: p.clientY, taskIds: [task.id] })
  }

  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selection?.cursor) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selection?.cursor])

  // PC の行の最低の高さ（min-h）は、並べ替えハンドルの有無（手動の並べ替えかどうか）で行の高さが変わらないように
  return (
    <div
      ref={rowRef}
      data-task-row={task.id}
      draggable={rowNativeDraggable}
      onDragStart={rowNativeDraggable ? handleDragStart : undefined}
      onDragEnd={rowNativeDraggable ? handleDragEnd : undefined}
      className={`group relative flex items-center gap-2 rounded-xl transition-colors cursor-pointer select-none
                  hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${ROW_PRESS_CLASS}
                  ${isSubtask ? 'px-2.5 py-1.5 md:min-h-9' : 'px-2.5 py-2 md:min-h-10'}
                  ${selection?.selected ? ROW_SELECTED_CLASS : ''}
                  ${selection?.cursor ? ROW_CURSOR_CLASS : ''}
                  ${isDragging ? 'opacity-30' : ''}
                  ${rowClassName ?? ''}`}
      style={{ WebkitTouchCallout: 'none' }}
      {...longPress.pointerHandlers}
      onContextMenu={(e) => {
        // 長押しで出る OS のメニューを抑える（選択に使う）
        if (longPress.isPressing()) {
          e.preventDefault()
          return
        }
        if (editing) return
        e.preventDefault()
        openMenuAt(e)
      }}
      // 長押しで選択した直後の click で詳細・編集が開かないように
      onClickCapture={longPress.onClickCapture}
      onClick={(e) => {
        if (editing) return
        if (onRowClick) onRowClick(e)
        else onClick?.()
      }}
    >
      {rowHex && (
        <span aria-hidden className="absolute left-0.5 top-2 bottom-2 w-[3px] rounded-full" style={{ backgroundColor: rowHex }} />
      )}
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

      <CompletionCircle
        completed={shownCompleted}
        justCompleted={justCompleted}
        priority={task.priority}
        small={isSubtask}
        shape={listKind === 'checklist' ? 'square' : listKind === 'someday' ? 'star' : 'circle'}
        inert={Boolean(selection?.reveal)}
        onClick={(e) => {
          e.stopPropagation()
          deferredComplete.toggle(task.id, task.completed)
        }}
        label={
          listKind === 'someday'
            ? t(task.completed ? 'someday.unfulfillItem' : 'someday.fulfillItem', { title: task.title })
            : task.completed
            ? timeLog
              ? t('taskItem.unlogIncomplete')
              : t('taskItem.markIncomplete')
            : t('taskItem.markComplete')
        }
      />

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            {...titleEntryWithSibling}
            onClick={(e) => e.stopPropagation()}
            // 下線と余白（3px）は負のマージンで行の高さに数えない。押して編集に入っても行が動かない
            className={`block w-full bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                       border-b border-accent-400 pb-0.5 -mb-[3px] ${isSubtask ? 'text-[13px]' : 'text-sm'}`}
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
                        transition-colors ${shownCompleted && !timeLog ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}
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
          {repeatText && (
            <span role="img" aria-label={repeatText} {...tip(repeatText)} className="inline-flex">
              <RepeatIcon className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
            </span>
          )}
          {sourceLink && <TaskSourceLink link={sourceLink} />}
          {task.tags.length > 0 && (
            <div className="flex gap-1">
              {task.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={(e) => { e.stopPropagation(); setFilterTag(tag) }}
                  className={chipClass({ variant: 'fill', hover: true })}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {listKind === 'someday' && !task.completed && (
        // いつかは締切の代わりに「予定する」（日付を選ぶと未分類へ移ってその日の予定になる）。出し方は締切のボタンと同じ
        <DueDatePopover
          value={null}
          onChange={(v) => scheduleWish([task.id], v)}
          kind="scheduled"
          align="right"
          wrapperClassName="relative hidden flex-shrink-0 md:flex"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              aria-label={t('someday.scheduleItem', { title: task.title })}
              {...tip(t('someday.schedule'))}
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={(e) => {
                e.stopPropagation()
                toggle()
              }}
              className={`transition-all cursor-pointer rounded-md p-1.5 md:-my-0.5 md:p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 touch-manipulation
                ${open ? '' : 'md:[@media(hover:hover)]:hidden md:group-hover:inline-flex md:group-focus-within:inline-flex'}`}
            >
              <CalendarIcon className="w-5 h-5 md:w-4 md:h-4 text-zinc-400" />
            </button>
          )}
        />
      )}

      {!hideDueDatePicker && listKind === 'tasks' && (
        <DueDatePopover
          value={task.dueDate}
          onChange={(v) => updateTask(task.id, { dueDate: v })}
          align="right"
          // md 未満はタイトル幅を確保するため出さない（期限は詳細シートで編集）
          wrapperClassName="relative hidden flex-shrink-0 md:flex"
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
              className={`transition-all cursor-pointer rounded-md p-1.5 md:-my-0.5 md:p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 touch-manipulation
                ${open ? '' : 'md:[@media(hover:hover)]:hidden md:group-hover:inline-flex md:group-focus-within:inline-flex'}`}
            >
              <CalendarIcon className={`w-5 h-5 md:w-4 md:h-4 ${task.dueDate ? 'text-date-500' : 'text-zinc-400'}`} />
            </button>
          )}
        />
      )}

      {/* スマホだけ: 右クリックの代わり。PC と同じタスクのメニューを開く（PC は右クリック・行の横のボタン） */}
      <button
        type="button"
        className="flex-shrink-0 rounded-md p-1.5 text-zinc-400 touch-manipulation hover:bg-zinc-200 md:hidden dark:hover:bg-zinc-700"
        aria-haspopup="menu"
        aria-label={t('taskItem.moreMenuAria')}
        onClick={(e) => {
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          openMenuAt({ clientX: r.left, clientY: r.bottom + 4 })
        }}
      >
        <ListBulletIcon className="h-5 w-5" />
      </button>

      {/* カーソルを乗せたときだけ出るボタンは、負のマージンで行の高さを変えない（上下に動かすと行がガタつく） */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          archiveTask(task.id)
          showMoveBanner(t('toast.taskArchived'))
        }}
        className="hidden rounded-md p-1 transition-colors hover:bg-zinc-200 md:-my-1 md:group-hover:block md:group-focus-within:block md:[@media(hover:none)]:block dark:hover:bg-zinc-700"
        aria-label={t('taskItem.archiveAria')}
        {...tip(t('taskItem.archive'))}
      >
        <ArchiveIcon className="h-4 w-4 text-zinc-400" />
      </button>

      {/* 確認なしで消し「元に戻す」を出す（右クリック・Delete キーと同じ） */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          deleteTasks([task.id])
        }}
        className="hidden rounded-md p-1 transition-colors hover:bg-zinc-200 md:-my-1 md:group-hover:block md:group-focus-within:block md:[@media(hover:none)]:block dark:hover:bg-zinc-700"
        aria-label={t('taskItem.deleteAria')}
        {...tip(t('taskItem.deleteAria'))}
      >
        <TrashIcon className="h-4 w-4 text-zinc-400" />
      </button>
    </div>
  )
}
