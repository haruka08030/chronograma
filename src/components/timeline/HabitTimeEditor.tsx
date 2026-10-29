import { useState } from 'react'
import { addDays } from 'date-fns'
import { fromDateKey, toDateKey } from '../../lib/dateKey'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Habit } from '../../types/habit'
import { habitTimesOn, isoWeekdayOf } from '../../lib/habitTiming'
import { PillToggle } from '../ui/PillToggle'
import { DateField } from '../DateField'
import { buttonClass } from '../ui/buttonClass'
import { fieldClass } from '../ui/fieldClass'
import { META_TEXT } from '../ui/textClass'
import { TimeRangeInputs } from '../habits/HabitFormFields'

type Scope = 'day' | 'weekday'
type Until = 'forever' | 'date'

/**
 * 習慣の枠のカードで時間を直す欄（開いている画面のまま）。直す日は「この日だけ」か「これ以降の◯曜日」
 * （Google カレンダーの繰り返しの予定と同じ）。◯曜日は「ずっと」か日付まで。ストアは `setHabitTime`
 */
export function HabitTimeEditor({ habit, dateKey, onDone }: { habit: Habit; dateKey: string; onDone: () => void }) {
  const { t } = useTranslation()
  const setHabitTime = useTaskStore((s) => s.setHabitTime)
  const current = habitTimesOn(habit, dateKey)
  const [startTime, setStartTime] = useState(current?.startTime ?? '09:00')
  const [endTime, setEndTime] = useState(current?.endTime ?? '')
  const [scope, setScope] = useState<Scope>('day')
  const [until, setUntil] = useState<Until>('forever')
  // 期限の既定は 4 週あと（その日と同じ曜日）
  const [untilDate, setUntilDate] = useState(() => toDateKey(addDays(fromDateKey(dateKey), 28)))
  if (!current) return null
  const ranged = current.endTime !== null
  const weekdayLabel = (t('habits.weekdays', { returnObjects: true }) as string[])[isoWeekdayOf(dateKey) - 1]

  const save = () => {
    // 時刻ひとつの習慣の曜日ごとの時間は終わりを持たない（その日だけなら、格子に置いた日の長さを保つ）
    const times = { startTime, endTime: ranged && (scope === 'day' || habit.timeMode === 'range') ? endTime : null }
    setHabitTime(
      habit.id,
      dateKey,
      times,
      scope === 'day' ? { kind: 'day' } : { kind: 'weekday', until: until === 'date' ? untilDate : null },
    )
    onDone()
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <TimeRangeInputs
          mode={ranged ? 'range' : 'fixed'}
          startTime={startTime}
          endTime={endTime}
          onTimesChange={(p) => {
            if (p.startTime !== undefined) setStartTime(p.startTime)
            if (p.endTime !== undefined) setEndTime(p.endTime)
          }}
        />
      </div>
      {/* 時間を決めていない習慣（その日だけ格子に置いた）は、その日だけ */}
      {habit.timeMode === 'none' ? null : (
        <div>
          <p className={`mb-1.5 ${META_TEXT}`}>{t('weekCalendar.habitTimeScope')}</p>
          <PillToggle
            ariaLabel={t('weekCalendar.habitTimeScope')}
            options={[
              { value: 'day', label: t('weekCalendar.habitTimeScopeDay') },
              { value: 'weekday', label: t('weekCalendar.habitTimeScopeWeekday', { day: weekdayLabel }) },
            ]}
            value={scope}
            onChange={setScope}
          />
        </div>
      )}
      {scope === 'weekday' ? (
        <div>
          <p className={`mb-1.5 ${META_TEXT}`}>{t('weekCalendar.habitTimeUntil')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <PillToggle
              ariaLabel={t('weekCalendar.habitTimeUntil')}
              options={[
                { value: 'forever', label: t('weekCalendar.habitTimeForever') },
                { value: 'date', label: t('weekCalendar.habitTimeUntilDate') },
              ]}
              value={until}
              onChange={setUntil}
            />
            {until === 'date' ? (
              <DateField
                value={untilDate}
                min={dateKey}
                onChange={(v) => v && setUntilDate(v)}
                ariaLabel={t('weekCalendar.habitTimeUntil')}
                className={fieldClass({ size: 'sm' })}
                inline
              />
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={save} className={buttonClass({ variant: 'primary', size: 'sm' })}>
          {t('common.save')}
        </button>
      </div>
    </div>
  )
}
