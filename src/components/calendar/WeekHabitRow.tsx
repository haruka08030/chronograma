import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { HabitRecordIndex } from '../../lib/habitTiming'
import { pointHabitsOn } from '../../lib/habitSlots'
import { colorVars } from '../../lib/logCategoryColors'
import { planVisualState } from '../../lib/planVisual'
import { timeToMinutes } from '../../lib/timeGrid'
import { toDateKey } from '../../lib/dateKey'
import { CalendarCheck } from '../timeline/CalendarCheck'

/**
 * 終日の行の下の習慣の段。始まりの時刻だけを決めた習慣は長さを持たないので、格子に枠を置かず時刻つきのチップで並べる。
 * 押すと習慣の枠と同じカード、右クリック（タッチは長押し）で同じメニュー。その週に 1 つも無ければ出さない
 */
export function WeekHabitRow({
  gridDays,
  gutterWidth,
  gridColsClass,
  habitIndex,
  logLimitMin,
  openHabitCard,
  openHabitMenu,
}: {
  gridDays: Date[]
  gutterWidth: number
  gridColsClass: string
  habitIndex: HabitRecordIndex
  logLimitMin: (key: string) => number | null
  openHabitCard: (slotId: string, el?: Element | null) => void
  openHabitMenu: (slotId: string, x: number, y: number) => boolean
}) {
  const { t } = useTranslation()
  const habits = useTaskStore((s) => s.habits)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const byDay = useMemo(
    () => gridDays.map((day) => ({ key: toDateKey(day), chips: pointHabitsOn(habits, toDateKey(day), habitIndex) })),
    [gridDays, habits, habitIndex],
  )
  if (!byDay.some((d) => d.chips.length > 0)) return null
  return (
    <div className="flex flex-shrink-0 border-b border-zinc-200 px-2 dark:border-zinc-800">
      <div style={{ width: gutterWidth }} className="flex-shrink-0 pr-2 pt-1 text-right text-[10px] text-zinc-400">
        {t('weekCalendar.habitRow')}
      </div>
      <div className={`flex-1 grid ${gridColsClass}`}>
        {byDay.map(({ key, chips }) => {
          const limit = logLimitMin(key)
          return (
            <div key={key} className="min-h-[24px] space-y-0.5 border-l border-zinc-200 px-0.5 py-0.5 dark:border-zinc-700">
              {chips.map(({ habit, slot, done }) => {
                // 始まった（記録にできる）時刻からは ✓ で予定どおり達成
                const started = limit === null || timeToMinutes(slot.startTime) < limit
                const state = planVisualState({ completed: false, startTime: slot.startTime, endTime: slot.endTime }, key)
                return (
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 押して開くのはマウス・指の近道（中の ✓ はボタン）
                  <div
                    key={slot.id}
                    data-block-id={slot.id}
                    data-touch-menu
                    onClick={(e) => openHabitCard(slot.id, e.currentTarget)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      openHabitMenu(slot.id, e.clientX, e.clientY)
                    }}
                    className={`${!done && state === 'upcoming' ? 'gc-plan' : 'gc-missed'} flex cursor-pointer items-center gap-1 rounded px-1 py-0.5
                      text-[10px] leading-tight transition-[filter] hover:brightness-95`}
                    style={colorVars(habit.color)}
                  >
                    {(done || started) && (
                      <CalendarCheck
                        done={done}
                        label={done ? t('weekCalendar.habitUndo') : t('weekCalendar.habitDoneAsPlanned')}
                        onCheck={() => toggleHabitDate(habit.id, key)}
                      />
                    )}
                    <span className="truncate">
                      <span className="tabular-nums">{slot.startTime}</span> {slot.summary}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
