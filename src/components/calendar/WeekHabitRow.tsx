import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore, selectLiveHabits } from '../../store/taskStore'
import type { HabitRecordIndex } from '../../lib/habitTiming'
import { isPlacedPointHabitOn, pointHabitsOn, untimedHabitsOn } from '../../lib/habitSlots'
import { colorVars } from '../../lib/logCategoryColors'
import { planVisualState } from '../../lib/planVisual'
import { timeToMinutes } from '../../lib/timeGrid'
import { toDateKey } from '../../lib/dateKey'
import { CalendarCheck } from '../timeline/CalendarCheck'
import { DROP_HIGHLIGHT_CLASS, startTaskDrag } from '../../lib/taskDrag'

/**
 * 終日の行の下の習慣の段。始まりの時刻だけを決めた習慣は長さを持たないので、格子に枠を置かず時刻つきのチップで並べる。
 * 時間を決めていない習慣も、やる日に気づけるよう後ろに時刻なしで並べる（格子には置かない）。
 * 押すと習慣の枠と同じカード、右クリック（タッチは長押し）で同じメニュー。その日の格子へドラッグすると、その日だけその時間の枠になる。
 * その週に 1 つも無ければ出さない
 */
export function WeekHabitRow({
  gridDays,
  gutterWidth,
  gridColsClass,
  habitIndex,
  logLimitMin,
  openHabitCard,
  openHabitMenu,
  dropKey,
  keepEmpty,
}: {
  gridDays: Date[]
  gutterWidth: number
  gridColsClass: string
  habitIndex: HabitRecordIndex
  logLimitMin: (key: string) => number | null
  openHabitCard: (slotId: string, el?: Element | null) => void
  openHabitMenu: (slotId: string, x: number, y: number) => boolean
  /** 格子の枠を戻そうとしている日（その日のマスを落とし先の色にする） */
  dropKey: string | null
  /** チップが無くても、格子に置いた日があれば段を残す（PC。ドラッグで戻す落とし先） */
  keepEmpty: boolean
}) {
  const { t } = useTranslation()
  const habits = useTaskStore(selectLiveHabits)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const byDay = useMemo(
    () =>
      gridDays.map((day) => {
        const key = toDateKey(day)
        // 時刻ひとつの習慣（時刻順）の後ろに、時間を決めていない習慣を時刻なしで並べる
        const chips = [
          ...pointHabitsOn(habits, key, habitIndex).map(({ habit, slot, done }) => ({ habit, id: slot.id, time: slot.startTime, done })),
          ...untimedHabitsOn(habits, key, habitIndex).map(({ habit, id, done }) => ({ habit, id, time: null, done })),
        ]
        return { key, chips, placed: habits.some((h) => isPlacedPointHabitOn(h, key)) }
      }),
    [gridDays, habits, habitIndex],
  )
  // PC は全部の日を格子に置いても、戻す落とし先として段は残す（ドラッグ中に格子がずれないように）。スマホは空なら出さない
  if (!byDay.some((d) => d.chips.length > 0 || (keepEmpty && d.placed))) return null
  return (
    <div className="flex flex-shrink-0 border-b border-zinc-200 px-2 dark:border-zinc-800">
      <div style={{ width: gutterWidth }} className="flex-shrink-0 pr-2 pt-1 text-right text-[10px] text-zinc-400">
        {t('weekCalendar.habitRow')}
      </div>
      <div className={`flex-1 grid ${gridColsClass}`}>
        {byDay.map(({ key, chips }) => {
          const limit = logLimitMin(key)
          return (
            <div
              key={key}
              className={`min-h-[24px] space-y-0.5 border-l border-zinc-200 px-0.5 py-0.5 transition-colors dark:border-zinc-700
                ${dropKey === key ? DROP_HIGHLIGHT_CLASS : ''}`}
            >
              {chips.map(({ habit, id, time, done }) => {
                // 始まった（記録にできる）時刻からは ✓ で予定どおり達成。時間なしは今日と過ぎた日（先の日の記録は付けない）
                const started = limit === null || (time === null ? limit > 0 : timeToMinutes(time) < limit)
                const state = planVisualState({ completed: false, startTime: time, endTime: null }, key)
                return (
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 押して開くのはマウス・指の近道（中の ✓ はボタン）
                  <div
                    key={id}
                    data-block-id={id}
                    data-touch-menu
                    // 時間なしは時刻が無いので格子に置かない
                    draggable={time !== null}
                    onDragStart={time !== null ? (e) => startTaskDrag(e, id) : undefined}
                    onClick={(e) => openHabitCard(id, e.currentTarget)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      openHabitMenu(id, e.clientX, e.clientY)
                    }}
                    className={`${!done && state === 'upcoming' ? 'gc-plan' : 'gc-missed'} flex items-center gap-1 rounded px-1 py-0.5
                      text-[10px] leading-tight transition-[filter] hover:brightness-95
                      ${time !== null ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                    style={colorVars(habit.color)}
                  >
                    {(done || started) && (
                      <CalendarCheck
                        done={done}
                        label={
                          done
                            ? t('weekCalendar.habitUndo')
                            : time === null
                              ? t('weekCalendar.habitMarkDone')
                              : t('weekCalendar.habitDoneAsPlanned')
                        }
                        onCheck={() => toggleHabitDate(habit.id, key)}
                      />
                    )}
                    <span className="truncate">
                      {time !== null && <span className="tabular-nums">{time} </span>}
                      {habit.title}
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
