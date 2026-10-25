import { RowColorLine } from '../ui/RowColorLine'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { habitAsOf, habitMinutesOn, habitRecordFor, isTimedHabit, type buildHabitRecordIndex } from '../../lib/habitTiming'
import type { HabitDayRow } from '../../hooks/usePlannerHabitRows'
import { colorVars, logLabelFromTask } from '../../lib/logCategoryColors'
import { HABIT_DONE_FILL, HABIT_OFF_TIME_FILL } from '../../lib/habitMark'
import { COMPLETION_RING_IDLE } from '../ui/CompletionCircle'
import { habitWeekDoneCount, habitWeekRequired } from '../../lib/habitSchedule'
import { fromDateKey } from '../../lib/dateKey'
import { tip } from '../../lib/tooltip'
import { habitSlotId } from '../../lib/habitSlots'
import { startTaskDrag } from '../../lib/taskDrag'
import { startNativeTaskDragGhost } from '../../lib/nativeTaskDragGhost'
import { CheckIcon, PlayIcon } from '../icons'
import { ROW_PRESS_CLASS } from '../ui/rowStateClass'
import { META_TONE_CLASS } from './plannerRowMeta'
import type { useDeferredComplete } from '../../hooks/useDeferredComplete'
import { habitDayKey } from '../../lib/habitDayKey'

type Deferred = ReturnType<typeof useDeferredComplete>

/**
 * 今日の計画の「習慣」。To-Do の欄のすぐ下に、To-Do と同じ高さの行で出す（まだ選ぶ前の候補より上。その日やると決まっているもの）。
 * 行: その色の丸（押すと達成、もう一度押すと外す）・名前・右に時刻 / 今週の回数 / 時間の目標の進み・▶（その名前のタイマー）。
 * まだの行は右のタイムラインへドラッグできる（予定の列＝その日だけの枠、記録の列＝その時間の記録）。
 * 出すのはまだの習慣だけ（済んだものは「完了 N 件」の中の `PlannerHabitRows`）。全部済んだら見出しも出さない。
 * 丸を押した行は済んだ見た目でその場に 1.5 秒残し、縮んでから「完了 N 件」へ移る（To-Do と同じ `useDeferredComplete`）
 */
export function PlannerHabits({
  rows,
  habitRecords,
  dateKey,
  viewingToday,
  headingClass,
  deferred,
}: {
  rows: HabitDayRow[]
  habitRecords: ReturnType<typeof buildHabitRecordIndex>
  dateKey: string
  viewingToday: boolean
  headingClass: string
  deferred?: Deferred
}) {
  const { t } = useTranslation()
  if (rows.length === 0) return null
  return (
    <div className="mt-6 px-3">
      <h2 className={`${headingClass} px-3`}>{t('planner.habitsHeading')}</h2>
      <PlannerHabitRows rows={rows} habitRecords={habitRecords} dateKey={dateKey} viewingToday={viewingToday} deferred={deferred} />
    </div>
  )
}

/** 習慣の行の並び（まだの習慣・「完了 N 件」の中の済んだ習慣で同じ行） */
export function PlannerHabitRows({
  rows,
  habitRecords,
  dateKey,
  viewingToday,
  ariaLabel,
  deferred,
}: {
  rows: HabitDayRow[]
  habitRecords: ReturnType<typeof buildHabitRecordIndex>
  dateKey: string
  viewingToday: boolean
  ariaLabel?: string
  /** 渡すと、達成にした行をその場に残してから移す（まだの習慣の欄だけ。済んだ行は外すとすぐ戻る） */
  deferred?: Deferred
}) {
  return (
    <ul aria-label={ariaLabel}>
      {rows.map((r) => (
        <HabitRow key={r.h.id} row={r} dateKey={dateKey} viewingToday={viewingToday} habitRecords={habitRecords} deferred={deferred} />
      ))}
    </ul>
  )
}

function HabitRow({
  row: { h, status: savedStatus, weekMet, time },
  dateKey,
  viewingToday,
  habitRecords,
  deferred,
}: {
  row: HabitDayRow
  dateKey: string
  viewingToday: boolean
  habitRecords: ReturnType<typeof buildHabitRecordIndex>
  deferred?: Deferred
}) {
  const { t } = useTranslation()
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const startTimer = useTaskStore((s) => s.startTimer)
  const labelPresets = useTaskStore((s) => s.timeLogTagPresets)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const key = habitDayKey(h.id, dateKey)
  // 押して移るのを待っている間は、もう達成した見た目にする
  const pending = deferred?.isPending(key) ?? false
  const status = pending ? 'done' : savedStatus
  const record = status === 'offTime' ? habitRecordFor(habitRecords, h, dateKey) : null
  // 時間の目標に届いていない日は、何分やったかを出す
  // その日の設定（頻度・時間を変えた日より前の日は前の設定）
  const day = habitAsOf(h, dateKey)
  const minutes = day.goalMinutes && status === 'missed' ? habitMinutesOn(habitRecords, h, dateKey) : 0
  const date = fromDateKey(dateKey)
  const weekly = day.frequency.type === 'timesPerWeek'
  const open = status === 'missed' && !weekMet
  const canTime = viewingToday && open && activeTimer?.taskTitle !== h.title
  // 右の文字: 時間外・目標の進みのどちらか → 今週の回数（週に◯回）か時刻
  const meta = [
    record ? t('planner.habitOffTime') : minutes > 0 ? t('habits.goalProgress', { done: minutes, goal: day.goalMinutes }) : null,
    weekly
      ? weekMet && status === 'missed'
        ? t('habits.weekGoalMet')
        : t('planner.habitWeekProgress', { done: habitWeekDoneCount(h, date, habitRecords), count: habitWeekRequired(h, date) })
      : time,
  ].filter((m): m is string => !!m)
  return (
    <li
      className={`relative flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${ROW_PRESS_CLASS} ${
        deferred?.isLeaving(key) ? 'animate-row-collapse overflow-hidden' : ''
      }`}
      style={colorVars(h.color)}
      // まだの習慣は To-Do と同じく右のタイムラインへ: 予定の列でその日だけその時間の枠、記録の列でその時間にやった記録
      draggable={open}
      onDragStart={
        open
          ? (e) => {
              startTaskDrag(e, habitSlotId(h.id, dateKey))
              startNativeTaskDragGhost(e, h.title)
            }
          : undefined
      }
    >
      {/* 習慣の色は左の細い線（To-Do の行と同じ、#511）。済んだ行には出さない */}
      {h.color && status === 'missed' && <RowColorLine hex={h.color} />}
      {/* To-Do の丸と同じ大きさ・押せる範囲。済んだ・時間外の丸だけ習慣の色 */}
      <button
        type="button"
        role="checkbox"
        aria-checked={status !== 'missed'}
        aria-label={weekMet ? `${h.title} ${t('habits.weekGoalMet')}` : h.title}
        {...tip(record ? t('habits.offTimeTooltip', { date: dateKey, start: record.startTime, end: record.endTime }) : undefined)}
        onClick={() => (deferred ? deferred.toggle(key, savedStatus !== 'missed') : toggleHabitDate(h.id, dateKey))}
        className="-m-2.5 flex-shrink-0 touch-manipulation p-2.5"
      >
        <span
          aria-hidden
          className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
            status === 'done'
              ? HABIT_DONE_FILL
              : status === 'offTime'
                ? HABIT_OFF_TIME_FILL
                : // まだの丸は To-Do と同じ灰色（習慣の色だと優先度・締切の色の丸と紛れる、#510）
                  `border-[1.5px] ${COMPLETION_RING_IDLE} hover:border-zinc-400 dark:hover:border-zinc-500`
          }`}
        >
          {status !== 'missed' && <CheckIcon className={`h-3 w-3 ${pending ? 'animate-check-in' : ''}`} strokeWidth={2.75} />}
        </span>
      </button>
      <span
        className={`min-w-0 flex-1 truncate py-2.5 text-[15px] ${
          status !== 'missed' || weekMet ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-100'
        }`}
      >
        {h.title}
      </span>
      {meta.map((m) => (
        <span key={m} className={`shrink-0 text-xs tabular-nums ${META_TONE_CLASS.muted}`}>
          {m}
        </span>
      ))}
      {canTime && (
        <button
          type="button"
          onClick={() => {
            const label = logLabelFromTask(h, labelPresets, logCategoryColors)
            startTimer(h.title, label.tags, null, label.color)
            // 時刻を決めていない習慣は記録で判定しないので、始めた時点で達成にする（時間の目標があれば記録の合計で決まる）
            if (!isTimedHabit(day) && !day.goalMinutes) toggleHabitDate(h.id, dateKey)
          }}
          {...tip(t('quickLog.resume', { title: h.title }), { name: true })}
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <PlayIcon className="h-3 w-3" />
        </button>
      )}
    </li>
  )
}
