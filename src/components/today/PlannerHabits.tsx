import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { habitMinutesOn, habitRecordFor, isTimedHabit, type buildHabitRecordIndex } from '../../lib/habitTiming'
import type { HabitDayRow } from '../../hooks/usePlannerHabitRows'
import { colorVars, logLabelFromTask } from '../../lib/logCategoryColors'
import { HABIT_DONE_FILL, HABIT_OFF_TIME_FILL, HABIT_PENDING } from '../../lib/habitMark'
import { habitWeekDoneCount, habitWeekRequired } from '../../lib/habitSchedule'
import { fromDateKey } from '../../lib/dateKey'
import { tip } from '../../lib/tooltip'
import { CheckIcon, PlayIcon } from '../icons'
import { ROW_PRESS_CLASS } from '../ui/rowStateClass'
import { META_TONE_CLASS } from './plannerRowMeta'

/**
 * 今日の計画の「習慣」。To-Do の欄のすぐ下に、To-Do と同じ高さの行で出す（まだ選ぶ前の候補より上。その日やると決まっているもの）。
 * 行: その色の丸（押すと達成、もう一度押すと外す）・名前・右に時刻 / 今週の回数 / 時間の目標の進み・▶（その名前のタイマー）。
 * 出すのはまだの習慣だけ（済んだものは「完了 N 件」の中の `PlannerHabitRows`）。全部済んだら見出しも出さない
 */
export function PlannerHabits({
  rows,
  habitRecords,
  dateKey,
  viewingToday,
  headingClass,
}: {
  rows: HabitDayRow[]
  habitRecords: ReturnType<typeof buildHabitRecordIndex>
  dateKey: string
  viewingToday: boolean
  headingClass: string
}) {
  const { t } = useTranslation()
  if (rows.length === 0) return null
  return (
    <div className="mt-6 px-3">
      <h2 className={`${headingClass} px-3`}>{t('planner.habitsHeading')}</h2>
      <PlannerHabitRows rows={rows} habitRecords={habitRecords} dateKey={dateKey} viewingToday={viewingToday} />
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
}: {
  rows: HabitDayRow[]
  habitRecords: ReturnType<typeof buildHabitRecordIndex>
  dateKey: string
  viewingToday: boolean
  ariaLabel?: string
}) {
  return (
    <ul aria-label={ariaLabel}>
      {rows.map((r) => (
        <HabitRow key={r.h.id} row={r} dateKey={dateKey} viewingToday={viewingToday} habitRecords={habitRecords} />
      ))}
    </ul>
  )
}

function HabitRow({
  row: { h, status, weekMet, time },
  dateKey,
  viewingToday,
  habitRecords,
}: {
  row: HabitDayRow
  dateKey: string
  viewingToday: boolean
  habitRecords: ReturnType<typeof buildHabitRecordIndex>
}) {
  const { t } = useTranslation()
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const startTimer = useTaskStore((s) => s.startTimer)
  const labelPresets = useTaskStore((s) => s.timeLogTagPresets)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const record = status === 'offTime' ? habitRecordFor(habitRecords, h, dateKey) : null
  // 時間の目標に届いていない日は、何分やったかを出す
  const minutes = h.goalMinutes && status === 'missed' ? habitMinutesOn(habitRecords, h, dateKey) : 0
  const date = fromDateKey(dateKey)
  const weekly = h.frequency.type === 'timesPerWeek'
  const canTime = viewingToday && status === 'missed' && !weekMet && activeTimer?.taskTitle !== h.title
  // 右の文字: 時間外・目標の進みのどちらか → 今週の回数（週に◯回）か時刻
  const meta = [
    record ? t('planner.habitOffTime') : minutes > 0 ? t('habits.goalProgress', { done: minutes, goal: h.goalMinutes }) : null,
    weekly
      ? weekMet && status === 'missed'
        ? t('habits.weekGoalMet')
        : t('planner.habitWeekProgress', { done: habitWeekDoneCount(h, date, habitRecords), count: habitWeekRequired(h, date) })
      : time,
  ].filter((m): m is string => !!m)
  return (
    <li
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${ROW_PRESS_CLASS}`}
      style={colorVars(h.color)}
    >
      {/* To-Do の丸と同じ大きさ・押せる範囲。色は習慣の色（To-Do と見分ける） */}
      <button
        type="button"
        role="checkbox"
        aria-checked={status !== 'missed'}
        aria-label={weekMet ? `${h.title} ${t('habits.weekGoalMet')}` : h.title}
        {...tip(record ? t('habits.offTimeTooltip', { date: dateKey, start: record.startTime, end: record.endTime }) : undefined)}
        onClick={() => toggleHabitDate(h.id, dateKey)}
        className="-m-2.5 flex-shrink-0 touch-manipulation p-2.5"
      >
        <span
          aria-hidden
          className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
            status === 'done'
              ? HABIT_DONE_FILL
              : status === 'offTime'
                ? HABIT_OFF_TIME_FILL
                : `${HABIT_PENDING} hover:bg-[color-mix(in_srgb,var(--c)_12%,transparent)]`
          }`}
        >
          {status !== 'missed' && <CheckIcon className="h-3 w-3" strokeWidth={2.75} />}
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
            if (!isTimedHabit(h) && !h.goalMinutes) toggleHabitDate(h.id, dateKey)
          }}
          {...tip(t('quickLog.resume', { title: h.title }), { name: true })}
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--c)] transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <PlayIcon className="h-3 w-3" />
        </button>
      )}
    </li>
  )
}
