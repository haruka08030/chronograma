import { useState, useMemo, useRef, useCallback } from 'react'
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
} from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import {
  HOUR_HEIGHT,
  timeToMinutes,
} from '../lib/timeGrid'
import {
  durationMinutesForTaskId,
  isOvernightTimeLog,
  patchAfterTimelineMove,
} from '../lib/taskTimeRange'
import { useTimelineDrag, type CreateIntent } from '../lib/useTimelineDrag'
import { useTimelineDrop, useTaskNativeDragActive } from '../lib/useTimelineDrop'
import {
  getCalendarItemDrag,
  isOverUnscheduleDrop,
  setCalendarItemDragActive,
  setUnscheduleHover,
  UNSCHEDULE_PATCH,
  useCalendarItemDrag,
} from '../lib/calendarItemDrag'
import { useGoogleCalendarEvents } from '../hooks/useGoogleCalendarEvents'
import { moveGoogleEvent } from '../lib/googleEventEdit'
import type { CalendarEvent } from '../types/calendarEvent'
import { useNowMinuteTick } from '../hooks/useNowMinuteTick'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { isLogTask, type Task } from '../types/task'
import { logLabelFromTask } from '../lib/logCategoryColors'
import { buildHabitRecordIndex } from '../lib/habitTiming'
import { EventPopover } from './timeline/EventPopover'
import { GoogleEventPopover } from './timeline/GoogleEventPopover'
import { QuickCreatePopover } from './timeline/QuickCreatePopover'
import { appTodayKey } from '../lib/timeZone'
import { TimeGutter } from './timeline/TimeGutter'
import { useTimeGutterWidth } from '../hooks/useTimeGutterWidth'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { toDateKey } from '../lib/dateKey'
import { shortDate } from '../lib/moveToast'
import { minutesToTime } from '../lib/clockTime'
import { openTaskDetail, openTaskMenu } from '../lib/overlays'
import { WeekDayHeader } from './calendar/WeekDayHeader'
import { WeekAllDayRow } from './calendar/WeekAllDayRow'
import { WeekDayColumn } from './calendar/WeekDayColumn'
import { useWeekBuckets } from '../hooks/useWeekBuckets'
import { useWeekScrollPosition } from '../hooks/useWeekScrollPosition'
import { useCalendarCards } from '../hooks/useCalendarCards'
import { useWeekEdgeFlip } from '../hooks/useWeekEdgeFlip'

const GRID_TOTAL_HEIGHT = HOUR_HEIGHT * 24

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
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  /** つかんでいる Google の予定（週をめくって一覧から消えても動かせるよう、つかんだ時点のものを持つ） */
  const googleDragRef = useRef<CalendarEvent | null>(null)
  const updateTask = useTaskStore((s) => s.updateTask)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const habitIndex = useMemo(() => buildHabitRecordIndex(tasks), [tasks])
  const asOneUndo = useTaskStore((s) => s.asOneUndo)
  // To‑Do の一覧と同じく、時間を決めた予定の ✓ は「完了＋記録」
  const dropLaneRef = useRef<CreateIntent>('schedule')
  const openDetail = openTaskDetail
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

  const days = useMemo(() => {
    const ws = startOfWeek(anchor, { weekStartsOn: 1 })
    const we = endOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: ws, end: we })
  }, [anchor])

  const focusKey = selectedDateKey ?? appTodayKey()
  const gridDays = useMemo(() => {
    if (isDesktop && !singleDay) return days
    const hit = days.find((d) => toDateKey(d) === focusKey)
    return [hit ?? days[0]!]
  }, [isDesktop, singleDay, days, focusKey])
  /** 時間バーの他のタイムゾーンの時刻は、表示している最初の日で計算する */
  const gridKey0 = toDateKey(gridDays[0]!)
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
  const todayKey = toDateKey(now)
  const logLimitMin = (key: string): number | null =>
    key < todayKey ? null : key > todayKey ? 0 : now.getHours() * 60 + now.getMinutes()
  const logLimitRef = useRef(logLimitMin)
  // eslint-disable-next-line react-hooks/refs -- ドラッグの終わりで今の制限を読むため、描画のたびに入れ替える
  logLimitRef.current = logLimitMin

  const { allDayByDate, timedByDate, timeLogsByDate, eventsByDate } = useWeekBuckets(tasks, lists, calendarEvents, days)

  const fetchRange = useMemo(() => {
    const ws = startOfWeek(anchor, { weekStartsOn: 1 })
    const we = endOfWeek(anchor, { weekStartsOn: 1 })
    we.setHours(23, 59, 59)
    return { ws, we }
  }, [anchor])
  useGoogleCalendarEvents(fetchRange.ws, fetchRange.we)

  useWeekScrollPosition({ scrollRef, keepScrollOnFlipRef, anchor, days, singleDay })

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

  const {
    eventCard, setEventCard, openCard, closeCard, openDetailFromCard,
    googleCard, setGoogleCard, openGoogleCard, closeGoogleCard,
    createAnchor, setCreateAnchorFromEl,
  } = useCalendarCards(gridRef)

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
      if (isLogTask(prev)) {
        // 記録を今より先へは動かせない（元の位置に戻る）
        const limit = logLimitRef.current(dateKey)
        const crossesDay = isOvernightTimeLog({ ...prev, ...patch } as Task)
        if (limit !== null && (crossesDay || timeToMinutes(endTime) > limit)) return
      }
      updateTask(taskId, patch, {
        key: 'undo.blockMoved',
        params: { title: prev.title, date: shortDate(dateKey), time: `${startTime}–${endTime}` },
      })
    },
    onResizeDone: (taskId, startTime, endTime) => {
      if (taskId.startsWith('event-')) {
        const ev = googleDragRef.current
        if (ev) void moveGoogleEvent(ev, { date: ev.date, startTime, endTime })
        return
      }
      const prev = useTaskStore.getState().tasks.find((x) => x.id === taskId)
      if (prev && isLogTask(prev) && prev.dueDate && !prev.endDate) {
        const limit = logLimitRef.current(prev.dueDate)
        if (limit !== null && timeToMinutes(endTime) > limit) {
          if (timeToMinutes(startTime) >= limit) return
          endTime = minutesToTime(limit)
        }
      }
      if (!prev) return
      updateTask(taskId, { startTime, endTime }, { key: 'undo.blockResized', params: { title: prev.title, time: `${startTime}–${endTime}` } })
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
  const { activeEdge, setEdgeDir, edgeDirAt } = useWeekEdgeFlip({
    onNavigateWeek,
    gridDays,
    gridRef,
    scrollRef,
    keepScrollOnFlipRef,
    timelineDrag,
    taskDragActive,
  })

  const endMoveExtras = () => {
    setAllDayMoveKey(null)
    setEdgeDir(null)
    setCalendarItemDragActive(false)
  }
  const handleGridPointerMove = (e: React.PointerEvent) => {
    timelineDrag.handlePointerMove(e)
    const d = timelineDrag.drag
    if (!d || d.kind !== 'move' || !timelineDrag.didMove.current) return
    setEdgeDir(edgeDirAt(e.clientX, e.clientY))
    // 記録は「やったこと」なので終日・ToDo には戻さない
    const task = tasks.find((x) => x.id === d.taskId)
    if (!task || isLogTask(task)) return
    // 今あるブロックを動かすときは「計測開始」「To-Do に戻す」の帯を出さない（格子に重なり、動かしすぎると誤って効く）。
    // 開いている To-Do の置き場に落とせば To-Do に戻る（置き場は前から出ているので画面は動かない）。計測はカード・メニューから
    setCalendarItemDragActive(true, { fromGrid: true })
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
    if (d?.kind === 'move' && timelineDrag.didMove.current && (allDayMoveKey || toUnschedule)) {
      const task = useTaskStore.getState().tasks.find((x) => x.id === d.taskId)
      if (task && !isLogTask(task)) {
        updateTask(d.taskId, allDayMoveKey
          ? { scheduledDate: allDayMoveKey, startTime: null, endTime: null }
          : UNSCHEDULE_PATCH, allDayMoveKey
          ? { key: 'undo.blockToAllDay', params: { title: task.title, date: shortDate(allDayMoveKey) } }
          : { key: 'undo.blockUnscheduled', params: { title: task.title } })
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
            endTime = minutesToTime(limit)
          }
        }
        asOneUndo(() => {
          const { timeLogTagPresets, logCategoryColors } = useTaskStore.getState()
          const label = logLabelFromTask(task, timeLogTagPresets, logCategoryColors)
          addTimeLog(task.title, dateKey, startTime, endTime, label.tags, undefined, null, label.color)
          if (!task.completed) toggleTask(taskId)
        })
        return
      }
      updateTask(taskId, { scheduledDate: dateKey, startTime, endTime, kind: 'todo' })
    },
  })

  const hasAnyAllDay = useMemo(() => {
    return gridDays.some((d) => {
      const key = toDateKey(d)
      // 1 日表示では終日タスクは左のリストに出るので、外部の終日予定だけを数える
      const taskCount = singleDay ? 0 : (allDayByDate.get(key)?.length ?? 0)
      const eventCount = (eventsByDate.get(key) ?? []).filter((e) => e.isAllDay).length
      return taskCount + eventCount > 0
    })
  }, [gridDays, singleDay, allDayByDate, eventsByDate])

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-row"
      // 予定・記録・Google の予定を右クリック: カードを開かずに操作するメニュー（Google カレンダーと同じ）
      onContextMenu={(e) => {
        const id = (e.target as Element).closest?.('[data-block-id]')?.getAttribute('data-block-id')
        if (!id) return
        // 習慣の枠なども同じ属性を持つ。メニューを出せるもの（タスク・Google の予定）のときだけブラウザのメニューを止める
        const { tasks, calendarEvents } = useTaskStore.getState()
        const known = id.startsWith('event-')
          ? calendarEvents.some((ev) => ev.id === id.slice('event-'.length))
          : tasks.some((x) => x.id === id)
        if (!known) return
        e.preventDefault()
        setEventCard(null)
        setGoogleCard(null)
        openTaskMenu(id.startsWith('event-') ? { kind: 'google', x: e.clientX, y: e.clientY, eventId: id.slice('event-'.length) } : { kind: 'event', x: e.clientX, y: e.clientY, taskId: id })
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <WeekDayHeader
          singleDay={singleDay}
          days={days}
          gridDays={gridDays}
          gridKey0={gridKey0}
          gutterWidth={gutterWidth}
          selectedDateKey={selectedDateKey}
          onSelectDate={onSelectDate}
          setAllDayAddDate={setAllDayAddDate}
        />

        {(hasAnyAllDay || allDayAddDate || allDayMoveKey || (taskDragActive && !singleDay)) && (
          <WeekAllDayRow
            gridDays={gridDays}
            singleDay={singleDay}
            gutterWidth={gutterWidth}
            gridColsClass={gridColsClass}
            allDayByDate={allDayByDate}
            eventsByDate={eventsByDate}
            allDayDragOver={allDayDragOver}
            setAllDayDragOver={setAllDayDragOver}
            allDayMoveKey={allDayMoveKey}
            allDayAddDate={allDayAddDate}
            setAllDayAddDate={setAllDayAddDate}
            openGoogleCard={openGoogleCard}
          />
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
        {activeEdge && (
          <div
            className={`pointer-events-none absolute inset-y-0 z-30 flex w-10 items-center justify-center bg-accent-500/10
              ${activeEdge < 0 ? 'left-0' : 'right-0'}`}
            aria-hidden
          >
            {activeEdge < 0 ? <ChevronLeftIcon className="h-5 w-5 text-accent-600 dark:text-accent-300" /> : <ChevronRightIcon className="h-5 w-5 text-accent-600 dark:text-accent-300" />}
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
              {gridDays.map((day) => (
                <WeekDayColumn
                  key={toDateKey(day)}
                  day={day}
                  gridDays={gridDays}
                  singleDay={singleDay}
                  selectedDateKey={selectedDateKey}
                  onSelectDate={onSelectDate}
                  timedByDate={timedByDate}
                  timeLogsByDate={timeLogsByDate}
                  eventsByDate={eventsByDate}
                  habitIndex={habitIndex}
                  splitLanes={splitLanes}
                  laneAt={laneAt}
                  laneClass={laneClass}
                  logLimitMin={logLimitMin}
                  getRelativeY={getRelativeY}
                  gridRef={gridRef}
                  timelineDrag={timelineDrag}
                  timelineDrop={timelineDrop}
                  dropLane={dropLane}
                  setDropLane={setDropLane}
                  dropBlocked={dropBlocked}
                  setDropBlocked={setDropBlocked}
                  dropLaneRef={dropLaneRef}
                  googleDragRef={googleDragRef}
                  allDayMoveKey={allDayMoveKey}
                  unscheduleHover={unscheduleHover}
                  openCard={openCard}
                  openGoogleCard={openGoogleCard}
                  setCreateAnchorFromEl={setCreateAnchorFromEl}
                />
              ))}
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
    </div>
  )
}
