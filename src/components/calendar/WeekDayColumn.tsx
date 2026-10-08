import { memo, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { formatDuration, HOUR_HEIGHT, HOURS, timeToMinutes, yToTime } from '../../lib/timeGrid'
import type { CreateIntent, CreatePopup, DragPreview, useTimelineDrag } from '../../lib/useTimelineDrag'
import type { DropPreview, useTimelineDrop } from '../../lib/useTimelineDrop'
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
import { unrecordedGapsForDay } from '../../lib/unrecordedGaps'

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
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const key = toDateKey(day)
  // 日をまたぐ予定は、この日にかかる区間だけ描く（始まった日は 24:00 まで、次の日は 0:00 から）
  const dayTimedEvents = timedEvents.map((e) => ({
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
  // 過ぎた時間の「記録の無い時間」（起きてから寝るまで・今日は今まで、30 分以上）。記録の列に点線の枠で出し、押すとその時間で記録を作る
  const gaps = splitLanes ? unrecordedGapsForDay(dayLogs, key, limitMin, activeTimer) : []
  const gapId = (g: { start: number }) => `gap-${g.start}`
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
    [
      ...dayLogs.map((t) => ({ id: t.id, ...blockGeometry(t as TimeBlockTask, key, true) })),
      // 記録の無い時間も記録の列のもの（週表示でも予定と左右に分け、枠が予定の下に隠れないように）
      ...gaps.map((g) => {
        const top = (g.start / 60) * HOUR_HEIGHT
        const height = ((g.end - g.start) / 60) * HOUR_HEIGHT
        return { id: gapId(g), top, height, span: height }
      }),
    ],
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
        handleCreatePointerDown(e, key, lane, limit === null ? undefined : (limit / 60) * HOUR_HEIGHT)
      }}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => {
        const lane = laneAt(e.clientX, e.currentTarget)
        if (lane !== dropLane) setDropLane(lane)
        const limit = lane === 'log' ? logLimitMin(key) : null
        const blocked = limit !== null && timeToMinutes(yToTime(getRelativeY(e.clientY, key))) >= limit
        if (blocked !== dropBlocked) setDropBlocked(blocked)
        // 記録の列の「今より先」には落とせない（preventDefault しない＝ドロップ不可）
        if (!blocked) handleDragOver(e, key)
      }}
      onDragLeave={handleDragLeave}
      onDrop={(e) => {
        dropLaneRef.current = laneAt(e.clientX, e.currentTarget)
        handleDropEvent(e, key)
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
            // 記録だけの塊は全幅に広がるが、記録の無い時間は常に記録の列（右半分）に収める（週表示で目立たせない）
            style={{
              left: 'calc(50% + 2px)',
              width: 'calc(50% - 4px)',
              top: (g.start / 60) * HOUR_HEIGHT + 1,
              height: ((g.end - g.start) / 60) * HOUR_HEIGHT - 2,
            }}
            aria-label={t('weekCalendar.unrecordedGapAria', { start: startTime, end: endTime })}
            title={t('weekCalendar.unrecordedGapAria', { start: startTime, end: endTime })}
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
              {/* 週表示は列が狭いので「+」だけ（長さは押す前に title で分かる） */}
              {mode === 'columns' && <span> {t('weekCalendar.unrecordedGap', { time: formatDuration(g.end - g.start) })}</span>}
            </span>
          </button>
        )
      })}

      {dayTimed.map((t) => (
        <div key={t.id} style={{ opacity: movingTaskId === t.id ? 0.3 : 1 }}>
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
      {dayHabitSlots.map(({ habit, slot, done }) => (
        <div key={slot.id} style={{ opacity: movingTaskId === slot.id ? 0.3 : 1 }}>
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
              handleBlockPointerDown(evt, slot.id, key, slot.startTime, slot.endTime, gridRef.current)
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
          <div key={`event-${e.id}`} style={{ opacity: movingTaskId === `event-${e.id}` ? 0.3 : 1 }}>
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
                handleBlockPointerDown(evt, `event-${e.id}`, key, e.startTime!, e.endTime!, gridRef.current)
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

      {dragPreview && !allDayMoveKey && !unscheduleHover && (
        <div
          className={`absolute ${laneClass(
            dragPreview.kind === 'create' ? activeCreateIntent : dayLogs.some((x) => x.id === dragPreview.taskId) ? 'log' : 'schedule',
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
          className={`absolute ${laneClass(dropLane)} rounded-md pointer-events-none z-20
                     bg-accent-500/20 border-2 border-accent-500/60 border-dashed`}
          style={{ top: dropPreview.top, height: dropPreview.height }}
        >
          <span className="text-[10px] text-accent-700 dark:text-accent-300 px-1.5 font-medium">{dropPreview.label}</span>
        </div>
      )}

      {popup && <CreateGhost popup={popup} onAnchor={setCreateAnchorFromEl} laneClass={laneClass(popup.intent)} />}
    </div>
  )
})
