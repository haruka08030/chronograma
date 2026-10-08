import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { HOUR_HEIGHT, HOURS, timeToMinutes, yToTime } from '../../lib/timeGrid'
import type { CreateIntent, useTimelineDrag } from '../../lib/useTimelineDrag'
import type { useTimelineDrop } from '../../lib/useTimelineDrop'
import { canEditGoogleEvent } from '../../lib/googleEventEdit'
import type { CalendarEvent } from '../../types/calendarEvent'
import { isEventTask, isSleepTask, type Task } from '../../types/task'
import { layoutPlanAndLog } from '../../lib/overlapLayout'
import { recordHex } from '../../lib/logCategoryColors'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { planHex } from '../../lib/planVisual'
import { habitToPlannedItem } from '../../lib/habitSlots'
import { habitDayStatus, type HabitRecordIndex } from '../../lib/habitTiming'
import { isAppToday, isNowOnDay } from '../../lib/timeZone'
import { SELECTED_COLUMN, TODAY_COLUMN } from '../../lib/dayMarker'
import { toDateKey } from '../../lib/dateKey'
import { minutesToTime } from '../../lib/clockTime'
import { blockGeometry, type TimeBlockTask } from './timeBlockGeometry'
import { CreateGhost, NowIndicator, SlotCheck, TimeBlock } from './TimeBlock'
import { logSegmentClockOnDay } from '../../lib/taskTimeRange'
import { googleEventCrossesDay, googleEventSegmentOnDay } from '../../lib/googleEventSpan'

/** 週タイムラインの 1 日の列（予定・記録・習慣・Google の予定のブロックと、ドラッグ・作成中の枠） */
export function WeekDayColumn({
  day,
  gridDays,
  singleDay,
  selectedDateKey,
  onSelectDate,
  timedByDate,
  timeLogsByDate,
  timedEventsByDate,
  habitIndex,
  splitLanes,
  laneAt,
  laneClass,
  logLimitMin,
  getRelativeY,
  gridRef,
  timelineDrag,
  timelineDrop,
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
  setCreateAnchorFromEl,
}: {
  day: Date
  gridDays: Date[]
  singleDay: boolean
  selectedDateKey?: string
  onSelectDate?: (dateKey: string) => void
  timedByDate: Map<string, Task[]>
  timeLogsByDate: Map<string, Task[]>
  /** 時刻つきの Google の予定（日をまたぐものは重なる日すべて） */
  timedEventsByDate: Map<string, CalendarEvent[]>
  habitIndex: HabitRecordIndex
  splitLanes: boolean
  laneAt: (clientX: number, el: HTMLElement) => CreateIntent
  laneClass: (lane: CreateIntent | null | undefined) => string
  logLimitMin: (key: string) => number | null
  getRelativeY: (clientY: number, dateKey: string) => number
  gridRef: RefObject<HTMLDivElement | null>
  timelineDrag: ReturnType<typeof useTimelineDrag>
  timelineDrop: ReturnType<typeof useTimelineDrop>
  dropLane: CreateIntent
  setDropLane: Dispatch<SetStateAction<CreateIntent>>
  dropBlocked: boolean
  setDropBlocked: Dispatch<SetStateAction<boolean>>
  dropLaneRef: MutableRefObject<CreateIntent>
  googleDragRef: MutableRefObject<CalendarEvent | null>
  allDayMoveKey: string | null
  unscheduleHover: boolean
  openCard: (taskId: string) => void
  openGoogleCard: (eventId: string) => void
  setCreateAnchorFromEl: (el: HTMLDivElement | null) => void
}) {
  const { t } = useTranslation()
  /** 予定を `t` で回す箇所でも使えるように */
  const tr = t
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const googleCanWrite = useTaskStore((s) => s.googleCanWrite)
  const habits = useTaskStore((s) => s.habits)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const addCompletedTaskWithTime = useTaskStore((s) => s.addCompletedTaskWithTime)
  const key = toDateKey(day)
  const dayTimed = timedByDate.get(key) ?? []
  const dayLogs = timeLogsByDate.get(key) ?? []
  // 日をまたぐ予定は、この日にかかる区間だけ描く（始まった日は 24:00 まで、次の日は 0:00 から）
  const dayTimedEvents = (timedEventsByDate.get(key) ?? []).map((e) => ({
    e,
    seg: googleEventSegmentOnDay(e, key) ?? { startTime: e.startTime!, endTime: e.endTime! },
  }))
  const today = isAppToday(day)
  // 時間を決めた習慣は予定の列に出す（✓ で予定どおりの記録を作って達成）
  const dayHabitSlots = habits.flatMap((h) => {
    const slot = habitToPlannedItem(h, key, habitIndex)
    return slot ? [{ habit: h, slot, done: habitDayStatus(h, key, habitIndex) !== 'missed' }] : []
  })
  const limitMin = logLimitMin(key)
  /** 始まった（記録にできる）時間か */
  const hasStarted = (start: string) => limitMin === null || timeToMinutes(start) < limitMin
  // 時間が重なるところだけ 予定=左 / ログ=右 に分け、同じ種類の重なりは列（週表示はずらし重ね）にする
  const mode = gridDays.length > 1 ? 'cascade' : 'columns'
  // 1 日表示（今日の計画）は 予定 / 記録 の 2 列に固定。週表示は列が狭いので、記録と重なる塊だけ左右に分け、
  // 記録の無い時間帯は予定に全幅を使う（半分＋ずらし重ねだと「E...」になって何の予定か読めない）
  const fixedLanes = splitLanes && gridDays.length === 1
  const blockStyles = layoutPlanAndLog(
    [
      ...dayTimed.map((t) => ({ id: t.id, ...blockGeometry(t as TimeBlockTask, key, false) })),
      ...dayHabitSlots.map(({ slot }) => ({
        id: slot.id,
        ...blockGeometry(
          { id: slot.id, title: slot.summary, startTime: slot.startTime, endTime: slot.endTime, completed: false },
          key,
          false,
        ),
      })),
      ...dayTimedEvents.map(({ e, seg }) => ({
        id: `event-${e.id}`,
        ...blockGeometry({ id: e.id, title: e.summary, startTime: seg.startTime, endTime: seg.endTime, completed: false }, key, false),
      })),
    ],
    dayLogs.map((t) => ({ id: t.id, ...blockGeometry(t as TimeBlockTask, key, true) })),
    mode,
    fixedLanes,
  )
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
      {/* 予定｜記録の境目は点線にして、日の境目（実線）と見分ける。終わった日も 2 列だと分かる */}
      {splitLanes && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-zinc-200 dark:border-zinc-700" />
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

      {isNowOnDay(day) && <NowIndicator />}

      {dayTimed.map((t) => (
        <div key={t.id} style={{ opacity: timelineDrag.movingTaskId === t.id ? 0.3 : 1 }}>
          <TimeBlock
            task={t as TimeBlockTask}
            onPointerDown={(e) =>
              timelineDrag.handleBlockPointerDown(e, t.id, key, t.startTime!, t.endTime!, gridRef.current, {
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
        <div key={`${t.id}::${key}`} style={{ opacity: timelineDrag.movingTaskId === t.id ? 0.3 : 1 }}>
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
              timelineDrag.handleBlockPointerDown(e, t.id, key, seg.startTime, seg.endTime, gridRef.current, {
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
      {dayHabitSlots.map(({ habit, slot, done }) => (
        <div key={slot.id} style={{ opacity: timelineDrag.movingTaskId === slot.id ? 0.3 : 1 }}>
          <TimeBlock
            task={{ id: slot.id, title: slot.summary, startTime: slot.startTime, endTime: slot.endTime, completed: done }}
            dayKey={key}
            hStyle={planStyle(slot.id)}
            colorHex={habit.color}
            onPointerDown={(evt) => {
              // まだの枠は動かす・伸ばすと、その日だけの時間になる（済んだ枠は記録のほうを動かす）
              if (done) {
                evt.preventDefault()
                evt.stopPropagation()
                return
              }
              timelineDrag.handleBlockPointerDown(evt, slot.id, key, slot.startTime, slot.endTime, gridRef.current)
            }}
            onOpenDetail={() => {}}
            withCheck={done || hasStarted(slot.startTime)}
          />
          {(done || hasStarted(slot.startTime)) && (
            // 習慣画面・今日画面と同じく、もう一度押すと外す（その日の記録も外れる）
            <SlotCheck
              {...blockGeometry(
                { id: slot.id, title: slot.summary, startTime: slot.startTime, endTime: slot.endTime, completed: false },
                key,
                false,
              )}
              hStyle={planStyle(slot.id)}
              done={done}
              label={done ? t('weekCalendar.habitUndo') : t('weekCalendar.habitDoneAsPlanned')}
              onCheck={() => toggleHabitDate(habit.id, key)}
            />
          )}
        </div>
      ))}
      {dayTimedEvents.map(({ e, seg }) => {
        // Google の予定も予定。記録にしたら完了（✓・グレー）、時間が過ぎたらグレー
        const recorded = dayLogs.some((l) => l.title === e.summary)
        // 日をまたぐ予定は列ごとに区間しか描いていないので、ドラッグでは動かさない（押すとカードで直せる）
        const editable = canEditGoogleEvent(e, googleCanWrite) && !googleEventCrossesDay(e)
        return (
          <div key={`event-${e.id}`} style={{ opacity: timelineDrag.movingTaskId === `event-${e.id}` ? 0.3 : 1 }}>
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
                // 書き換えられる Google の予定は、アプリの予定と同じくドラッグで移動・長さ変更
                googleDragRef.current = e
                timelineDrag.handleBlockPointerDown(evt, `event-${e.id}`, key, e.startTime!, e.endTime!, gridRef.current)
              }}
              onTap={editable ? undefined : () => openGoogleCard(e.id)}
              onOpenDetail={() => openGoogleCard(e.id)}
              withCheck={hasStarted(seg.startTime) && !recorded}
            />
            {hasStarted(seg.startTime) && !recorded && (
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

      {timelineDrag.dragPreview && timelineDrag.dragPreview.dateKey === key && !allDayMoveKey && !unscheduleHover && (
        <div
          className={`absolute ${laneClass(
            timelineDrag.dragPreview.kind === 'create'
              ? timelineDrag.activeCreateIntent
              : dayLogs.some((x) => x.id === timelineDrag.dragPreview!.taskId)
                ? 'log'
                : 'schedule',
          )} rounded-md pointer-events-none z-20
            ${
              timelineDrag.dragPreview.kind === 'create'
                ? 'bg-accent-500/20 border-2 border-accent-500/60'
                : 'bg-accent-400/30 border-2 border-accent-500 shadow-lg'
            }`}
          style={{ top: timelineDrag.dragPreview.top, height: timelineDrag.dragPreview.height }}
        >
          <span className="text-[10px] text-accent-700 dark:text-accent-300 px-1.5 font-medium">{timelineDrag.dragPreview.label}</span>
        </div>
      )}

      {timelineDrop.dropPreview && timelineDrop.dropPreview.dateKey === key && !dropBlocked && (
        <div
          className={`absolute ${laneClass(dropLane)} rounded-md pointer-events-none z-20
                     bg-accent-500/20 border-2 border-accent-500/60 border-dashed`}
          style={{ top: timelineDrop.dropPreview.top, height: timelineDrop.dropPreview.height }}
        >
          <span className="text-[10px] text-accent-700 dark:text-accent-300 px-1.5 font-medium">{timelineDrop.dropPreview.label}</span>
        </div>
      )}

      {timelineDrag.popup && timelineDrag.popup.dateKey === key && (
        <CreateGhost popup={timelineDrag.popup} onAnchor={setCreateAnchorFromEl} laneClass={laneClass(timelineDrag.popup.intent)} />
      )}
    </div>
  )
}
