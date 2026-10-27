import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { isHabitRestOn, type Habit } from '../../types/habit'
import { habitRestRunEnd } from '../../lib/habitSchedule'
import { fromDateKey } from '../../lib/dateKey'
import { useDateFormat } from '../../hooks/useDateFormat'
import type { ActionEntry, ActionLeaf } from '../ui/ActionMenu'
import { MenuLabel } from '../ui/Menu'
import { DatePickerBody } from '../DatePickerBody'
import { PauseIcon } from '../icons'

const ICON = 'h-4 w-4 flex-shrink-0'

/**
 * 習慣の「休む」（メニューと習慣の詳細のボタンで同じ）。`day` から休む。
 * - `entry`: 休みの日なら「休みを外す」の項目、そうでなければ「休む ›」（この日だけ・カレンダーで選んだ日まで）
 * - `flat`: 詳細のボタンから開く短いメニュー用に、「この日だけ」と「この日まで休む ›」（カレンダー）を 1 段目に並べたもの
 */
export function useHabitRestEntry(habit: Habit | null, day: string): { entry: ActionEntry; flat: ActionEntry[] } | null {
  const { t } = useTranslation()
  const df = useDateFormat()
  const setHabitRest = useTaskStore((s) => s.setHabitRest)
  if (!habit) return null
  if (isHabitRestOn(habit, day)) {
    const clear: ActionEntry = {
      kind: 'leaf',
      id: 'rest',
      label: t('habits.restClear'),
      icon: <PauseIcon className={ICON} />,
      hint: df.monthDayWeekday(day),
      run: () => setHabitRest(habit.id, day, habitRestRunEnd(habit, day), false),
    }
    return { entry: clear, flat: [clear] }
  }
  const oneDay: ActionLeaf = {
    id: 'rest-day',
    label: t('habits.restOneDay'),
    hint: df.monthDayWeekday(day),
    run: () => setHabitRest(habit.id, day, day, true),
  }
  const picker = (close: () => void) => (
    <DatePickerBody
      footer={false}
      kind="date"
      value={null}
      min={day}
      month={fromDateKey(day)}
      onPick={(key) => {
        if (key) setHabitRest(habit.id, day, key, true)
        close()
      }}
    />
  )
  return {
    entry: {
      kind: 'sub',
      id: 'rest',
      label: t('habits.rest'),
      icon: <PauseIcon className={ICON} />,
      hint: df.monthDayWeekday(day),
      width: 'lg',
      leaves: [{ ...oneDay, hint: undefined }],
      extra: (close) => (
        <>
          <MenuLabel>{t('habits.restUntil')}</MenuLabel>
          {picker(close)}
        </>
      ),
    },
    flat: [
      { kind: 'leaf', ...oneDay },
      { kind: 'sub', id: 'rest-until', label: t('habits.restUntil'), leaves: [], width: 'lg', extra: picker },
    ],
  }
}
