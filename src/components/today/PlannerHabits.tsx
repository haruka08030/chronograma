import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Habit } from '../../types/habit'
import { buildHabitRecordIndex, habitDayStatus, habitRecordFor, isTimedHabit } from '../../lib/habitTiming'
import { colorVars, logLabelFromTask } from '../../lib/logCategoryColors'
import { HABIT_DONE_FILL, HABIT_OFF_TIME_FILL, HABIT_OFF_TIME_TEXT } from '../../lib/habitMark'
import { tip } from '../../lib/tooltip'
import { CheckIcon, PlayIcon } from '../icons'

/** 今日の計画の「習慣」。リング: 押すと達成（もう一度押すと外す）。▶ でその名前のタイマーを始める */
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
  return (
    <div className="mt-6 px-3">
      <h2 className={`${headingClass} px-3`}>{t('planner.habitsHeading')}</h2>
      {/* 習慣はリング: 押すと達成（もう一度押すと外す）。▶ でその名前のタイマーを始める */}
      <ul className="flex flex-wrap gap-x-2 gap-y-3 px-1 pt-1">
        {dayHabits.map((h) => {
          const status = habitDayStatus(h, dateKey, habitRecords)
          const record = status === 'offTime' ? habitRecordFor(habitRecords, h, dateKey) : null
          const canTime = viewingToday && status === 'missed' && activeTimer?.taskTitle !== h.title
          return (
            <li key={h.id} className="relative flex w-24 flex-col items-center gap-1.5" style={colorVars(h.color)}>
              <button
                type="button"
                aria-pressed={status !== 'missed'}
                aria-label={h.title}
                {...tip(record ? t('habits.offTimeTooltip', { date: dateKey, start: record.startTime, end: record.endTime }) : undefined)}
                onClick={() => toggleHabitDate(h.id, dateKey)}
                className={`flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-[var(--c)] transition-colors touch-manipulation ${
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
              <span className="line-clamp-2 w-full text-center text-xs leading-snug text-zinc-600 dark:text-zinc-300">{h.title}</span>
              {record && <span className={`-mt-1 text-[10px] ${HABIT_OFF_TIME_TEXT}`}>{t('planner.habitOffTime')}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
