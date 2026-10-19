import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { DraggableSyntheticListeners } from '@dnd-kit/core'
import { dreamOfStep, dreamSteps } from '../lib/somedayTier'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { isEventTask, isLogTask, isTodoTask, type Task } from '../types/task'
import { startNativeTaskDragGhost } from '../lib/nativeTaskDragGhost'
import { sourceLinkOf } from '../lib/sourceLink'
import { useCanvasSubmitted } from '../lib/canvasSubmitted'
import { isModKey, isSubmitEnter } from '../lib/keyboard'
import { DueDatePopover } from './DueDatePopover'
import { isAppPast, isAppToday, isAppTomorrow } from '../lib/timeZone'
import { RowSelectCheckbox } from './ui/RowSelectCheckbox'
import { ArchiveIcon, CalendarArrowIcon, CalendarIcon, CheckIcon, ClockIcon, EllipsisIcon, RepeatIcon, StarIcon, TrashIcon } from './icons'
import { CompletionCircle, EventMark } from './ui/CompletionCircle'
import { planHex } from '../lib/planVisual'
import { useDeferredComplete } from '../hooks/useDeferredComplete'
import { useTextEntry } from '../hooks/useTextEntry'
import { tip } from '../lib/tooltip'
import { ChildDueChip } from './ui/ChildDueChip'
import { useChildDue } from '../hooks/useChildDue'
import { recurrenceLabel } from '../lib/recurrenceLabel'
import { isTinyDrag, startTaskDrag } from '../lib/taskDrag'
import { DUE_TONE_CLASS, SCHEDULED_TONE_CLASS, type DateTone } from './ui/dueTone'
import { fromDateKey } from '../lib/dateKey'
import { formatShortDateWeekday } from '../lib/dateFormat'
import { chipClass } from './ui/chipClass'
import { TaskSourceLink } from './ui/TaskSourceLink'
import { useScheduleWish } from '../hooks/useScheduleWish'
import { openTaskMenu } from '../lib/overlays'
import { useRowLift } from '../hooks/useTouchLift'
import { isLiftActive, TOUCH_LIFT_ATTR } from '../lib/touchLift'
import { useRowSwipe } from '../hooks/useRowSwipe'
import { useTodayToggle } from '../hooks/useTodayToggle'
import { useIsCoarsePointer } from '../hooks/useMediaQuery'
import { colorVars } from '../lib/logCategoryColors'
import { ROW_CURSOR_CLASS, ROW_SELECTED_CLASS, ROW_PRESS_CLASS, ROW_LIFTED_CLASS } from './ui/rowStateClass'
import { useAppTodayKey } from '../hooks/useAppClock'
import { TITLE_MAX_LENGTH } from '../lib/textLimits'
import { dueDateLabel } from './ui/dueDateLabel'
import { DAY_ROW_PAD_CLASS, DAY_ROW_TIME_CLASS } from './ui/DayRow'

/** PC で題名を 1 回押してから詳細を開くまで（2 回目が来たら名前の変更） */
const DOUBLE_CLICK_MS = 250

function dateTone(d: Date): DateTone {
  if (isAppToday(d)) return 'today'
  if (isAppTomorrow(d)) return 'tomorrow'
  return isAppPast(d) ? 'overdue' : 'future'
}

export type TaskItemSelection = {
  selected: boolean
  onToggle: (e: React.MouseEvent) => void
  /** 一覧で何か選択中、または当該行が選択中のときチェック列を常時表示 */
  reveal: boolean
  /** ↑↓ で選んでいる行（キー操作中だけ枠を出す） */
  cursor?: boolean
  /** 一覧（listbox）の中の option としての id。aria-activedescendant が指す */
  optionId?: string
  /** 右クリックでメニューを開く（PC のマウスだけ。スマホの長押しは行を浮かせて選択に入れる） */
  onContextMenu?: (e: React.MouseEvent) => void
}

/**
 * 一覧の 1 行。memo なので、渡す関数・配列・選択の印は親で使い回すこと（useTaskListSelection の makeRowClick / makeSelection など）。
 * 毎回作り直すと、関係ない行まで描き直す
 */
export const TaskItem = memo(function TaskItem({
  task,
  onClick,
  onRowClick,
  onEnterCreateSibling,
  dragHandle,
  liftListeners,
  isSubtask,
  selection,
  rowClassName,
  autoEdit,
  hideDueDatePicker = false,
  dragGroupIds,
  onNativeDragEnd,
  sectionLabel,
  dayKey,
  keepHandleSpace = false,
  showChildDue = false,
  compact = false,
}: {
  task: Task
  onClick?: () => void
  /** 修飾キー・一括選択時の行クリック（指定時はこちらを優先） */
  onRowClick?: (e: React.MouseEvent) => void
  /** 未完了タスクを完了する直前のフック。指定時は通常トグルより優先。 */
  /** タイトル編集中 Enter で、同階層の次タスクを作成する */
  onEnterCreateSibling?: (task: Task) => void
  dragHandle?: React.ReactNode
  /** スマホの手動の並びの行: つまみの代わりに行そのものに付ける dnd-kit の listeners（長押しで浮かせて運ぶ。`useRowGrip`） */
  liftListeners?: DraggableSyntheticListeners
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
  /** 行がこの日の下に並んでいるとき（スケジュール）。その日の締切・予定は日付を書かず時刻だけ（締切に時刻が無ければ「期限」） */
  dayKey?: string
  /** セクションの塊で分けずに並べるとき、行に出すセクション名（Canvas なら科目） */
  sectionLabel?: string | null
  /** つまみを出さない並びでも、つまみの幅を空けておく（並び順を変えても行の文字が横に動かないように。PC だけ） */
  keepHandleSpace?: boolean
  /** 親の行に子のいちばん近い締切を出す（子の行が下に並ばない所だけ。To-Do 一覧では出さない） */
  showChildDue?: boolean
  /** 1 行に詰める（カレンダーの日パネル）: 左に開始時刻、メモ・タグ・実行日は出さず、締切だけ右に出す */
  compact?: boolean
}) {
  const { t, i18n } = useTranslation()
  // 締切の言葉と色（「明日まで」「1日遅れ」）は今日で変わるので、行は memo でも日をまたいだら描き直す
  useAppTodayKey()
  const hasSortableHandle = !!dragHandle || !!liftListeners
  const discardBlankTask = useTaskStore((s) => s.discardBlankTask)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const updateTask = useTaskStore((s) => s.updateTask)
  const archiveTask = useTaskStore((s) => s.archiveTask)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const setFilterTag = useTaskStore((s) => s.setFilterTag)
  const showMoveBanner = useTaskStore((s) => s.showMoveBanner)
  const deferredComplete = useDeferredComplete(toggleTask)
  /** 押した直後は、完了の欄へ移る前からこの行を完了の見た目にする */
  const justCompleted = deferredComplete.isPending(task.id)
  const shownCompleted = task.completed || justCompleted
  // いつか・チェックリストのリストは完了の印・日付のボタンだけ変える（操作は To-Do と同じ）
  const listKind = useTaskStore((s) => s.lists.find((l) => l.id === task.listId)?.kind ?? 'tasks')
  const scheduleWish = useScheduleWish()
  // いつかの夢（#221）: 本体は予定にせず、行に次の一歩と進み具合を出す。描き直しを抑えるため文字 1 つで受け取る
  const dream = listKind === 'someday' && !task.parentId && task.somedayTier === 'dream'
  const dreamStepKey = useTaskStore((s) => {
    if (!dream) return ''
    const steps = dreamSteps(s.tasks, task.id)
    return steps ? `${steps.done}/${steps.total}\u0000${steps.next?.title ?? ''}` : ''
  })
  const [dreamProgress, dreamNext] = dreamStepKey ? dreamStepKey.split('\u0000') : ['', '']
  // 夢の一歩を予定にした To-Do（#430）: 元の夢の名前を添える（夢でなくなったら出さない）
  const stepOfDream = useTaskStore((s) =>
    task.dreamId
      ? (dreamOfStep(s.tasks, task, new Set(s.lists.filter((l) => l.kind === 'someday').map((l) => l.id)))?.title ?? null)
      : null,
  )
  // 子のある行は「済/全部」（中国語 1/3、カレー 2/3）。消した・アーカイブした子と記録は数えない。夢は上の進み具合で出す
  const childProgress = useTaskStore((s) => {
    if (dream) return null
    let total = 0
    let done = 0
    for (const c of s.tasks) {
      if (c.parentId !== task.id || c.deletedAt || c.archivedAt || isLogTask(c)) continue
      total++
      if (c.completed) done++
    }
    return total > 0 ? `${done}/${total}` : null
  })
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
  // Canvas で提出はしたが済んではいない課題（途中保存も）。終わったかは利用者が決める（#395）
  const submitted = useCanvasSubmitted(task.id) && !task.completed
  const repeatText = task.recurrence ? recurrenceLabel(t, task.recurrence, task.dueDate) : null
  const notePreview = sourceLink
    ? ''
    : (task.description
        .split('\n')
        .find((line) => line.trim())
        ?.trim() ?? '')
  // タスクに付けた色（ラベル）は行の左の細い線だけで見せる。完了・記録には出さない
  const rowHex = !timeLog && task.color && !task.completed ? task.color : null
  const language = i18n.resolvedLanguage
  const due = task.dueDate ? dueDateLabel(task.dueDate, task.dueTime, t, language) : null
  const dueOnRowDay = !!dayKey && task.dueDate === dayKey
  const dueText = due ? (dueOnRowDay ? (task.dueTime ?? t('common.due')) : due.text) : null
  // 完了済みタイムログの期限（= ログ開始日）は緊急度を持たないので常に控えめに
  const dueTone: DateTone | null = due ? (timeLog && task.completed ? 'past' : due.tone) : null
  const childDue = useChildDue(task, showChildDue && !timeLog)
  const scheduled = useMemo(() => {
    if (timeLog || !task.scheduledDate) return null
    const d = fromDateKey(task.scheduledDate)
    const timePart = task.startTime ? `${task.startTime}${task.endTime ? `–${task.endTime}` : ''}` : ''
    if (task.scheduledDate === dayKey) return timePart ? { text: timePart, tone: dateTone(d) } : null
    const datePart = isAppToday(d) ? t('common.today') : formatShortDateWeekday(d, language)
    return { text: timePart ? `${datePart} ${timePart}` : datePart, tone: dateTone(d) }
  }, [timeLog, task.scheduledDate, task.startTime, task.endTime, language, t, dayKey])
  const [isDragging, setIsDragging] = useState(false)
  /** 行を押した所と時刻・ドラッグ中の最後の位置（少し動いただけのドラッグを押したことにする。`isTinyDrag`） */
  const pressRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const dragPosRef = useRef<{ x: number; y: number } | null>(null)
  const stopTrackRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopTrackRef.current?.(), [])

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const group = dragGroupIds && dragGroupIds.length > 1 && dragGroupIds.includes(task.id) ? dragGroupIds : [task.id]
      startTaskDrag(e, task.id, group)
      startNativeTaskDragGhost(e, task.title || '', group.length)
      setIsDragging(true)
      // dragend の座標は Firefox で 0 になるので、dragover で追う
      dragPosRef.current = null
      const track = (ev: DragEvent) => {
        dragPosRef.current = { x: ev.clientX, y: ev.clientY }
      }
      window.addEventListener('dragover', track, true)
      stopTrackRef.current = () => window.removeEventListener('dragover', track, true)
    },
    [task.id, task.title, dragGroupIds],
  )

  const pressRow = (e: React.MouseEvent) => {
    if (editing) return
    if (onRowClick) onRowClick(e)
    else onClick?.()
  }

  const handleDragEnd = (e: React.DragEvent) => {
    stopTrackRef.current?.()
    stopTrackRef.current = null
    setIsDragging(false)
    onNativeDragEnd?.()
    const press = pressRef.current
    if (press && isTinyDrag(press, dragPosRef.current ?? press, performance.now(), e.dataTransfer.dropEffect)) pressRow(e)
  }

  const rowNativeDraggable = !hasSortableHandle

  // スマホ: 行を長押しすると浮いて選択に入る（押さえたまま別の指でタップした行も足す）。
  // 手動の並びの行（liftListeners）は dnd-kit のセンサーが同じことをして、そのまま運べる
  const lift = !!liftListeners && !editing
  const longPress = useRowLift(task.id, !!selection && !editing && !liftListeners)

  const beginRename = useCallback(() => {
    setEditValue(task.title)
    setEditing(true)
  }, [task.title])
  // 題名を押したときも行と同じ（To-Do 一覧は詳細、今日の計画の指はシート。`useOpenTaskRow`）。名前の変更は PC はダブルクリックか F2、スマホは詳細から。
  // 行に動きが無い所（詳細のサブタスク）は押すと名前の変更
  const hasRowAction = !!onRowClick || !!onClick
  const singleClickRef = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(singleClickRef.current), [])
  const isCoarse = useIsCoarsePointer()

  const handleTitleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!hasRowAction) {
        e.stopPropagation()
        beginRename()
        return
      }
      // 指・キー（detail 0）・修飾キー・選択中はそのまま行へ
      if (isCoarse || e.detail === 0 || e.shiftKey || isModKey(e) || selection?.reveal) return
      // PC: ダブルクリックの 2 回目より先に詳細が開いて背景を押さないよう、1 回目は少し待ってから行へ
      e.stopPropagation()
      window.clearTimeout(singleClickRef.current)
      if (e.detail > 1) return
      singleClickRef.current = window.setTimeout(() => {
        if (onRowClick) onRowClick(e)
        else onClick?.()
      }, DOUBLE_CLICK_MS)
    },
    [hasRowAction, isCoarse, selection?.reveal, onRowClick, onClick, beginRename],
  )
  const handleTitleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isCoarse || !hasRowAction || selection?.reveal) return
      e.stopPropagation()
      window.clearTimeout(singleClickRef.current)
      beginRename()
    },
    [isCoarse, hasRowAction, selection?.reveal, beginRename],
  )

  /** 一覧がメニューを持っていれば任せる（選択中のまとめて操作）。無ければこの行だけのメニューを開く */
  const openMenuAt = (p: { clientX: number; clientY: number }) => {
    if (selection?.onContextMenu) selection.onContextMenu(p as React.MouseEvent)
    else openTaskMenu({ kind: 'task', x: p.clientX, y: p.clientY, taskIds: [task.id] })
  }

  const rowRef = useRef<HTMLDivElement>(null)
  const optionId = selection?.optionId
  useEffect(() => {
    if (selection?.cursor) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selection?.cursor])

  // スマホ: 右へ払うと完了、左へ払うと今日やる ⇄ 明日へ（タスクのリストの親タスクだけ）。今日の計画の行と同じ
  const todayToggle = useTodayToggle()
  const swipe = useRowSwipe(
    rowRef,
    {
      right: {
        label:
          listKind === 'someday' ? t('someday.fulfill') : listKind === 'checklist' ? t('checklist.check') : t('taskList.selectionComplete'),
        icon: <CheckIcon className="h-4 w-4" strokeWidth={2.5} />,
        tone: 'done',
        run: () => deferredComplete.toggle(task.id, false),
      },
      left:
        listKind === 'tasks' && !isSubtask
          ? {
              label: todayToggle([task.id]).label,
              icon: <CalendarArrowIcon className="h-4 w-4" />,
              tone: 'date',
              run: () => todayToggle([task.id]).run(),
            }
          : undefined,
    },
    isCoarse && !editing && !selection?.reveal && isTodoTask(task) && !task.completed,
  )

  // PC の行の最低の高さ（min-h）は、並べ替えハンドルの有無（手動の並べ替えかどうか）で行の高さが変わらないように
  return (
    <div className="relative rounded-xl">
      {swipe.backdrop}
      {/* 行のクリックはマウスの近道。キーでは一覧（listbox）の ↑↓・Enter・Space と、行の中のボタン（タイトル・完了・メニュー）で同じことができる */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        ref={rowRef}
        data-task-row={task.id}
        {...(optionId
          ? { id: optionId, role: 'option', 'aria-selected': Boolean(selection?.selected), 'aria-labelledby': `${optionId}-title` }
          : {})}
        draggable={rowNativeDraggable}
        onDragStart={rowNativeDraggable ? handleDragStart : undefined}
        onDragEnd={rowNativeDraggable ? handleDragEnd : undefined}
        className={`group relative flex items-center gap-2 rounded-xl transition-colors cursor-pointer select-none
                  hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${ROW_PRESS_CLASS}
                  ${compact ? DAY_ROW_PAD_CLASS : isSubtask ? 'px-2.5 py-1.5 md:min-h-9' : 'px-2.5 py-2 md:min-h-10'}
                  ${selection?.selected ? ROW_SELECTED_CLASS : ''}
                  ${selection?.cursor ? ROW_CURSOR_CLASS : ''}
                  ${isDragging ? 'opacity-30' : ''}
                  ${longPress.lifted ? ROW_LIFTED_CLASS : ''}
                  ${rowClassName ?? ''} ${swipe.swipingClass}`}
        style={{ WebkitTouchCallout: 'none' }}
        {...longPress.pointerHandlers}
        {...(lift ? { ...liftListeners, [TOUCH_LIFT_ATTR]: '' } : {})}
        onContextMenu={(e) => {
          // 長押しで出る OS のメニューを抑える（行を浮かせるのに使う）
          if (longPress.isPressing() || isLiftActive() || (e.nativeEvent as PointerEvent).pointerType === 'touch') {
            e.preventDefault()
            return
          }
          if (editing) return
          e.preventDefault()
          openMenuAt(e)
        }}
        // 長押しで浮かせた直後の click で詳細・編集が開かないように
        onClickCapture={(e) => {
          swipe.onClickCapture(e)
          longPress.onClickCapture(e)
        }}
        onMouseDown={(e) => {
          pressRef.current = { x: e.clientX, y: e.clientY, t: performance.now() }
        }}
        onClick={pressRow}
      >
        {rowHex && (
          // 丸の中と同じ薄い色。ベタ塗りだとここだけポップに浮く
          <span aria-hidden className="gc-line absolute left-0.5 top-2 bottom-2 w-[3px] rounded-full" style={colorVars(rowHex)} />
        )}
        {dragHandle ? (
          <span className="touch-none flex-shrink-0">{dragHandle}</span>
        ) : keepHandleSpace && !isCoarse ? (
          // つまみ（`useRowGrip`）と同じ幅
          <span aria-hidden className="w-7 flex-shrink-0 md:w-5" />
        ) : null}

        {selection ? (
          <RowSelectCheckbox selected={selection.selected} reveal={selection.reveal} onToggle={selection.onToggle} small={isSubtask} />
        ) : null}

        {/* 時刻の無い行は時刻の列を空けない（空けると左の色の線と丸の間が開きすぎる） */}
        {compact && task.startTime && <span className={DAY_ROW_TIME_CLASS}>{task.startTime}</span>}

        {/* 予定（バイト・授業）には完了の丸を出さない */}
        {isEventTask(task) ? (
          <EventMark hex={planHex(task)} small={isSubtask} />
        ) : (
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
                ? t('someday.fulfillItem', { title: task.title })
                : task.completed && timeLog
                  ? t('taskItem.unlogItem', { title: task.title })
                  : t('taskItem.completeItem', { title: task.title })
            }
          />
        )}

        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              aria-label={t('taskDetail.titleEditAria')}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              maxLength={TITLE_MAX_LENGTH}
              {...titleEntryWithSibling}
              onClick={(e) => e.stopPropagation()}
              // 下線と余白（3px）は負のマージンで行の高さに数えない。押して編集に入っても行が動かない
              className={`block w-full bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                       border-b border-accent-400 pb-0.5 -mb-[3px] ${isSubtask ? 'text-[13px]' : 'text-sm'}`}
            />
          ) : (
            <button
              type="button"
              id={optionId ? `${optionId}-title` : undefined}
              data-task-title
              onClick={handleTitleClick}
              onDoubleClick={handleTitleDoubleClick}
              onKeyDown={(e) => {
                if (e.key !== 'F2') return
                e.preventDefault()
                e.stopPropagation()
                beginRename()
              }}
              className={`${childProgress ? 'flex items-baseline gap-2' : 'block truncate'} w-full text-left ${hasRowAction ? 'cursor-pointer' : 'cursor-text'} outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-accent-400/50
                        ${isSubtask ? 'text-[13px]' : 'text-sm'}
                        transition-colors ${shownCompleted && !timeLog ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}
            >
              {childProgress ? (
                <>
                  {/* 子の進み具合は題名のすぐ右（PC の広い行で右端に離すと、どの行の数か追いにくい） */}
                  <span className="min-w-0 truncate">{task.title || '\u00A0'}</span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">{childProgress}</span>
                </>
              ) : (
                task.title || '\u00A0'
              )}
            </button>
          )}

          {notePreview && !compact && (
            <span
              className={`block truncate mt-0.5 ${isSubtask ? 'text-[11px]' : 'text-xs'}
                        ${task.completed && !timeLog ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-400 dark:text-zinc-500'}`}
            >
              {notePreview}
            </span>
          )}

          {!compact && (
            <div className="flex items-center gap-2 mt-0.5 empty:hidden flex-wrap">
              {dueTone && dueText && (!task.completed || timeLog) && (
                <span className={`inline-flex items-center gap-0.5 text-[11px] ${DUE_TONE_CLASS[dueTone]}`}>
                  <CalendarIcon className="w-3 h-3" />
                  {dueText}
                </span>
              )}
              {submitted && (
                <span {...tip(t('canvas.submittedMarkHint'))} className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t('canvas.submittedMark')}
                </span>
              )}
              {childDue && <ChildDueChip due={childDue} />}
              {scheduled && (!task.completed || timeLog) && (
                <span className={`inline-flex items-center gap-0.5 text-[11px] ${SCHEDULED_TONE_CLASS[scheduled.tone]}`}>
                  <ClockIcon className="w-3 h-3" />
                  {scheduled.text}
                </span>
              )}
              {dreamStepKey && (
                <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {dreamNext && <span className="max-w-[14rem] truncate">{t('someday.nextStep', { title: dreamNext })}</span>}
                  <span className="tabular-nums" aria-label={t('someday.stepProgressAria', { progress: dreamProgress })}>
                    {dreamProgress}
                  </span>
                </span>
              )}
              {sectionLabel && <span className="max-w-[12rem] truncate text-[11px] text-zinc-500 dark:text-zinc-400">{sectionLabel}</span>}
              {stepOfDream && (
                <span
                  className="inline-flex min-w-0 items-center gap-0.5 text-[11px] text-zinc-500 dark:text-zinc-400"
                  aria-label={t('someday.stepOfDreamAria', { title: stepOfDream })}
                >
                  <StarIcon className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="max-w-[12rem] truncate">{stepOfDream}</span>
                </span>
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
                      onClick={(e) => {
                        e.stopPropagation()
                        setFilterTag(tag)
                      }}
                      className={chipClass({ variant: 'fill', hover: true })}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {compact && dueTone && dueText && !task.completed && (
          <span className={`inline-flex shrink-0 items-center gap-0.5 text-[11px] ${DUE_TONE_CLASS[dueTone]}`}>
            <CalendarIcon className="w-3 h-3" />
            {dueText}
          </span>
        )}

        {listKind === 'someday' && !task.completed && !dream && (
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
                className={`transition-colors cursor-pointer rounded-md p-1.5 md:-my-0.5 md:p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 touch-manipulation
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
                className={`transition-colors cursor-pointer rounded-md p-1.5 md:-my-0.5 md:p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 touch-manipulation
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
          <EllipsisIcon className="h-5 w-5" />
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
          {...tip(t('taskItem.deleteAria'), { name: true })}
        >
          <TrashIcon className="h-4 w-4 text-zinc-400" />
        </button>
      </div>
    </div>
  )
})
