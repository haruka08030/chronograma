import { memo, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore, selectLiveHabits } from '../../store/taskStore'
import { formatDuration, HOUR_HEIGHT, HOURS, timeToMinutes, yToTime } from '../../lib/timeGrid'
import type { CreateIntent, CreatePopup, CreateStop, DragPreview, useTimelineDrag } from '../../lib/useTimelineDrag'
import type { DropPreview, useTimelineDrop } from '../../lib/useTimelineDrop'
import { canSetMyEventTime } from '../../lib/googleEventEdit'
import type { CalendarEvent } from '../../types/calendarEvent'
import { isEventTask, isSleepTask, type Task } from '../../types/task'
import { layoutPlanAndLog } from '../../lib/overlapLayout'
import { recordHex } from '../../lib/logCategoryColors'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { planHex } from '../../lib/planVisual'
import { habitSlotsOnDay } from '../../lib/habitSlots'
import { habitDayStatus, type HabitRecordIndex } from '../../lib/habitTiming'
import { fromAppWall, isAppToday, isNowOnDay } from '../../lib/timeZone'
import { SELECTED_COLUMN, TODAY_COLUMN } from '../../lib/dayMarker'
import { toDateKey } from '../../lib/dateKey'
import { formatDate } from '../../lib/dateFormat'
import { minutesToTime } from '../../lib/clockTime'
import { blockGeometry, type TimeBlockTask } from './timeBlockGeometry'
import { CreateGhost, NowIndicator, SlotCheck, TimeBlock } from './TimeBlock'
import { OnboardingPlaceSlot } from './OnboardingPlaceSlot'
import { logSegmentClockOnDay } from '../../lib/taskTimeRange'
import { RUNNING_LOG_ID, runningLogTimes } from '../../lib/timerRecord'
import { makeTask } from '../../store/taskHelpers'
import { useNowWhile } from '../../hooks/useAppClock'
import { googleEventCrossesDay, googleEventSegmentOnDay } from '../../lib/googleEventSpan'
import { eventSpansOnDay, unrecordedGapsForDay } from '../../lib/unrecordedGaps'
import { useAbsentOn } from '../../hooks/useAbsentOn'
import { matchPlanAndActualForDate } from '../../lib/matchEvents'
import type { PlannedItem } from '../../types/plannedItem'
import { tip } from '../../lib/tooltip'

type TimelineDrag = ReturnType<typeof useTimelineDrag>
type TimelineDrop = ReturnType<typeof useTimelineDrop>

/**
 * 週タイムラインの 1 日の列（予定・記録・習慣・Google の予定のブロックと、ドラッグ・作成中の枠）。
 * `memo` で、渡すのはその日の行・その日のドラッグの枠だけ（ドラッグ中は枠のある日の列だけ描き直す、#265）
 */
export const WeekDayColumn = memo(function WeekDayColumn({
  day,
  gridDays,
  singleDay,
  selectedDateKey,
  onSelectDate,
  dayTimed,
  dayLogs,
  dayMoved,
  timedEvents,
  habitIndex,
  splitLanes,
  laneAt,
  laneClass,
  logLimitMin,
  getRelativeY,
  gridRef,
  dragPreview,
  activeCreateIntent,
  movingTaskId,
  popup,
  popupOpen,
  handleCreatePointerDown,
  handleBlockPointerDown,
  openPopup,
  dropPreview,
  handleDragEnter,
  handleDragOver,
  handleDragLeave,
  handleDropEvent,
  dropLane,
  setDropLane,
  dropBlocked,
  setDropBlocked,
  dropLaneRef,
  googleDragRef,
  allDayMoveKey,
  unscheduleHover,
  openCard,
  openGoogleCard,
  openHabitCard,
  setCreateAnchorFromEl,
}: {
  day: Date
  gridDays: Date[]
  singleDay: boolean
  selectedDateKey?: string
  onSelectDate?: (dateKey: string) => void
  /** この日の時刻つきの予定・To-Do */
  dayTimed: Task[]
  /** この日にかかる記録 */
  dayLogs: Task[]
  /** 過ぎたこの日から別の日へ移した時刻つきの予定（`movedPlans`） */
  dayMoved: Task[]
  /** この日にかかる時刻つきの Google の予定（日をまたぐものは重なる日すべて） */
  timedEvents: CalendarEvent[]
  habitIndex: HabitRecordIndex
  splitLanes: boolean
  laneAt: (clientX: number, el: HTMLElement) => CreateIntent
  laneClass: (lane: CreateIntent | null | undefined) => string
  logLimitMin: (key: string) => number | null
  getRelativeY: (clientY: number, dateKey: string) => number
  gridRef: RefObject<HTMLDivElement | null>
  /** この日の列に出すドラッグの枠（ほかの日なら null） */
  dragPreview: DragPreview | null
  activeCreateIntent: CreateIntent | null
  movingTaskId: string | null
  /** この日の作成カードの仮の枠（ほかの日なら null） */
  popup: CreatePopup | null
  /** どこかの日で作成カードを開いている */
  popupOpen: boolean
  handleCreatePointerDown: TimelineDrag['handleCreatePointerDown']
  handleBlockPointerDown: TimelineDrag['handleBlockPointerDown']
  openPopup: TimelineDrag['openPopup']
  /** この日の列に出す To-Do を落とす枠（ほかの日なら null） */
  dropPreview: DropPreview | null
  handleDragEnter: TimelineDrop['handleDragEnter']
  handleDragOver: TimelineDrop['handleDragOver']
  handleDragLeave: TimelineDrop['handleDragLeave']
  handleDropEvent: TimelineDrop['handleDropEvent']
  dropLane: CreateIntent
  setDropLane: Dispatch<SetStateAction<CreateIntent>>
  dropBlocked: boolean
  setDropBlocked: Dispatch<SetStateAction<boolean>>
  dropLaneRef: MutableRefObject<CreateIntent>
  googleDragRef: MutableRefObject<CalendarEvent | null>
  allDayMoveKey: string | null
  unscheduleHover: boolean
  openCard: (taskId: string, el?: Element | null) => void
  openGoogleCard: (eventId: string, el?: Element | null) => void
  /** 習慣の枠のカード */
  openHabitCard: (slotId: string, el?: Element | null) => void
  setCreateAnchorFromEl: (el: HTMLDivElement | null) => void
}) {
  const { t } = useTranslation()
  /** 予定を `t` で回す箇所でも使えるように */
  const tr = t
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const habits = useTaskStore(selectLiveHabits)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const addCompletedTaskWithTime = useTaskStore((s) => s.addCompletedTaskWithTime)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const absentOn = useAbsentOn()
  const key = toDateKey(day)
  // 記録中は、記録の列に始めた時刻から今まで伸びる枠（止めたら入る記録と同じ形。分の境目で描き直す）
  const wallNow = useNowWhile(activeTimer !== null && splitLanes)
  const runningLog = (() => {
    if (!splitLanes || !activeTimer) return null
    const times = runningLogTimes(activeTimer.startedAt, fromAppWall(wallNow).getTime())
    if (!times) return null
    const log = {
      ...makeTask({ title: activeTimer.taskTitle, listId: '', kind: 'log', completed: true, tags: activeTimer.tags, ...times }, 0),
      id: RUNNING_LOG_ID,
      category: activeTimer.tags[0] ?? null,
      color: activeTimer.color ?? null,
    }
    return logSegmentClockOnDay(log, key) ? log : null
  })()
  // 日をまたぐ予定は、この日にかかる区間だけ描く（始まった日は 24:00 まで、次の日は 0:00 から）
  const dayTimedEvents = timedEvents.map((e) => ({
    e,
    seg: googleEventSegmentOnDay(e, key) ?? { startTime: e.startTime!, endTime: e.endTime! },
  }))
  const today = isAppToday(day)
  // 始まりと終わりを決めた習慣は予定の列に出す（✓ で予定どおりの記録を作って達成）。時刻ひとつの習慣は習慣の段（`WeekHabitRow`）
  // 日をまたぐ習慣（睡眠など）は、この日にかかる区間だけ描く（前の日に始まった枠も 0:00 から）
  const dayHabitSlots = habitSlotsOnDay(habits, key, habitIndex).map((s) => ({
    ...s,
    done: habitDayStatus(s.habit, s.slotDate, habitIndex) !== 'missed',
  }))
  // 移した予定は元の時間に点線の枠で残す（過ぎた日だけ。振り返りで「予定どおりだったか」を見る、#158）
  const dayMovedPlans = dayMoved.flatMap((t) => {
    const plan = t.movedPlans?.find((p) => p.date === key && p.startTime && p.endTime)
    return plan ? [{ task: t, startTime: plan.startTime!, endTime: plan.endTime!, to: plan.to, id: `moved-${t.id}` }] : []
  })
  const limitMin = logLimitMin(key)
  /** 始まった（記録にできる）時間か */
  const hasStarted = (start: string) => limitMin === null || timeToMinutes(start) < limitMin
  // 過ぎた時間の「記録の無い時間」（起きてから寝るまで・今日は今まで、30 分以上）。記録の列に点線の枠で出し、押すとその時間で記録を作る
  // 過ぎた予定（授業・バイト）は出たものとして抜けを埋める（欠席にした回は埋めない。見出し・ふりかえりの「記録なし」と同じ）
  const gaps = splitLanes ? unrecordedGapsForDay(dayLogs, key, limitMin, activeTimer, eventSpansOnDay(dayTimed, key, absentOn)) : []
  const gapId = (g: { start: number }) => `gap-${g.start}`
  // 時間が重なるところだけ 予定=左 / ログ=右 に分け、同じ種類の重なりは列（週表示はずらし重ね）にする
  const mode = gridDays.length > 1 ? 'cascade' : 'columns'
  // 予定 / 記録 の 2 列に固定（週表示も。予定だけ・記録だけの時間帯も点線をまたいで広げない、#403）
  const fixedLanes = splitLanes
  // カレンダー（今日の計画の 1 日表示ではない）は、記録を置けない未来の時間を予定に全幅で使う（#409）
  const fullFromMin = splitLanes && !singleDay ? limitMin : null
  const fullFromTop = fullFromMin === null ? undefined : (fullFromMin / 60) * HOUR_HEIGHT
  /** この時刻（分）は予定に全幅を使う未来か */
  const isFullAt = (min: number) => fullFromMin !== null && min >= fullFromMin
  // カレンダーでは予定どおりの記録（ずれ 10 分以内）があれば予定は出さず、記録を全幅で出す（#409）
  const matchedPlanIds = new Set<string>()
  const fullLogIds = new Set<string>()
  if (splitLanes && !singleDay) {
    const planned: PlannedItem[] = [
      ...dayTimed.map((t) => ({
        id: t.id,
        summary: t.title,
        startTime: t.startTime!,
        endTime: t.endTime!,
        source: isEventTask(t) ? ('scheduled-event' as const) : ('scheduled-task' as const),
        taskId: t.id,
      })),
      ...dayHabitSlots.map(({ slot, seg }) => ({ ...slot, ...seg })),
      ...dayTimedEvents.map(({ e, seg }) => ({ id: `event-${e.id}`, summary: e.summary, ...seg, source: 'google' as const })),
    ]
    for (const pair of matchPlanAndActualForDate(
      planned,
      dayLogs.filter((l) => !isSleepTask(l)),
    )) {
      if (pair.status !== 'matched') continue
      matchedPlanIds.add(pair.planned!.id)
      fullLogIds.add(pair.actual!.id)
    }
  }
  const shownTimed = dayTimed.filter((t) => !matchedPlanIds.has(t.id))
  const shownHabitSlots = dayHabitSlots.filter(({ slot }) => !matchedPlanIds.has(slot.id))
  const shownTimedEvents = dayTimedEvents.filter(({ e }) => !matchedPlanIds.has(`event-${e.id}`))
  /** 作る・動かす・落とす枠の横位置。未来の予定は全幅 */
  const previewClass = (lane: CreateIntent | null | undefined, top: number) =>
    lane !== 'log' && fullFromTop !== undefined && top >= fullFromTop ? 'left-0.5 right-0.5' : laneClass(lane)
  /** 押した・落とした列。未来は記録の列が無いので予定 */
  const laneAtPoint = (clientX: number, clientY: number, el: HTMLElement): CreateIntent => {
    const lane = laneAt(clientX, el)
    return lane === 'log' && isFullAt(timeToMinutes(yToTime(getRelativeY(clientY, key)))) ? 'schedule' : lane
  }
  const planBlocks = [
    ...shownTimed.map((t) => ({ id: t.id, ...blockGeometry(t as TimeBlockTask, key, false) })),
    ...shownHabitSlots.map(({ slot, seg }) => ({
      id: slot.id,
      ...blockGeometry({ id: slot.id, title: slot.summary, startTime: seg.startTime, endTime: seg.endTime, completed: false }, key, false),
    })),
    ...dayMovedPlans.map((m) => ({
      id: m.id,
      ...blockGeometry({ id: m.id, title: m.task.title, startTime: m.startTime, endTime: m.endTime, completed: false }, key, false),
    })),
    ...shownTimedEvents.map(({ e, seg }) => ({
      id: `event-${e.id}`,
      ...blockGeometry({ id: e.id, title: e.summary, startTime: seg.startTime, endTime: seg.endTime, completed: false }, key, false),
    })),
  ]
  const logBlocks = [
    ...dayLogs.map((t) => ({ id: t.id, ...blockGeometry(t as TimeBlockTask, key, true) })),
    ...(runningLog ? [{ id: RUNNING_LOG_ID, ...blockGeometry(runningLog as TimeBlockTask, key, true) }] : []),
  ]
  const blockStyles = layoutPlanAndLog(
    planBlocks,
    [
      ...logBlocks,
      // 記録の無い時間も記録の列のもの（週表示でも予定と左右に分け、枠が予定の下に隠れないように）
      ...gaps.map((g) => {
        const top = (g.start / 60) * HOUR_HEIGHT
        const height = ((g.end - g.start) / 60) * HOUR_HEIGHT
        return { id: gapId(g), top, height, span: height }
      }),
    ],
    mode,
    fixedLanes,
    { fromTop: fullFromTop, logIds: fullLogIds },
  )
  /**
   * ドラッグで作る枠を止める、押した列のブロックの上下（予定の列は予定・習慣・Google の予定と全幅の記録、記録の列は記録）。
   * 移した予定の跡と記録の無い時間の枠は止めない
   */
  const createStops = (lane: CreateIntent): CreateStop[] =>
    (lane === 'log'
      ? logBlocks
      : [...planBlocks.filter((b) => !b.id.startsWith('moved-')), ...logBlocks.filter((b) => fullLogIds.has(b.id))]
    ).map((b) => ({ top: b.top, bottom: b.top + b.span }))
  const planStyle = (id: string) => blockStyles.get(`plan:${id}`)
  const logStyle = (id: string) => blockStyles.get(`log:${id}`)

  return (
    <div
      key={key}
      data-datekey={key}
      className={`relative border-l border-zinc-200 dark:border-zinc-700 cursor-crosshair
        ${today && !singleDay ? TODAY_COLUMN : ''}
        ${selectedDateKey === key && !singleDay ? SELECTED_COLUMN : ''}`}
      style={{ height: 24 * HOUR_HEIGHT }}
      onPointerDown={(e) => {
        // 右クリックで予定を作り始めない
        if (e.button !== 0) return
        onSelectDate?.(key)
        const lane = laneAtPoint(e.clientX, e.clientY, e.currentTarget)
        const limit = lane === 'log' ? logLimitMin(key) : null
        handleCreatePointerDown(e, key, lane, limit === null ? undefined : (limit / 60) * HOUR_HEIGHT, createStops(lane))
      }}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => {
        const lane = laneAtPoint(e.clientX, e.clientY, e.currentTarget)
        if (lane !== dropLane) setDropLane(lane)
        const limit = lane === 'log' ? logLimitMin(key) : null
        const blocked = limit !== null && timeToMinutes(yToTime(getRelativeY(e.clientY, key))) >= limit
        if (blocked !== dropBlocked) setDropBlocked(blocked)
        // 記録の列の「今より先」には落とせない（preventDefault しない＝ドロップ不可）
        if (!blocked) handleDragOver(e, key)
      }}
      onDragLeave={handleDragLeave}
      onDrop={(e) => {
        dropLaneRef.current = laneAtPoint(e.clientX, e.clientY, e.currentTarget)
        handleDropEvent(e, key)
      }}
    >
      {/* 予定｜記録の境目は点線にして、日の境目（実線）と見分ける。終わった日も 2 列だと分かる */}
      {/* カレンダーの未来は予定が全幅なので、境目は今までだけ */}
      {splitLanes && fullFromTop !== 0 && (
        <div
          className="pointer-events-none absolute top-0 left-1/2 border-l border-dashed border-zinc-200 dark:border-zinc-700"
          style={{ height: fullFromTop ?? '100%' }}
        />
      )}
      {/* 記録の列の「今より先」は使えないので薄く塗る（今日の計画。カレンダーは未来を予定に使う） */}
      {splitLanes && fullFromTop === undefined && logLimitMin(key) !== null && (
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

      {isNowOnDay(day) && <NowIndicator />}

      {gaps.map((g) => {
        const startTime = minutesToTime(g.start)
        const endTime = minutesToTime(g.end)
        return (
          <button
            key={gapId(g)}
            type="button"
            data-unrecorded-gap
            className="group absolute flex items-start justify-center overflow-hidden rounded-[5px] border border-dashed
              border-zinc-300 pt-0.5 text-[10px] leading-tight text-zinc-400 transition-colors
              hover:border-accent-400 hover:bg-accent-500/5 hover:text-accent-600
              focus-visible:border-accent-500 focus-visible:outline-none
              dark:border-zinc-600 dark:text-zinc-500 dark:hover:border-accent-400 dark:hover:text-accent-300"
            // 記録の無い時間は記録の列（右半分）に収める
            style={{
              left: 'calc(50% + 2px)',
              width: 'calc(50% - 4px)',
              top: (g.start / 60) * HOUR_HEIGHT + 1,
              height: ((g.end - g.start) / 60) * HOUR_HEIGHT - 2,
            }}
            {...tip(t('weekCalendar.unrecordedGapAria', { start: startTime, end: endTime }), { name: true })}
            // 列の「押して作る」を始めない（押すと枠の時間そのままで後から記録のカードを出す）
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (popupOpen) return
              onSelectDate?.(key)
              openPopup({ dateKey: key, startTime, endTime, intent: 'log' })
            }}
          >
            <span className="truncate px-1 tabular-nums">
              <span aria-hidden>+</span>
              {/* 週表示は列が狭いので「+」だけ（長さは押す前にヒントで分かる） */}
              {mode === 'columns' && <span> {t('weekCalendar.unrecordedGap', { time: formatDuration(g.end - g.start) })}</span>}
            </span>
          </button>
        )
      })}

      {/* はじめの案内の間、今日の計画のタイムラインに「ここに置く」（ドラッグ・作成中は出さない） */}
      {singleDay && !dragPreview && !dropPreview && !popup && <OnboardingPlaceSlot dateKey={key} splitLanes={splitLanes} />}

      {dayMovedPlans.map((m) => {
        const geo = blockGeometry(
          { id: m.id, title: m.task.title, startTime: m.startTime, endTime: m.endTime, completed: false },
          key,
          false,
        )
        const to = formatDate(m.to, 'shortDate')
        return (
          <button
            key={m.id}
            type="button"
            data-moved-plan
            className="absolute flex items-start gap-1 overflow-hidden rounded-[5px] border border-dashed border-zinc-300 px-1 pt-0.5
              text-left text-[10px] leading-tight text-zinc-400 hover:border-zinc-400 focus-visible:border-accent-500
              focus-visible:outline-none dark:border-zinc-600 dark:text-zinc-500 dark:hover:border-zinc-500"
            style={{ left: 2, right: 2, ...planStyle(m.id), top: geo.top + 1, height: Math.max(geo.height - 2, 14) }}
            {...tip(t('weekCalendar.movedPlanAria', { title: m.task.title, start: m.startTime, end: m.endTime, date: to }), { name: true })}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => openCard(m.task.id, e.currentTarget)}
          >
            <span className="min-w-0 truncate">{m.task.title}</span>
            <span className="shrink-0 tabular-nums">→{to}</span>
          </button>
        )
      })}

      {shownTimed.map((t) => (
        <div className="group/slot" key={t.id} style={{ opacity: movingTaskId === t.id ? 0.3 : 1 }}>
          <TimeBlock
            task={t as TimeBlockTask}
            onPointerDown={(e) =>
              handleBlockPointerDown(e, t.id, key, t.startTime!, t.endTime!, gridRef.current, {
                startTime: t.startTime!,
                endTime: t.endTime!,
                kind: 'todo',
              })
            }
            dayKey={key}
            onOpenDetail={() => openCard(t.id)}
            hStyle={planStyle(t.id)}
            colorHex={planHex(t)}
            withCheck={!isEventTask(t)}
          />
          {/* 予定（バイト・授業）には完了の ✓ を出さない。時間が過ぎたらグレー（Google の予定と同じ） */}
          {!isEventTask(t) && (
            <SlotCheck
              {...blockGeometry(t as TimeBlockTask, key, false)}
              hStyle={planStyle(t.id)}
              done={t.completed}
              label={t.completed ? tr('taskItem.markIncomplete') : tr('taskItem.markComplete')}
              onCheck={() => toggleTask(t.id)}
            />
          )}
        </div>
      ))}
      {dayLogs.map((t) => (
        <div key={`${t.id}::${key}`} style={{ opacity: movingTaskId === t.id ? 0.3 : 1 }}>
          <TimeBlock
            task={t as TimeBlockTask}
            dayKey={key}
            isLog
            sleep={isSleepTask(t)}
            hStyle={logStyle(t.id)}
            colorHex={recordHex(t, logCategoryColors)}
            onPointerDown={(e) => {
              // 日をまたぐ記録は、この列に描いている区間を端の元の値にする（記録全体の時刻だと 1 日ぶん長くなる）
              const seg = logSegmentClockOnDay(t, key) ?? { startTime: t.startTime!, endTime: t.endTime! }
              handleBlockPointerDown(e, t.id, key, seg.startTime, seg.endTime, gridRef.current, {
                startTime: t.startTime!,
                endTime: t.endTime!,
                kind: 'log',
                dueDate: t.dueDate,
                endDate: t.endDate,
              })
            }}
            onOpenDetail={() => openCard(t.id)}
          />
        </div>
      ))}
      {runningLog && (
        // 動かせない・開かない（タイマーは下の浮いている欄で直す・止める）
        <div data-running-log className="pointer-events-none">
          <TimeBlock
            task={runningLog as TimeBlockTask}
            dayKey={key}
            isLog
            running
            hStyle={logStyle(RUNNING_LOG_ID)}
            colorHex={recordHex(runningLog, logCategoryColors)}
            onPointerDown={() => {}}
            onOpenDetail={() => {}}
          />
        </div>
      )}
      {shownHabitSlots.map(({ habit, slot, slotDate, seg, crossesDay, done }) => {
        // 日をまたぐ枠は列ごとに区間しか描いていないので、済んだ枠と同じくドラッグでは動かさない（押すとカード）
        const fixed = done || crossesDay
        return (
          <div className="group/slot" key={slot.id} style={{ opacity: movingTaskId === slot.id ? 0.3 : 1 }}>
            <TimeBlock
              task={{ id: slot.id, title: slot.summary, startTime: slot.startTime, endTime: slot.endTime, completed: done, segment: seg }}
              dayKey={key}
              hStyle={planStyle(slot.id)}
              colorHex={habit.color}
              onPointerDown={(evt) => {
                // まだの枠は動かす・伸ばすと、その日だけの時間になる（済んだ枠は記録のほうを動かす）
                if (fixed) {
                  evt.preventDefault()
                  evt.stopPropagation()
                  return
                }
                handleBlockPointerDown(evt, slot.id, key, slot.startTime, slot.endTime, gridRef.current)
              }}
              // 動かせない枠は押すとそのままカード（まだの枠はドラッグの仕組みが押したと判断して開く）
              onTap={fixed ? () => openHabitCard(slot.id) : undefined}
              onOpenDetail={() => openHabitCard(slot.id)}
              withCheck={done || hasStarted(seg.startTime)}
            />
            {(done || hasStarted(seg.startTime)) && (
              // 習慣画面・今日画面と同じく、もう一度押すと外す（その日の記録も外れる）
              <SlotCheck
                {...blockGeometry(
                  { id: slot.id, title: slot.summary, startTime: seg.startTime, endTime: seg.endTime, completed: false },
                  key,
                  false,
                )}
                hStyle={planStyle(slot.id)}
                done={done}
                label={done ? t('weekCalendar.habitUndo') : t('weekCalendar.habitDoneAsPlanned')}
                onCheck={() => toggleHabitDate(habit.id, slotDate)}
              />
            )}
          </div>
        )
      })}
      {shownTimedEvents.map(({ e, seg }) => {
        // Google の予定も予定。記録にしたら完了（✓・グレー）、時間が過ぎたらグレー。やらなかった予定（#528）は薄く・取り消し線で、✓ は出さない
        const recorded = dayLogs.some((l) => l.title === e.summary)
        const canCheck = hasStarted(seg.startTime) && !recorded && !e.skipped
        // ドラッグで動かした時間は自分の時間になる（Google の予定は変えない、#625）。
        // 日をまたぐ予定は列ごとに区間しか描いていないので、ドラッグでは動かさない（押すとカードで直せる）
        const editable = canSetMyEventTime(e) && !googleEventCrossesDay(e)
        return (
          <div className="group/slot" key={`event-${e.id}`} style={{ opacity: movingTaskId === `event-${e.id}` ? 0.3 : 1 }}>
            <TimeBlock
              task={{
                id: `event-${e.id}`,
                title: e.summary,
                startTime: e.startTime!,
                endTime: e.endTime!,
                completed: recorded,
                segment: seg,
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
                // Google の予定も、アプリの予定と同じくドラッグで移動・長さ変更（自分の時間になる）
                googleDragRef.current = e
                handleBlockPointerDown(evt, `event-${e.id}`, key, e.startTime!, e.endTime!, gridRef.current)
              }}
              onTap={editable ? undefined : () => openGoogleCard(e.id)}
              onOpenDetail={() => openGoogleCard(e.id)}
              withCheck={canCheck}
              skipped={e.skipped}
            />
            {canCheck && (
              <SlotCheck
                {...blockGeometry(
                  { id: e.id, title: e.summary, startTime: seg.startTime, endTime: seg.endTime, completed: false },
                  key,
                  false,
                )}
                hStyle={planStyle(`event-${e.id}`)}
                label={t('weekCalendar.eventToRecord')}
                onCheck={() => {
                  // 今より先までの予定は、今までの分だけ記録にする。日をまたぐ予定はこの日の区間（24:00 までは 0:00 終わり）
                  const segEnd = seg.endTime === '24:00' ? '00:00' : seg.endTime
                  const end = limitMin !== null && timeToMinutes(seg.endTime) > limitMin ? minutesToTime(limitMin) : segEnd
                  addCompletedTaskWithTime(e.summary, key, seg.startTime, end, e.color ?? DEFAULT_GOOGLE_EVENT_HEX)
                }}
              />
            )}
          </div>
        )
      })}

      {dragPreview && !allDayMoveKey && !unscheduleHover && (
        <div
          className={`absolute ${previewClass(
            dragPreview.kind === 'create' ? activeCreateIntent : dayLogs.some((x) => x.id === dragPreview.taskId) ? 'log' : 'schedule',
            dragPreview.top,
          )} rounded-md pointer-events-none z-20
            ${
              dragPreview.kind === 'create'
                ? 'bg-accent-500/20 border-2 border-accent-500/60'
                : 'bg-accent-400/30 border-2 border-accent-500 shadow-lg'
            }`}
          style={{ top: dragPreview.top, height: dragPreview.height }}
        >
          <span className="text-[10px] text-accent-700 dark:text-accent-300 px-1.5 font-medium">{dragPreview.label}</span>
        </div>
      )}

      {dropPreview && !dropBlocked && (
        <div
          className={`absolute ${previewClass(dropLane, dropPreview.top)} rounded-md pointer-events-none z-20
                     bg-accent-500/20 border-2 border-accent-500/60 border-dashed`}
          style={{ top: dropPreview.top, height: dropPreview.height }}
        >
          <span className="text-[10px] text-accent-700 dark:text-accent-300 px-1.5 font-medium">{dropPreview.label}</span>
        </div>
      )}

      {popup && (
        <CreateGhost
          popup={popup}
          onAnchor={setCreateAnchorFromEl}
          laneClass={previewClass(popup.intent, (timeToMinutes(popup.startTime) / 60) * HOUR_HEIGHT)}
        />
      )}
    </div>
  )
})
