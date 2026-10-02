import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addDays,
  differenceInCalendarDays,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  parseISO,
} from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import { TaskDetail } from './TaskDetail'
import {
  HOUR_HEIGHT,
  HOURS,
  timeToY,
  timeToMinutes,
  yToTime,
} from '../lib/timeGrid'
import {
  durationMinutesForTaskId,
  isOvernightTimeLog,
  logOverlapsDateKey,
  patchAfterTimelineMove,
  taskPlacementDate,
  timeLogSegmentLayoutForDay,
} from '../lib/taskTimeRange'
import { isActiveTask } from '../lib/taskLifecycle'
import { useTimelineDrag, getResizeCursor, type CreateIntent, type CreatePopup } from '../lib/useTimelineDrag'
import {
  canStartTimerFor,
  getTimerDrop,
  isOverTimerDrop,
  setTimerDragActive,
  setTimerDropHover,
  startTimerForTask,
} from '../lib/timerDrop'
import { useTimelineDrop, readDraggedTaskIds, TASK_DND_TYPE, useTaskNativeDragActive } from '../lib/useTimelineDrop'
import {
  beginCalendarItemNativeDrag,
  getCalendarItemDrag,
  isOverUnscheduleDrop,
  setCalendarItemDragActive,
  setUnscheduleHover,
  UNSCHEDULE_PATCH,
  useCalendarItemDrag,
} from '../lib/calendarItemDrag'
import { useGoogleCalendarEvents } from '../hooks/useGoogleCalendarEvents'
import {
  canEditGoogleEvent,
  getDraggedGoogleEvent,
  GOOGLE_EVENT_DND_TYPE,
  moveGoogleEvent,
  setDraggedGoogleEvent,
} from '../lib/googleEventEdit'
import { googleEventTiming } from '../lib/googleCalendar'
import type { CalendarEvent } from '../types/calendarEvent'
import { useNowMinuteTick } from '../hooks/useNowMinuteTick'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import { CalendarAddTaskButton, CalendarInlineTaskAdd } from './CalendarInlineTaskAdd'
import type { Task } from '../types/task'
import { layoutPlanAndLog } from '../lib/overlapLayout'
import { unplannedListIds } from '../lib/listKind'
import { colorVars, recordHex } from '../lib/logCategoryColors'
import { DEFAULT_GOOGLE_EVENT_HEX, NEUTRAL_HEX } from '../lib/googleColors'
import { planHex, planVisualState } from '../lib/planVisual'
import { habitToPlannedItem } from '../lib/habitSlots'
import { buildHabitRecordIndex, habitDayStatus } from '../lib/habitTiming'
import { EventPopover } from './timeline/EventPopover'
import { GoogleEventPopover } from './timeline/GoogleEventPopover'
import { QuickCreatePopover } from './timeline/QuickCreatePopover'
import { isSleepRecord } from '../lib/sleep'
import { rectOf, type AnchorRect } from './timeline/anchoredCard'
import { isAppToday, zonedNow } from '../lib/timeZone'
import { TimeGutter, TimeGutterHeader } from './timeline/TimeGutter'
import { useTimeGutterWidth } from '../hooks/useTimeGutterWidth'
import { dayMarkerClass, SELECTED_COLUMN, TODAY_COLUMN, TODAY_TEXT } from '../lib/dayMarker'
import { CheckIcon } from './icons'

const GRID_TOTAL_HEIGHT = HOUR_HEIGHT * 24
/** ドラッグ中にこの幅まで左右の端へ寄せると週をめくる */
const EDGE_FLIP_PX = 16
const EDGE_FLIP_DELAY_MS = 600
const EDGE_FLIP_REPEAT_MS = 1000

/** 週タイムラインのブロック用（列上では開始・終了時刻が必須。Google 等の外部ブロックは最小形） */
type TimeBlockTask = {
  id: string
  title: string
  startTime: string
  endTime: string
  completed: boolean
  dueDate?: string | null
  endDate?: string | null
  isTimeLog?: boolean
  parentId?: string | null
}

/** ブロックの縦位置（重なり計算と描画で同じ値を使う） */
function blockGeometry(task: TimeBlockTask, dayKey: string | undefined, isLog: boolean): { top: number; height: number } {
  const seg = isLog && dayKey ? timeLogSegmentLayoutForDay(task as Task, dayKey) : null
  const top = seg?.top ?? timeToY(task.startTime)
  const height = seg?.height ?? Math.max(timeToY(task.endTime) - top, HOUR_HEIGHT / 4)
  return { top, height: Math.max(height, 18) }
}

/**
 * タイムライン上の 1 ブロック（Google カレンダー風）。
 * 記録（実績）とこれからの予定（Google の予定も）は薄い塗り＋枠（`gc-plan`）。記録は右、予定は左の列で見分ける。
 * 終わった・完了した予定は灰色（`gc-missed`）。
 * 背景色の細い縁で、隣り合う・重なるブロックの境目を見せる。
 */
function TimeBlock({ task, dayKey, onPointerDown, onOpenDetail, onTap, isLog, sleep, hStyle, colorHex }: {
  task: TimeBlockTask
  /** クリック・タップで開く（ドラッグしない Google の予定用） */
  onTap?: () => void
  /** 週グリッド上の列の日付（ログのセグメント表示用） */
  dayKey?: string
  onPointerDown: (e: React.PointerEvent) => void
  onOpenDetail: () => void
  isLog?: boolean
  /** 睡眠の記録。色の付いた記録と並べても目立たない、落ち着いた帯にする */
  sleep?: boolean
  /** 重なり回避の横位置（left/width） */
  hStyle?: React.CSSProperties
  /** 予定はリストの色、記録は分類の色、外部の予定は Google の青 */
  colorHex: string
}) {
  const { top, height } = blockGeometry(task, dayKey, Boolean(isLog))

  const handlePointerMoveLocal = (e: React.PointerEvent) => {
    if (onTap) {
      // 押すとカードが開くだけ（動かせない）
      ;(e.currentTarget as HTMLElement).style.cursor = 'pointer'
      return
    }
    const cursor = getResizeCursor(e)
    ;(e.currentTarget as HTMLElement).style.cursor = cursor ?? 'grab'
  }

  // 記録（実績）は分類の色、予定はその色で、どちらも薄い塗り＋枠。予定は終わったら（完了・未完了とも）グレー
  // Google の予定（外部）も予定と同じ見せ方
  const state = !isLog && dayKey ? planVisualState(task, dayKey) : 'upcoming'
  const variant = sleep ? 'gc-sleep' : isLog ? 'gc-plan' : state === 'upcoming' ? 'gc-plan' : 'gc-missed'
  const moon = sleep && (
    <svg className="mr-0.5 inline h-2.5 w-2.5 -translate-y-px" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
    </svg>
  )
  const doneMark = state === 'done' ? '✓ ' : ''
  // 30 分未満の短いブロックは Google と同じく「タイトル、9:00」を 1 行に
  const compact = height < 32

  return (
    <button
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e) }}
      onPointerMove={handlePointerMoveLocal}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onOpenDetail()
        }
      }}
      className={`${variant} absolute overflow-hidden rounded-[5px] px-1.5 py-0.5 text-left text-[11px] leading-tight
        cursor-grab select-none touch-none transition-shadow hover:z-30! hover:shadow-md active:cursor-grabbing
        `}
      data-block-id={task.id}
      title={`${task.title}  ${task.startTime} – ${task.endTime}`}
      style={{
        top,
        height,
        left: 2,
        right: 2,
        ...hStyle,
        ...colorVars(colorHex),
        boxShadow: '0 0 0 1px var(--gc-surface)',
      }}
    >
      {compact ? (
        <span className="block truncate">
          <span className="font-medium">{moon}{doneMark}{task.title}</span>
          <span className="opacity-80">、{task.startTime}</span>
        </span>
      ) : (
        <>
          <span className="block truncate font-medium">{moon}{doneMark}{task.title}</span>
          <span className="block text-[10px] opacity-80">
            {task.startTime} – {task.endTime}
          </span>
        </>
      )}
    </button>
  )
}

/**
 * 予定ブロックの右上に重ねる ✓（習慣の「予定どおりやった」、Google の予定を記録にする）。
 * ブロック自体が button なので入れ子にせず、同じ位置に重ねる。
 */
function SlotCheck({ top, hStyle, label, onCheck }: { top: number; hStyle?: React.CSSProperties; label: string; onCheck: () => void }) {
  return (
    <div className="pointer-events-none absolute z-[31] flex justify-end p-0.5" style={{ top, left: 2, right: 2, ...hStyle }}>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onCheck()
        }}
        title={label}
        aria-label={label}
        className="pointer-events-auto flex h-4 w-4 items-center justify-center rounded-full border border-current bg-white/70 opacity-70 transition-opacity hover:opacity-100 dark:bg-zinc-900/60"
      >
        <CheckIcon className="h-2.5 w-2.5" strokeWidth={3} />
      </button>
    </div>
  )
}

/** クリック / ドラッグで作成中の枠（作成カードの位置の基準にもなる） */
function CreateGhost({ popup, onAnchor, laneClass }: { popup: CreatePopup; onAnchor: (el: HTMLDivElement | null) => void; laneClass: string }) {
  const { t } = useTranslation()
  const top = timeToY(popup.startTime)
  const height = Math.max(timeToY(popup.endTime) - top, 20)
  return (
    <div
      ref={onAnchor}
      className={`gc-solid pointer-events-none absolute ${laneClass} z-30 rounded-[5px] px-1.5 py-0.5 text-[11px] leading-tight shadow-lg`}
      style={{ top, height, ...colorVars(popup.intent === 'log' ? NEUTRAL_HEX : '#7986CB') }}
    >
      <span className="block font-medium">{t('quickCreate.untitled')}</span>
      <span className="block text-[10px] opacity-80">{popup.startTime} – {popup.endTime}</span>
    </div>
  )
}

export function WeekCalendarView({
  anchor,
  selectedDateKey,
  onSelectDate,
  singleDay = false,
  onNavigateWeek,
}: {
  anchor: Date
  selectedDateKey?: string
  onSelectDate?: (dateKey: string) => void
  /** true のとき `selectedDateKey` の 1 日だけを描画し、曜日ヘッダーを出さない（「今日の計画」用） */
  singleDay?: boolean
  /** ドラッグ中に左右の端で止めたとき前後の週へめくる（未指定ならめくらない） */
  onNavigateWeek?: (dir: -1 | 1) => void
}) {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const listColorById = useMemo(() => new Map(lists.map((l) => [l.id, l.color])), [lists])
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  const googleCanWrite = useTaskStore((s) => s.googleCanWrite)
  /** つかんでいる Google の予定（週をめくって一覧から消えても動かせるよう、つかんだ時点のものを持つ） */
  const googleDragRef = useRef<CalendarEvent | null>(null)
  const updateTask = useTaskStore((s) => s.updateTask)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const habits = useTaskStore((s) => s.habits)
  const completeHabitAsPlanned = useTaskStore((s) => s.completeHabitAsPlanned)
  const addCompletedTaskWithTime = useTaskStore((s) => s.addCompletedTaskWithTime)
  const habitIndex = useMemo(() => buildHabitRecordIndex(tasks), [tasks])
  const asOneUndo = useTaskStore((s) => s.asOneUndo)
  const dropLaneRef = useRef<CreateIntent>('schedule')
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)
  const isDesktop = useIsDesktop()
  const [allDayAddDate, setAllDayAddDate] = useState<string | null>(null)
  /** 終日の行で ToDo を別の日へドラッグ中に、落とし先の日を光らせる */
  const [allDayDragOver, setAllDayDragOver] = useState<string | null>(null)
  /** ToDo 一覧などから ToDo をドラッグしている間は、終日の行を空でも出して落とせるようにする */
  const taskDragActive = useTaskNativeDragActive()
  const { overUnschedule: unscheduleHover } = useCalendarItemDrag()
  const scrollRef = useRef<HTMLDivElement>(null)
  const keepScrollOnFlipRef = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS

  const days = useMemo(() => {
    const ws = startOfWeek(anchor, { weekStartsOn: 1 })
    const we = endOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: ws, end: we })
  }, [anchor])

  const focusKey = selectedDateKey ?? format(zonedNow(), 'yyyy-MM-dd')
  const gridDays = useMemo(() => {
    if (isDesktop && !singleDay) return days
    const hit = days.find((d) => format(d, 'yyyy-MM-dd') === focusKey)
    return [hit ?? days[0]!]
  }, [isDesktop, singleDay, days, focusKey])
  /** 時間バーの他のタイムゾーンの時刻は、表示している最初の日で計算する */
  const gridKey0 = format(gridDays[0]!, 'yyyy-MM-dd')
  const gutterWidth = useTimeGutterWidth()
  const gridColsClass = gridDays.length === 7 ? 'grid-cols-7' : 'grid-cols-1'
  /** 予定（左）と 記録（右）の 2 列（今日・週とも）。押した・落とした列で作るものが決まる */
  const splitLanes = true
  const laneAt = (clientX: number, el: HTMLElement): CreateIntent => {
    if (!splitLanes) return 'schedule'
    const rect = el.getBoundingClientRect()
    return clientX >= rect.left + rect.width / 2 ? 'log' : 'schedule'
  }
  const laneClass = (lane: CreateIntent | null | undefined) =>
    !splitLanes ? 'left-0.5 right-0.5' : lane === 'log' ? 'left-[calc(50%+2px)] right-0.5' : 'left-0.5 right-[calc(50%+2px)]'
  const [dropLane, setDropLane] = useState<CreateIntent>('schedule')
  const [dropBlocked, setDropBlocked] = useState(false)
  /** 記録は今より先には作れない。その日の記録に使える最後の分（null は制限なし＝過去の日） */
  const now = useNowMinuteTick()
  const todayKey = format(now, 'yyyy-MM-dd')
  const logLimitMin = (key: string): number | null =>
    key < todayKey ? null : key > todayKey ? 0 : now.getHours() * 60 + now.getMinutes()
  const logLimitRef = useRef(logLimitMin)
  logLimitRef.current = logLimitMin

  const { allDayByDate, timedByDate, timeLogsByDate } = useMemo(() => {
    const allDay = new Map<string, typeof tasks>()
    const timed = new Map<string, typeof tasks>()
    const logs = new Map<string, typeof tasks>()
    for (const t of tasks) {
      if (t.parentId || !isActiveTask(t) || excludedListIds.has(t.listId)) continue
      if (t.isTimeLog) {
        if (!t.dueDate || !t.startTime || !t.endTime) continue
        for (const day of days) {
          const dk = format(day, 'yyyy-MM-dd')
          if (!logOverlapsDateKey(t, dk)) continue
          const arr = logs.get(dk) ?? []
          arr.push(t)
          logs.set(dk, arr)
        }
        continue
      }
      const placement = taskPlacementDate(t)
      if (!placement) continue
      if (t.startTime && t.endTime) {
        const arr = timed.get(placement) ?? []
        arr.push(t)
        timed.set(placement, arr)
      } else {
        const arr = allDay.get(placement) ?? []
        arr.push(t)
        allDay.set(placement, arr)
      }
    }
    return { allDayByDate: allDay, timedByDate: timed, timeLogsByDate: logs }
  }, [tasks, days, excludedListIds])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof calendarEvents>()
    for (const e of calendarEvents) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  }, [calendarEvents])

  const fetchRange = useMemo(() => {
    const ws = startOfWeek(anchor, { weekStartsOn: 1 })
    const we = endOfWeek(anchor, { weekStartsOn: 1 })
    we.setHours(23, 59, 59)
    return { ws, we }
  }, [anchor])
  useGoogleCalendarEvents(fetchRange.ws, fetchRange.we)

  /**
   * 日を押すと親が anchor を作り直すので、anchor そのものではなく「表示している週（1 日表示なら日）」が
   * 変わったときだけスクロールを合わせる。でないと朝や夜で押した瞬間に今の時刻へ戻されてしまう
   */
  const scrollKey = format(singleDay ? anchor : startOfWeek(anchor, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  useEffect(() => {
    if (!scrollRef.current) return
    // 1 日表示で今日なら「今」が上から少し下に来るように。それ以外は朝から
    const now = zonedNow()
    const showNow = singleDay ? isAppToday(anchor) : days.some((d) => isAppToday(d))
    const hours = showNow ? Math.max(0, now.getHours() + now.getMinutes() / 60 - 1.5) : 7.5
    // ドラッグ中に週をめくったときは、つかんだ位置がずれないようスクロールを保つ
    if (keepScrollOnFlipRef.current) {
      keepScrollOnFlipRef.current = false
      return
    }
    scrollRef.current.scrollTop = HOUR_HEIGHT * hours
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 表示週が変わったときだけ合わせる
  }, [singleDay, scrollKey])

  const getRelativeY = useCallback((clientY: number, dateKey: string) => {
    if (!gridRef.current) return 0
    const cols = gridRef.current.querySelectorAll<HTMLElement>('[data-datekey]')
    for (const col of cols) {
      if (col.dataset.datekey === dateKey) {
        const rect = col.getBoundingClientRect()
        return Math.max(0, Math.min(clientY - rect.top, GRID_TOTAL_HEIGHT))
      }
    }
    return 0
  }, [])

  const getDateKeyFromX = useCallback((clientX: number): string | null => {
    if (!gridRef.current) return null
    const cols = gridRef.current.querySelectorAll<HTMLElement>('[data-datekey]')
    for (const col of cols) {
      const rect = col.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) {
        return col.dataset.datekey ?? null
      }
    }
    return null
  }, [])

  // 予定を押したときのカード / 空き時間の作成カード（Google カレンダー風）
  const [eventCard, setEventCard] = useState<{ taskId: string; anchor: AnchorRect } | null>(null)
  const [createAnchor, setCreateAnchor] = useState<AnchorRect | null>(null)
  const openCard = useCallback((taskId: string) => {
    const el = gridRef.current?.querySelector(`[data-block-id="${CSS.escape(taskId)}"]`) ?? null
    const anchor = rectOf(el)
    if (anchor) setEventCard({ taskId, anchor })
    else openDetail(taskId)
  }, [openDetail])
  const closeCard = useCallback(() => setEventCard(null), [])
  const [googleCard, setGoogleCard] = useState<{ eventId: string; anchor: AnchorRect } | null>(null)
  const openGoogleCard = useCallback((eventId: string) => {
    // 終日の行のチップはグリッドの外にあるので、画面全体から探す
    const anchor = rectOf(document.querySelector(`[data-block-id="${CSS.escape(`event-${eventId}`)}"]`))
    if (anchor) setGoogleCard({ eventId, anchor })
  }, [])
  const closeGoogleCard = useCallback(() => setGoogleCard(null), [])
  // 安定した ref コールバック（毎回作り直すと描画のたびに state が変わって無限ループになる）
  const setCreateAnchorFromEl = useCallback((el: HTMLDivElement | null) => setCreateAnchor(el ? rectOf(el) : null), [])
  const openDetailFromCard = useCallback((taskId: string) => {
    setEventCard(null)
    openDetail(taskId)
  }, [openDetail])

  const timelineDrag = useTimelineDrag({
    getRelativeY,
    getDateKeyFromX,
    onMoveDone: (taskId, dateKey, startTime, endTime) => {
      if (taskId.startsWith('event-')) {
        const ev = googleDragRef.current
        if (ev) void moveGoogleEvent(ev, { date: dateKey, startTime, endTime })
        return
      }
      const prev = useTaskStore.getState().tasks.find((x) => x.id === taskId)
      if (!prev) return
      const patch = patchAfterTimelineMove(prev, dateKey, startTime, endTime)
      if (prev.isTimeLog) {
        // 記録を今より先へは動かせない（元の位置に戻る）
        const limit = logLimitRef.current(dateKey)
        const crossesDay = isOvernightTimeLog({ ...prev, ...patch } as Task)
        if (limit !== null && (crossesDay || timeToMinutes(endTime) > limit)) return
      }
      updateTask(taskId, patch)
    },
    onResizeDone: (taskId, startTime, endTime) => {
      if (taskId.startsWith('event-')) {
        const ev = googleDragRef.current
        if (ev) void moveGoogleEvent(ev, { date: ev.date, startTime, endTime })
        return
      }
      const prev = useTaskStore.getState().tasks.find((x) => x.id === taskId)
      if (prev?.isTimeLog && prev.dueDate && !prev.endDate) {
        const limit = logLimitRef.current(prev.dueDate)
        if (limit !== null && timeToMinutes(endTime) > limit) {
          if (timeToMinutes(startTime) >= limit) return
          endTime = `${String(Math.floor(limit / 60)).padStart(2, '0')}:${String(limit % 60).padStart(2, '0')}`
        }
      }
      updateTask(taskId, { startTime, endTime })
    },
    onBlockTap: useCallback((taskId: string) => {
      if (taskId.startsWith('event-')) openGoogleCard(taskId.slice('event-'.length))
      else openCard(taskId)
    }, [openCard, openGoogleCard]),
    clickCreateMinutes: 60,
  })

  const getTaskDuration = useCallback(
    (taskId: string): number | null => durationMinutesForTaskId(tasks, taskId),
    [tasks],
  )

  /** 時刻つきの予定を時間グリッドより上（終日の行）へ持っていったときの落とし先の日 */
  const [allDayMoveKey, setAllDayMoveKey] = useState<string | null>(null)
  const [edgeDir, setEdgeDir] = useState<-1 | 1 | null>(null)
  const edgeDirAt = (clientX: number, clientY: number): -1 | 1 | null => {
    if (!onNavigateWeek || gridDays.length !== 7 || !gridRef.current || !scrollRef.current) return null
    const area = scrollRef.current.getBoundingClientRect()
    if (clientY < area.top || clientY > area.bottom) return null
    const grid = gridRef.current.getBoundingClientRect()
    if (clientX < grid.left + EDGE_FLIP_PX) return -1
    if (clientX > grid.right - EDGE_FLIP_PX) return 1
    return null
  }
  const flipWeekRef = useRef<(dir: -1 | 1) => void>(() => {})
  flipWeekRef.current = (dir) => {
    keepScrollOnFlipRef.current = true
    onNavigateWeek?.(dir)
    timelineDrag.shiftMoveDragDate(dir * 7)
  }
  const pointerMoving = timelineDrag.drag?.kind === 'move'
  const activeEdge = edgeDir && (taskDragActive || pointerMoving) ? edgeDir : null
  useEffect(() => {
    if (!activeEdge) return
    let id = window.setTimeout(function tick() {
      flipWeekRef.current(activeEdge)
      id = window.setTimeout(tick, EDGE_FLIP_REPEAT_MS)
    }, EDGE_FLIP_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [activeEdge])

  const endMoveExtras = () => {
    setAllDayMoveKey(null)
    setEdgeDir(null)
    setCalendarItemDragActive(false)
    setTimerDragActive(false)
  }
  const handleGridPointerMove = (e: React.PointerEvent) => {
    timelineDrag.handlePointerMove(e)
    const d = timelineDrag.drag
    if (!d || d.kind !== 'move' || !timelineDrag.didMove.current) return
    setEdgeDir(edgeDirAt(e.clientX, e.clientY))
    // 記録は「やったこと」なので終日・ToDo には戻さない
    const task = tasks.find((x) => x.id === d.taskId)
    if (!task || task.isTimeLog) return
    setCalendarItemDragActive(true)
    if (canStartTimerFor(task)) {
      setTimerDragActive(true)
      const overTimer = isOverTimerDrop(e.clientX, e.clientY)
      setTimerDropHover(overTimer)
      if (overTimer) {
        setAllDayMoveKey(null)
        setUnscheduleHover(false)
        return
      }
    }
    const gridTop = scrollRef.current?.getBoundingClientRect().top ?? 0
    if (e.clientY < gridTop && !singleDay) {
      setAllDayMoveKey(getDateKeyFromX(e.clientX))
      setUnscheduleHover(false)
    } else {
      setAllDayMoveKey(null)
      setUnscheduleHover(isOverUnscheduleDrop(e.clientX, e.clientY))
    }
  }
  const handleGridPointerUp = () => {
    const d = timelineDrag.drag
    const toUnschedule = getCalendarItemDrag().overUnschedule
    if (d?.kind === 'move' && timelineDrag.didMove.current && getTimerDrop().over) {
      // 上の「ここに落として計測開始」。予定の時刻はそのまま
      startTimerForTask(d.taskId)
      timelineDrag.handlePointerCancel()
    } else if (d?.kind === 'move' && timelineDrag.didMove.current && (allDayMoveKey || toUnschedule)) {
      const task = useTaskStore.getState().tasks.find((x) => x.id === d.taskId)
      if (task && !task.isTimeLog) {
        updateTask(d.taskId, allDayMoveKey
          ? { scheduledDate: allDayMoveKey, startTime: null, endTime: null }
          : UNSCHEDULE_PATCH)
      }
      timelineDrag.handlePointerCancel()
    } else {
      timelineDrag.handlePointerUp()
    }
    endMoveExtras()
  }
  const handleGridPointerCancel = () => {
    timelineDrag.handlePointerCancel()
    endMoveExtras()
  }

  const timelineDrop = useTimelineDrop({
    getRelativeY,
    getTaskDuration,
    onDrop: (taskId, dateKey, startTime, endTime) => {
      if (dropLaneRef.current === 'log') {
        // 記録の列に落とした = その時間にやった。記録を残してタスクは完了に（今より先は不可）
        const task = useTaskStore.getState().tasks.find((x) => x.id === taskId)
        if (!task) return
        const limit = logLimitRef.current(dateKey)
        if (limit !== null) {
          if (timeToMinutes(startTime) >= limit) return
          if (timeToMinutes(endTime) > limit || endTime <= startTime) {
            endTime = `${String(Math.floor(limit / 60)).padStart(2, '0')}:${String(limit % 60).padStart(2, '0')}`
          }
        }
        asOneUndo(() => {
          addTimeLog(task.title, dateKey, startTime, endTime, task.tags)
          if (!task.completed) toggleTask(taskId)
        })
        return
      }
      updateTask(taskId, { scheduledDate: dateKey, startTime, endTime, isTimeLog: false })
    },
  })

  const hasAnyAllDay = useMemo(() => {
    return gridDays.some((d) => {
      const key = format(d, 'yyyy-MM-dd')
      // 1 日表示では終日タスクは左のリストに出るので、外部の終日予定だけを数える
      const taskCount = singleDay ? 0 : (allDayByDate.get(key)?.length ?? 0)
      const eventCount = (eventsByDate.get(key) ?? []).filter((e) => e.isAllDay).length
      return taskCount + eventCount > 0
    })
  }, [gridDays, singleDay, allDayByDate, eventsByDate])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!singleDay && (
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 px-2 pt-1">
          {gridDays.length > 1 ? (
            <TimeGutterHeader dateKey={gridKey0} />
          ) : (
            <div style={{ width: gutterWidth }} className="flex-shrink-0" />
          )}
          <div className="flex-1 grid grid-cols-7">
            {days.map((day, i) => {
              const today = isAppToday(day)
              const key = format(day, 'yyyy-MM-dd')
              const selected = selectedDateKey ? selectedDateKey === key : false
              // 「予定 / 記録」は 7 日すべてに並べるとうるさいので 1 か所だけ（今日、無ければ先頭の日）
              const showLaneLabels = today || (i === 0 && !days.some((d) => isAppToday(d)))
              return (
                <div key={day.toISOString()} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelectDate?.(key)}
                    className={`w-full text-center py-2 transition-colors ${
                      today ? TODAY_TEXT : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    <div className="text-[11px] font-medium">{format(day, 'E', { locale: dateLocale })}</div>
                    <div className={`text-lg font-semibold inline-flex items-center justify-center w-8 h-8 rounded-full
                      ${dayMarkerClass({ today, selected })}`}>
                      {format(day, 'd')}
                    </div>
                    <div className={`mt-0.5 hidden grid-cols-2 text-[9px] font-normal text-zinc-400 dark:text-zinc-500 ${showLaneLabels ? 'md:grid' : ''}`}>
                      <span>{t('weekCalendar.lanePlan')}</span>
                      <span>{t('weekCalendar.laneLog')}</span>
                    </div>
                  </button>
                  <CalendarAddTaskButton
                    onClick={() => {
                      onSelectDate?.(key)
                      setAllDayAddDate(key)
                    }}
                    className={`absolute right-1 top-1 hidden h-4 w-4 p-px opacity-0 transition-opacity md:block
                      focus-visible:opacity-100 group-hover:opacity-100 ${selected ? 'opacity-60' : ''}`}
                  />
                </div>
              )
            })}
          </div>
        </div>
        )}

        {/* 1 日だけ描くとき（今日・スマホの週）は列の上に 1 行で */}
        {gridDays.length === 1 && (
          <div className="flex flex-shrink-0 border-b border-zinc-100 px-2 dark:border-zinc-800">
            <TimeGutterHeader dateKey={gridKey0} />
            <div className="grid flex-1 grid-cols-2 py-1.5 text-center text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
              <span>{t('weekCalendar.lanePlan')}</span>
              <span>{t('weekCalendar.laneLog')}</span>
            </div>
          </div>
        )}

        {(hasAnyAllDay || allDayAddDate || allDayMoveKey || (taskDragActive && !singleDay)) && (
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 px-2">
            <div style={{ width: gutterWidth }} className="flex-shrink-0 text-[10px] text-zinc-400 pr-2 pt-1 text-right">
              {t('weekCalendar.allDay')}
            </div>
            <div className={`flex-1 grid ${gridColsClass}`}>
              {gridDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayAllDay = singleDay ? [] : (allDayByDate.get(key) ?? [])
                const dayAllDayEvents = (eventsByDate.get(key) ?? []).filter((e) => e.isAllDay)
                return (
                  <div
                    key={key}
                    className={`min-h-[28px] border-l border-zinc-100 dark:border-zinc-800 px-0.5 py-0.5 space-y-0.5 transition-colors
                      ${allDayDragOver === key || allDayMoveKey === key ? 'bg-accent-50 ring-2 ring-inset ring-accent-400 dark:bg-accent-500/10' : ''}`}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(TASK_DND_TYPE) && !e.dataTransfer.types.includes(GOOGLE_EVENT_DND_TYPE)) return
                      e.preventDefault()
                      // ToDo 一覧の行は effectAllowed が copy、Google の予定は move。合わないと落とせない
                      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(GOOGLE_EVENT_DND_TYPE) ? 'move' : 'copy'
                      setAllDayDragOver(key)
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                      setAllDayDragOver((prev) => (prev === key ? null : prev))
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      setAllDayAddDate(null)
                      setAllDayDragOver(null)
                      const gev = e.dataTransfer.types.includes(GOOGLE_EVENT_DND_TYPE) ? getDraggedGoogleEvent() : null
                      if (gev) {
                        // 終日の Google の予定は日数を保ったまま動かす
                        const cur = googleEventTiming(gev)
                        const span = cur.endDate ? differenceInCalendarDays(parseISO(cur.endDate), parseISO(cur.date)) : 0
                        void moveGoogleEvent(gev, {
                          date: key,
                          endDate: span > 0 ? format(addDays(parseISO(key), span), 'yyyy-MM-dd') : null,
                          startTime: null,
                          endTime: null,
                        })
                        return
                      }
                      const ids = readDraggedTaskIds(e.dataTransfer)
                      if (!ids.length) return
                      // 終日の行に落とした = その日にやる ToDo（時刻は外す。期限 dueDate は変えない）
                      asOneUndo(() => {
                        for (const id of ids) {
                          updateTask(id, { scheduledDate: key, startTime: null, endTime: null, isTimeLog: false })
                        }
                      })
                    }}
                  >
                    {dayAllDayEvents.map((e) => (
                      <div
                        key={`event-all-day-${e.id}`}
                        title={e.summary}
                        data-block-id={`event-${e.id}`}
                        draggable={canEditGoogleEvent(e, googleCanWrite)}
                        onDragStart={(ev) => {
                          setDraggedGoogleEvent(e)
                          ev.dataTransfer.setData(GOOGLE_EVENT_DND_TYPE, e.id)
                          ev.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={() => {
                          setDraggedGoogleEvent(null)
                          setAllDayDragOver(null)
                        }}
                        onClick={() => openGoogleCard(e.id)}
                        className={`${planVisualState({ completed: false, startTime: null, endTime: null }, key) === 'upcoming' ? 'gc-plan' : 'gc-missed'} truncate rounded px-1.5 py-0.5
                          text-[10px] leading-tight transition-all hover:brightness-95
                          ${canEditGoogleEvent(e, googleCanWrite) ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                        style={colorVars(e.color ?? DEFAULT_GOOGLE_EVENT_HEX)}
                      >
                        {e.summary}
                      </div>
                    ))}
                    {dayAllDay.map((t) => (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(TASK_DND_TYPE, t.id)
                          e.dataTransfer.setData('text/plain', t.id)
                          e.dataTransfer.effectAllowed = 'copyMove'
                          beginCalendarItemNativeDrag()
                        }}
                        onDragEnd={() => setAllDayDragOver(null)}
                        onClick={() => openDetail(t.id)}
                        className={`${planVisualState(t, key) === 'upcoming' ? 'gc-plan' : 'gc-missed'} cursor-grab active:cursor-grabbing truncate rounded px-1.5 py-0.5
                          text-[10px] leading-tight transition-all hover:brightness-95`}
                        style={colorVars(planHex(t, listColorById))}
                      >
                        {t.completed ? '✓ ' : ''}{t.title}
                      </div>
                    ))}
                    {allDayAddDate === key && (
                      <CalendarInlineTaskAdd dateKey={key} onDone={() => setAllDayAddDate(null)} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
        {activeEdge && (
          <div
            className={`pointer-events-none absolute inset-y-0 z-30 flex w-10 items-center justify-center bg-accent-500/10
              ${activeEdge < 0 ? 'left-0' : 'right-0'}`}
            aria-hidden
          >
            <svg className="h-5 w-5 text-accent-600 dark:text-accent-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={activeEdge < 0 ? 'M15.75 19.5 8.25 12l7.5-7.5' : 'm8.25 4.5 7.5 7.5-7.5 7.5'} />
            </svg>
          </div>
        )}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden px-2"
          onDragOver={(e) => {
            if (taskDragActive) setEdgeDir(edgeDirAt(e.clientX, e.clientY))
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEdgeDir(null)
          }}
          onDropCapture={() => setEdgeDir(null)}
        >
          <div className="flex" style={{ height: GRID_TOTAL_HEIGHT }}>
            <TimeGutter dateKey={gridKey0} />

            <div
              ref={gridRef}
              className={`flex-1 grid relative ${gridColsClass}`}
              onPointerMove={handleGridPointerMove}
              onPointerUp={handleGridPointerUp}
              onPointerCancel={handleGridPointerCancel}
            >
              {gridDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayTimed = timedByDate.get(key) ?? []
                const dayLogs = timeLogsByDate.get(key) ?? []
                const dayTimedEvents = (eventsByDate.get(key) ?? []).filter(
                  (e) => !e.isAllDay && e.startTime && e.endTime,
                )
                const today = isAppToday(day)
                // 時間を決めた習慣は予定の列に出す（✓ で予定どおりの記録を作って達成）
                const dayHabitSlots = habits.flatMap((h) => {
                  const slot = habitToPlannedItem(h, key)
                  return slot ? [{ habit: h, slot, done: habitDayStatus(h, key, habitIndex) !== 'missed' }] : []
                })
                const limitMin = logLimitMin(key)
                /** 始まった（記録にできる）時間か */
                const hasStarted = (start: string) => limitMin === null || timeToMinutes(start) < limitMin
                // 時間が重なるところだけ 予定=左 / ログ=右 に分け、同じ種類の重なりは列（週表示はずらし重ね）にする
                const mode = gridDays.length > 1 ? 'cascade' : 'columns'
                const blockStyles = layoutPlanAndLog(
                  [
                    ...dayTimed.map((t) => ({ id: t.id, ...blockGeometry(t as TimeBlockTask, key, false) })),
                    ...dayHabitSlots.map(({ slot }) => ({
                      id: slot.id,
                      ...blockGeometry({ id: slot.id, title: slot.summary, startTime: slot.startTime, endTime: slot.endTime, completed: false }, key, false),
                    })),
                    ...dayTimedEvents.map((e) => ({
                      id: `event-${e.id}`,
                      ...blockGeometry({ id: e.id, title: e.summary, startTime: e.startTime!, endTime: e.endTime!, completed: false }, key, false),
                    })),
                  ],
                  dayLogs.map((t) => ({ id: t.id, ...blockGeometry(t as TimeBlockTask, key, true) })),
                  mode,
                  splitLanes,
                )
                const planStyle = (id: string) => blockStyles.get(`plan:${id}`)
                const logStyle = (id: string) => blockStyles.get(`log:${id}`)

                return (
                  <div
                    key={key}
                    data-datekey={key}
                    className={`relative border-l border-zinc-100 dark:border-zinc-800 cursor-crosshair
                      ${today && !singleDay ? TODAY_COLUMN : ''}
                      ${selectedDateKey === key && !singleDay ? SELECTED_COLUMN : ''}`}
                    style={{ height: GRID_TOTAL_HEIGHT }}
                    onPointerDown={(e) => {
                      onSelectDate?.(key)
                      const lane = laneAt(e.clientX, e.currentTarget)
                      const limit = lane === 'log' ? logLimitMin(key) : null
                      timelineDrag.handleCreatePointerDown(e, key, lane, limit === null ? undefined : (limit / 60) * HOUR_HEIGHT)
                    }}
                    onDragEnter={timelineDrop.handleDragEnter}
                    onDragOver={(e) => {
                      const lane = laneAt(e.clientX, e.currentTarget)
                      if (lane !== dropLane) setDropLane(lane)
                      const limit = lane === 'log' ? logLimitMin(key) : null
                      const blocked = limit !== null && timeToMinutes(yToTime(getRelativeY(e.clientY, key))) >= limit
                      if (blocked !== dropBlocked) setDropBlocked(blocked)
                      // 記録の列の「今より先」には落とせない（preventDefault しない＝ドロップ不可）
                      if (!blocked) timelineDrop.handleDragOver(e, key)
                    }}
                    onDragLeave={timelineDrop.handleDragLeave}
                    onDrop={(e) => {
                      dropLaneRef.current = laneAt(e.clientX, e.currentTarget)
                      timelineDrop.handleDropEvent(e, key)
                    }}
                  >
                    {splitLanes && (
                      <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-zinc-100 dark:border-zinc-800/60" />
                    )}
                    {/* 記録の列の「今より先」は使えないので薄く塗る */}
                    {splitLanes && logLimitMin(key) !== null && (
                      <div
                        className="absolute bottom-0 left-1/2 right-0 cursor-default bg-zinc-50 dark:bg-zinc-800/30"
                        style={{ top: ((logLimitMin(key) ?? 0) / 60) * HOUR_HEIGHT }}
                      />
                    )}
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-t border-zinc-100 dark:border-zinc-800/60"
                        style={{ top: h * HOUR_HEIGHT }}
                      />
                    ))}

                    {today && <NowIndicator />}

                    {dayTimed.map((t) => (
                      <div key={t.id} style={{ opacity: timelineDrag.movingTaskId === t.id ? 0.3 : 1 }}>
                        <TimeBlock
                          task={t as TimeBlockTask}
                          onPointerDown={(e) =>
                            timelineDrag.handleBlockPointerDown(e, t.id, key, t.startTime!, t.endTime!, gridRef.current, {
                              startTime: t.startTime!,
                              endTime: t.endTime!,
                              isTimeLog: false,
                            })
                          }
                          dayKey={key}
                          onOpenDetail={() => openCard(t.id)}
                          hStyle={planStyle(t.id)}
                          colorHex={planHex(t, listColorById)}
                        />
                      </div>
                    ))}
                    {dayLogs.map((t) => (
                      <div key={`${t.id}::${key}`} style={{ opacity: timelineDrag.movingTaskId === t.id ? 0.3 : 1 }}>
                        <TimeBlock
                          task={t as TimeBlockTask}
                          dayKey={key}
                          isLog
                          sleep={isSleepRecord(t)}
                          hStyle={logStyle(t.id)}
                          colorHex={recordHex(t, logCategoryColors)}
                          onPointerDown={(e) =>
                            timelineDrag.handleBlockPointerDown(e, t.id, key, t.startTime!, t.endTime!, gridRef.current, {
                                startTime: t.startTime!,
                                endTime: t.endTime!,
                                isTimeLog: true,
                                dueDate: t.dueDate,
                                endDate: t.endDate,
                              })
                          }
                          onOpenDetail={() => openCard(t.id)}
                        />
                      </div>
                    ))}
                    {dayHabitSlots.map(({ habit, slot, done }) => (
                      <div key={slot.id}>
                        <TimeBlock
                          task={{ id: slot.id, title: slot.summary, startTime: slot.startTime, endTime: slot.endTime, completed: done }}
                          dayKey={key}
                          hStyle={planStyle(slot.id)}
                          colorHex={habit.color}
                          onPointerDown={(evt) => {
                            evt.preventDefault()
                            evt.stopPropagation()
                          }}
                          onOpenDetail={() => {}}
                        />
                        {!done && hasStarted(slot.startTime) && (
                          <SlotCheck
                            top={blockGeometry({ id: slot.id, title: slot.summary, startTime: slot.startTime, endTime: slot.endTime, completed: false }, key, false).top}
                            hStyle={planStyle(slot.id)}
                            label={t('weekCalendar.habitDoneAsPlanned')}
                            onCheck={() => completeHabitAsPlanned(habit.id, key)}
                          />
                        )}
                      </div>
                    ))}
                    {dayTimedEvents.map((e) => {
                      // Google の予定も予定。記録にしたら完了（✓・グレー）、時間が過ぎたらグレー
                      const recorded = dayLogs.some((l) => l.title === e.summary)
                      const editable = canEditGoogleEvent(e, googleCanWrite)
                      return (
                      <div key={`event-${e.id}`} style={{ opacity: timelineDrag.movingTaskId === `event-${e.id}` ? 0.3 : 1 }}>
                      <TimeBlock
                        task={{
                          id: `event-${e.id}`,
                          title: e.summary,
                          startTime: e.startTime!,
                          endTime: e.endTime!,
                          completed: recorded,
                        }}
                        dayKey={key}
                        hStyle={planStyle(`event-${e.id}`)}
                        colorHex={e.color ?? DEFAULT_GOOGLE_EVENT_HEX}
                        onPointerDown={(evt) => {
                          if (!editable) {
                            evt.preventDefault()
                            evt.stopPropagation()
                            return
                          }
                          // 書き換えられる Google の予定は、アプリの予定と同じくドラッグで移動・長さ変更
                          googleDragRef.current = e
                          timelineDrag.handleBlockPointerDown(evt, `event-${e.id}`, key, e.startTime!, e.endTime!, gridRef.current)
                        }}
                        onTap={editable ? undefined : () => openGoogleCard(e.id)}
                        onOpenDetail={() => openGoogleCard(e.id)}
                      />
                      {hasStarted(e.startTime!) && !recorded && (
                        <SlotCheck
                          top={timeToY(e.startTime!)}
                          hStyle={planStyle(`event-${e.id}`)}
                          label={t('weekCalendar.eventToRecord')}
                          onCheck={() => {
                            // 今より先までの予定は、今までの分だけ記録にする
                            const end = limitMin !== null && timeToMinutes(e.endTime!) > limitMin
                              ? `${String(Math.floor(limitMin / 60)).padStart(2, '0')}:${String(limitMin % 60).padStart(2, '0')}`
                              : e.endTime!
                            addCompletedTaskWithTime(e.summary, key, e.startTime!, end, e.color ?? DEFAULT_GOOGLE_EVENT_HEX)
                          }}
                        />
                      )}
                      </div>
                      )
                    })}

                    {timelineDrag.dragPreview && timelineDrag.dragPreview.dateKey === key && !allDayMoveKey && !unscheduleHover && (
                      <div
                        className={`absolute ${laneClass(
                          timelineDrag.dragPreview.kind === 'create'
                            ? timelineDrag.activeCreateIntent
                            : dayLogs.some((x) => x.id === timelineDrag.dragPreview!.taskId) ? 'log' : 'schedule',
                        )} rounded-md pointer-events-none z-20
                          ${timelineDrag.dragPreview.kind === 'create'
                            ? 'bg-accent-500/20 border-2 border-accent-500/60'
                            : 'bg-accent-400/30 border-2 border-accent-500 shadow-lg'}`}
                        style={{ top: timelineDrag.dragPreview.top, height: timelineDrag.dragPreview.height }}
                      >
                        <span className="text-[10px] text-accent-700 dark:text-accent-300 px-1.5 font-medium">
                          {timelineDrag.dragPreview.label}
                        </span>
                      </div>
                    )}

                    {timelineDrop.dropPreview && timelineDrop.dropPreview.dateKey === key && !dropBlocked && (
                      <div
                        className={`absolute ${laneClass(dropLane)} rounded-md pointer-events-none z-20
                                   bg-accent-500/20 border-2 border-accent-500/60 border-dashed`}
                        style={{ top: timelineDrop.dropPreview.top, height: timelineDrop.dropPreview.height }}
                      >
                        <span className="text-[10px] text-accent-700 dark:text-accent-300 px-1.5 font-medium">
                          {timelineDrop.dropPreview.label}
                        </span>
                      </div>
                    )}

                    {timelineDrag.popup && timelineDrag.popup.dateKey === key && (
                      <CreateGhost popup={timelineDrag.popup} onAnchor={setCreateAnchorFromEl} laneClass={laneClass(timelineDrag.popup.intent)} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        </div>
      </div>

      {googleCard && <GoogleEventPopover eventId={googleCard.eventId} anchor={googleCard.anchor} onClose={closeGoogleCard} />}
      {eventCard && (
        <EventPopover taskId={eventCard.taskId} anchor={eventCard.anchor} onClose={closeCard} onOpenDetail={openDetailFromCard} />
      )}
      {timelineDrag.popup && createAnchor && (
        <QuickCreatePopover
          anchor={createAnchor}
          dateKey={timelineDrag.popup.dateKey}
          startTime={timelineDrag.popup.startTime}
          endTime={timelineDrag.popup.endTime}
          asLog={timelineDrag.popup.intent === 'log'}
          onClose={timelineDrag.dismissPopup}
          onCreated={(id, more) => {
            timelineDrag.dismissPopup()
            if (more) openDetail(id)
          }}
        />
      )}
      {detailTask && <TaskDetail task={detailTask} onClose={closeDetail} />}
    </div>
  )
}

function NowIndicator() {
  const now = useNowMinuteTick()

  const minutes = now.getHours() * 60 + now.getMinutes()
  const top = (minutes / 60) * HOUR_HEIGHT

  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="relative">
        <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
        <div className="h-px bg-red-500" />
      </div>
    </div>
  )
}
