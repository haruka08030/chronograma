import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Habit } from '../../types/habit'
import { buildHabitRecordIndex, habitDayStatus, habitRecordFor, isTimedHabit } from '../../lib/habitTiming'
import { colorVars, logLabelFromTask } from '../../lib/logCategoryColors'
import { HABIT_DONE_FILL, HABIT_OFF_TIME_FILL, HABIT_OFF_TIME_TEXT } from '../../lib/habitMark'
import { isHabitWeekGoalMetOnDate } from '../../lib/habitSchedule'
import { fromDateKey } from '../../lib/dateKey'
import { tip } from '../../lib/tooltip'
import { CheckIcon, PlayIcon } from '../icons'

/**
 * 今日の計画の「習慣」。リング: 押すと達成（もう一度押すと外す）。▶ でその名前のタイマーを始める。
 * 週に◯回の習慣は、その週の回数をほかの日で満たしていれば「今週は達成」と書いて薄く後ろに出す
 * （消すと、もう 1 回やった日に付けられない。▶ は出さない）
 */
export function PlannerHabits({
  dayHabits,
  dateKey,
  viewingToday,
  headingClass,
}: {
  dayHabits: Habit[]
  dateKey: string
  viewingToday: boolean
  headingClass: string
}) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const startTimer = useTaskStore((s) => s.startTimer)
  const labelPresets = useTaskStore((s) => s.timeLogTagPresets)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const habitRecords = useMemo(() => buildHabitRecordIndex(tasks), [tasks])
  // 今週はもう達成した習慣は後ろへ（やることが残っている習慣を先に）
  const rows = useMemo(() => {
    const date = fromDateKey(dateKey)
    const list = dayHabits.map((h) => ({ h, weekMet: isHabitWeekGoalMetOnDate(h, date, habitRecords) }))
    return [...list.filter((r) => !r.weekMet), ...list.filter((r) => r.weekMet)]
  }, [dayHabits, dateKey, habitRecords])
  return (
    <div className="mt-6 px-3">
      <h2 className={`${headingClass} px-3`}>{t('planner.habitsHeading')}</h2>
      {/* 習慣はリング: 押すと達成（もう一度押すと外す）。▶ でその名前のタイマーを始める */}
      <ul className="flex flex-wrap gap-x-2 gap-y-3 px-1 pt-1">
        {rows.map(({ h, weekMet }) => {
          const status = habitDayStatus(h, dateKey, habitRecords)
          const record = status === 'offTime' ? habitRecordFor(habitRecords, h, dateKey) : null
          const canTime = viewingToday && status === 'missed' && !weekMet && activeTimer?.taskTitle !== h.title
          return (
            <li key={h.id} className="relative flex w-24 flex-col items-center gap-1.5" style={colorVars(h.color)}>
              <button
                type="button"
                aria-pressed={status !== 'missed'}
                aria-label={weekMet ? `${h.title} ${t('habits.weekGoalMet')}` : h.title}
                {...tip(record ? t('habits.offTimeTooltip', { date: dateKey, start: record.startTime, end: record.endTime }) : undefined)}
                onClick={() => toggleHabitDate(h.id, dateKey)}
                className={`flex h-11 w-11 items-center justify-center rounded-full border-[3px] transition-colors touch-manipulation ${
                  weekMet ? 'border-[color-mix(in_srgb,var(--c)_35%,transparent)]' : 'border-[var(--c)]'
                } ${
                  status === 'done'
                    ? HABIT_DONE_FILL
                    : status === 'offTime'
                      ? HABIT_OFF_TIME_FILL
                      : 'hover:bg-[color-mix(in_srgb,var(--c)_12%,transparent)]'
                }`}
              >
                {status !== 'missed' && <CheckIcon className="h-5 w-5" strokeWidth={3} />}
              </button>
              {canTime && (
                <button
                  type="button"
                  onClick={() => {
                    const label = logLabelFromTask(h, labelPresets, logCategoryColors)
                    startTimer(h.title, label.tags, null, label.color)
                    // 時刻を決めていない習慣は記録で判定しないので、始めた時点で達成にする
                    if (!isTimedHabit(h)) toggleHabitDate(h.id, dateKey)
                  }}
                  {...tip(t('quickLog.resume', { title: h.title }), { name: true })}
                  // リングの右下の外に置く（重ねると、リングの右下を押したときにタイマーが始まる）
                  className="absolute left-1/2 top-6 ml-6 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-[var(--c)] shadow-sm transition-colors hover:bg-zinc-50
                             dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                  <PlayIcon className="h-2.5 w-2.5" />
                </button>
              )}
              <span
                className={`line-clamp-2 w-full text-center text-xs leading-snug ${
                  weekMet ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-600 dark:text-zinc-300'
                }`}
              >
                {h.title}
              </span>
              {record && <span className={`-mt-1 text-[10px] ${HABIT_OFF_TIME_TEXT}`}>{t('planner.habitOffTime')}</span>}
              {weekMet && <span className={`-mt-1 text-[10px] ${HABIT_OFF_TIME_TEXT}`}>{t('habits.weekGoalMet')}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
