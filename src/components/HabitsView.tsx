import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO, startOfWeek, subDays } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import { CALENDAR_COLORS, textOnHex } from '../lib/googleColors'
import { useNavShortcut } from '../lib/shortcuts'
import type { Habit, HabitTimeMode, HabitWeekday } from '../types/habit'
import {
  canSubmitHabitDraft,
  habitFrequencyFromDraft,
  toggleHabitWeekdaySelection,
} from '../lib/habitDraft'
import {
  colorIndexForPalette,
  habitDateKey,
  completionRatioOnDate,
  consistencyForLast7Days,
  currentStreakDays,
} from '../lib/habitStats'
import { isHabitScheduledOnDate } from '../lib/habitSchedule'
import { HABIT_ON_TIME_TOLERANCE_MIN, buildHabitRecordIndex, habitDayStatus, habitRecordFor } from '../lib/habitTiming'
import { TimeInput } from './TimeInput'

/** ISO 曜日（1=月）から曜日名を作るための、ある月曜日 */
const ISO_MONDAY = new Date(2024, 0, 1)
import { addClockMinutes } from '../lib/clockTime'
import { zonedNow } from '../lib/timeZone'
import { dayMarkerClass, TODAY_TEXT } from '../lib/dayMarker'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'
import { ICON_PATHS } from '../lib/iconPaths'

const HABIT_WEEKDAY_ORDER: HabitWeekday[] = [1, 2, 3, 4, 5, 6, 7]

const DEFAULT_WEEKDAYS: HabitWeekday[] = [1, 2, 3, 4, 5]

/** 習慣の色は記録のラベルと同じ Google カレンダーの 24 色（以前の 11 色はすべてこの中にある） */
const HABIT_COLORS: readonly string[] = CALENDAR_COLORS.map((c) => c.hex)
const DEFAULT_HABIT_COLOR_INDEX = CALENDAR_COLORS.findIndex((c) => c.key === 'sage')

const iconTrash = ICON_PATHS.trash

function ColorPicker({
  colorIndex,
  onPick,
}: {
  colorIndex: number
  onPick: (i: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('habits.color')}</span>
      <div role="radiogroup" aria-label={t('habits.color')} className="grid max-w-sm gap-1" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>
        {CALENDAR_COLORS.map((c, i) => {
          const name = t(`googleColors.${c.key}`)
          const isSelected = colorIndex === i
          return (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={name}
              title={name}
              onClick={() => onPick(i)}
              className="flex aspect-square items-center justify-center rounded-full transition-transform hover:scale-110"
              style={{ backgroundColor: c.hex, color: textOnHex(c.hex) }}
            >
              {isSelected && (
                <CheckIcon className="h-3 w-3" strokeWidth={3.5} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WeekdayPicker({
  freq,
  weekdays,
  onToggle,
}: {
  freq: 'daily' | 'weekly'
  weekdays: HabitWeekday[]
  onToggle: (v: HabitWeekday) => void
}) {
  const { t } = useTranslation()
  const labels = t('habits.weekdays', { returnObjects: true }) as string[]
  if (freq !== 'weekly') return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {HABIT_WEEKDAY_ORDER.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onToggle(v)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
            ${weekdays.includes(v)
              ? 'bg-accent-500 text-on-accent'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
        >
          {labels[v - 1]}
        </button>
      ))}
    </div>
  )
}

function HabitTimeFields({
  mode,
  name,
  startTime,
  endTime,
  onModeChange,
  onStartTimeChange,
  onEndTimeChange,
}: {
  mode: HabitTimeMode
  name: string
  startTime: string
  endTime: string
  onModeChange: (mode: HabitTimeMode) => void
  onStartTimeChange: (time: string) => void
  onEndTimeChange: (time: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input
            type="radio"
            name={`${name}-time-mode`}
            checked={mode === 'none'}
            onChange={() => onModeChange('none')}
            className="text-accent-500"
          />
          {t('habits.timeModeNone')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input
            type="radio"
            name={`${name}-time-mode`}
            checked={mode === 'fixed'}
            onChange={() => onModeChange('fixed')}
            className="text-accent-500"
          />
          {t('habits.timeModeFixed')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input
            type="radio"
            name={`${name}-time-mode`}
            checked={mode === 'range'}
            onChange={() => onModeChange('range')}
            className="text-accent-500"
          />
          {t('habits.timeModeRange')}
        </label>
      </div>

      {mode === 'fixed' ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('habits.timeAt')}</span>
          <TimeInput
            value={startTime}
            onChange={onStartTimeChange}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      ) : null}

      {mode === 'range' ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('habits.time')}</span>
          <TimeInput
            value={startTime}
            onChange={onStartTimeChange}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <span className="text-zinc-400">〜</span>
          <TimeInput
            value={endTime}
            onChange={onEndTimeChange}
            pickerDefault={startTime ? addClockMinutes(startTime, 60) : undefined}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      ) : null}

      {mode !== 'none' ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {t('habits.onTimeHint', { min: HABIT_ON_TIME_TOLERANCE_MIN })}
        </p>
      ) : null}
    </div>
  )
}

export function HabitsView() {
  const { t, i18n } = useTranslation()
  const habits = useTaskStore((s) => s.habits)
  const tasks = useTaskStore((s) => s.tasks)
  const habitRecords = useMemo(() => buildHabitRecordIndex(tasks), [tasks])
  const selectedCalendarDateKey = useTaskStore((s) => s.selectedCalendarDateKey)
  const setSelectedCalendarDateKey = useTaskStore((s) => s.setSelectedCalendarDateKey)
  const addHabit = useTaskStore((s) => s.addHabit)
  const updateHabit = useTaskStore((s) => s.updateHabit)
  const deleteHabit = useTaskStore((s) => s.deleteHabit)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)

  const [newTitle, setNewTitle] = useState('')
  const [newFreq, setNewFreq] = useState<'daily' | 'weekly'>('daily')
  const [newWeekdays, setNewWeekdays] = useState<HabitWeekday[]>(DEFAULT_WEEKDAYS)
  const [newTimeMode, setNewTimeMode] = useState<HabitTimeMode>('range')
  const [newStartTime, setNewStartTime] = useState('09:00')
  const [newEndTime, setNewEndTime] = useState('10:00')
  const [newColorIndex, setNewColorIndex] = useState(DEFAULT_HABIT_COLOR_INDEX)
  const newColor = HABIT_COLORS[newColorIndex] ?? HABIT_COLORS[DEFAULT_HABIT_COLOR_INDEX]
  const newTitleInputRef = useRef<HTMLInputElement>(null)

  const [editingHabitId, setEditingHabitId] = useState<string | null>(null)
  const [showComposer, setShowComposer] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editFreq, setEditFreq] = useState<'daily' | 'weekly'>('daily')
  const [editWeekdays, setEditWeekdays] = useState<HabitWeekday[]>(DEFAULT_WEEKDAYS)
  const [editTimeMode, setEditTimeMode] = useState<HabitTimeMode>('range')
  const [editStartTime, setEditStartTime] = useState('09:00')
  const [editEndTime, setEditEndTime] = useState('10:00')
  const [editColorIndex, setEditColorIndex] = useState(DEFAULT_HABIT_COLOR_INDEX)
  const editColor = HABIT_COLORS[editColorIndex] ?? HABIT_COLORS[DEFAULT_HABIT_COLOR_INDEX]

  const cancelEdit = useCallback(() => {
    setEditingHabitId(null)
  }, [])

  const beginEdit = useCallback(
    (h: Habit) => {
      setEditingHabitId(h.id)
      setEditTitle(h.title)
      if (h.frequency.type === 'daily') {
        setEditFreq('daily')
        setEditWeekdays(DEFAULT_WEEKDAYS)
      } else {
        setEditFreq('weekly')
        setEditWeekdays([...h.frequency.weekdays].sort((a, b) => a - b))
      }
      setEditTimeMode(h.timeMode)
      setEditStartTime(h.startTime ?? '09:00')
      setEditEndTime(h.endTime ?? '10:00')
      setEditColorIndex(colorIndexForPalette(h.color, HABIT_COLORS, DEFAULT_HABIT_COLOR_INDEX))
    },
    [],
  )

  useEffect(() => {
    if (!editingHabitId || habits.some((h) => h.id === editingHabitId)) return
    queueMicrotask(() => {
      cancelEdit()
    })
  }, [habits, editingHabitId, cancelEdit])

  useEffect(() => {
    if (showComposer) newTitleInputRef.current?.focus()
  }, [showComposer])

  const toggleNewWeekday = (v: HabitWeekday) => {
    setNewWeekdays((prev) => toggleHabitWeekdaySelection(prev, v))
  }

  const toggleEditWeekday = (v: HabitWeekday) => {
    setEditWeekdays((prev) => toggleHabitWeekdaySelection(prev, v))
  }

  const closeComposer = useCallback(() => {
    setNewTitle('')
    setShowComposer(false)
  }, [])

  const submitNew = () => {
    const draft = {
      title: newTitle,
      freq: newFreq,
      weekdays: newWeekdays,
      timeMode: newTimeMode,
      startTime: newTimeMode === 'none' ? '' : newStartTime,
      endTime: newTimeMode === 'range' ? newEndTime : '',
    }
    if (!canSubmitHabitDraft(draft)) return
    addHabit({
      title: newTitle.trim(),
      color: newColor,
      timeMode: newTimeMode,
      startTime: newTimeMode === 'none' ? null : newStartTime,
      endTime: newTimeMode === 'range' ? newEndTime : null,
      frequency: habitFrequencyFromDraft(draft.freq, draft.weekdays),
    })
    setNewTitle('')
    queueMicrotask(() => newTitleInputRef.current?.focus())
  }

  const saveEdit = () => {
    if (!editingHabitId) return
    const draft = {
      title: editTitle,
      freq: editFreq,
      weekdays: editWeekdays,
      timeMode: editTimeMode,
      startTime: editTimeMode === 'none' ? '' : editStartTime,
      endTime: editTimeMode === 'range' ? editEndTime : '',
    }
    if (!canSubmitHabitDraft(draft)) return
    updateHabit(editingHabitId, {
      title: editTitle.trim(),
      color: editColor,
      timeMode: editTimeMode,
      startTime: editTimeMode === 'none' ? null : editStartTime,
      endTime: editTimeMode === 'range' ? editEndTime : null,
      frequency: habitFrequencyFromDraft(draft.freq, draft.weekdays),
    })
    cancelEdit()
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (typeof window !== 'undefined' && !window.confirm(t('confirm.deleteHabit'))) return
    deleteHabit(id)
    if (editingHabitId === id) cancelEdit()
  }

  const newFormDisabled = !canSubmitHabitDraft({
    title: newTitle,
    freq: newFreq,
    weekdays: newWeekdays,
    timeMode: newTimeMode,
    startTime: newTimeMode === 'none' ? '' : newStartTime,
    endTime: newTimeMode === 'range' ? newEndTime : '',
  })
  const editFormDisabled = !canSubmitHabitDraft({
    title: editTitle,
    freq: editFreq,
    weekdays: editWeekdays,
    timeMode: editTimeMode,
    startTime: editTimeMode === 'none' ? '' : editStartTime,
    endTime: editTimeMode === 'range' ? editEndTime : '',
  })

  const heatmapDays = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const d = subDays(zonedNow(), 27 - i)
        return { key: habitDateKey(d), ratio: completionRatioOnDate(habits, d, habitRecords) }
      }),
    [habits, habitRecords],
  )
  const consistency = useMemo(() => consistencyForLast7Days(habits, habitRecords), [habits, habitRecords])
  const streak = useMemo(() => currentStreakDays(habits, habitRecords), [habits, habitRecords])
  const focusDate = useMemo(
    () => parseISO(`${selectedCalendarDateKey}T12:00:00`),
    [selectedCalendarDateKey],
  )
  const weekDates = useMemo(() => {
    const start = startOfWeek(focusDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [focusDate])
  const todayKey = habitDateKey(zonedNow())
  const habitWeekdayLabels = useMemo(
    () => t('habits.weekdays', { returnObjects: true }) as string[],
    [t],
  )
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const focusDateLabel = format(
    focusDate,
    i18n.resolvedLanguage?.startsWith('ja') ? 'M月d日 (E)' : 'MMM d (E)',
    { locale: dateLocale },
  )
  const isFocusToday = selectedCalendarDateKey === todayKey

  const habitsScheduledForFocus = useMemo(
    () => habits.filter((h) => isHabitScheduledOnDate(h, focusDate)),
    [habits, focusDate],
  )
  const habitsOffFocus = useMemo(
    () => habits.filter((h) => !isHabitScheduledOnDate(h, focusDate)),
    [habits, focusDate],
  )

  const shiftFocusDay = useCallback((delta: number) => {
    setSelectedCalendarDateKey(format(addDays(focusDate, delta), 'yyyy-MM-dd'))
  }, [focusDate, setSelectedCalendarDateKey])

  const goFocusToday = useCallback(() => {
    setSelectedCalendarDateKey(todayKey)
  }, [setSelectedCalendarDateKey, todayKey])
  useNavShortcut({ today: goFocusToday, prev: () => shiftFocusDay(-1), next: () => shiftFocusDay(1) })

  const renderHabitRow = (h: Habit, offDay: boolean) => {
    const isEditing = editingHabitId === h.id
    // 上の要約と同じ定義（直近 7 日、今日は達成済みのときだけ）で揃える
    const weeklyProgress = consistencyForLast7Days([h], habitRecords)
    // 「週に3日」だと回数で数える習慣に読めるので、決めた曜日をそのまま出す（月・水・金）
    const goalText =
      h.frequency.type === 'daily'
        ? t('habits.goalDaily')
        : [...h.frequency.weekdays]
            .sort((a, b) => a - b)
            .map((d) => format(addDays(ISO_MONDAY, d - 1), 'E', { locale: dateLocale }))
            .join(t('habits.weekdaySeparator'))
    const timeText = h.timeMode === 'range' && h.startTime && h.endTime
      ? t('habits.timeRange', { start: h.startTime, end: h.endTime })
      : h.timeMode === 'fixed' && h.startTime
        ? t('habits.timeAtValue', { time: h.startTime })
        : null

    const cardSurface = offDay
      ? 'border-dashed border-zinc-200/90 bg-zinc-50/90 dark:border-zinc-600/80 dark:bg-zinc-950/45'
      : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40'
    const cardTone = offDay ? 'opacity-[0.92] saturate-[0.65]' : ''

    if (isEditing) {
      return (
        <li key={h.id}>
          <div
            className={`overflow-hidden rounded-xl border border-accent-400/60 bg-white dark:border-accent-500/40 dark:bg-zinc-900/40 ${offDay ? 'ring-1 ring-zinc-300/40 dark:ring-zinc-600/40' : ''}`}
          >
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t('habits.editTitle')}</h3>
                <button
                  type="button"
                  onClick={(e) => handleDelete(h.id, e)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0"
                  title={t('common.delete')}
                  aria-label={t('common.delete')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={iconTrash} />
                  </svg>
                </button>
              </div>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.nativeEvent.isComposing) return
                    e.preventDefault()
                    if (!editFormDisabled) saveEdit()
                  }
                  if (e.key === 'Escape') cancelEdit()
                }}
                placeholder={t('habits.nameShort')}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-accent-500/30 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-100"
              />
              <ColorPicker colorIndex={editColorIndex} onPick={setEditColorIndex} />
              <div className="flex gap-6 text-sm">
                <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="edit-habit-frequency"
                    checked={editFreq === 'daily'}
                    onChange={() => setEditFreq('daily')}
                    className="text-accent-500"
                  />
                  {t('habits.freqDaily')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="edit-habit-frequency"
                    checked={editFreq === 'weekly'}
                    onChange={() => setEditFreq('weekly')}
                    className="text-accent-500"
                  />
                  {t('habits.freqWeeklyLabel')}
                </label>
              </div>
              <WeekdayPicker freq={editFreq} weekdays={editWeekdays} onToggle={toggleEditWeekday} />
              <HabitTimeFields
                mode={editTimeMode}
                name="edit-habit"
                startTime={editStartTime}
                endTime={editEndTime}
                onModeChange={setEditTimeMode}
                onStartTimeChange={setEditStartTime}
                onEndTimeChange={setEditEndTime}
              />
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={editFormDisabled}
                  className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-700
                             disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50
                             dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </li>
      )
    }

    return (
      <li key={h.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => beginEdit(h)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              beginEdit(h)
            }
          }}
          className={`group rounded-xl border p-4 transition-colors ${cardSurface} ${cardTone} ${
            offDay ? 'hover:bg-zinc-100/85 dark:hover:bg-zinc-900/50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
          }`}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: offDay ? '#a1a1aa' : h.color }} aria-hidden />
              <div className="min-w-0">
                <p
                  className={`truncate text-base font-semibold tracking-tight ${
                    offDay ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-900 dark:text-zinc-100'
                  }`}
                >
                  {h.title}
                </p>
                <p className={`text-xs ${offDay ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
                  {goalText}
                  {timeText ? ` · ${timeText}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100 dark:bg-zinc-800"
                style={{
                  background: `conic-gradient(${offDay ? '#a1a1aa' : h.color} ${weeklyProgress * 3.6}deg, rgba(148,163,184,0.25) 0deg)`,
                }}
              >
                <div className="grid h-7 w-7 place-items-center rounded-full bg-white text-[10px] font-semibold tabular-nums text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  {weeklyProgress}%
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {weekDates.map((d, di) => {
              const key = habitDateKey(d)
              const isCellToday = key === todayKey
              const isCellFocus = key === selectedCalendarDateKey
              const isScheduled = isHabitScheduledOnDate(h, d)
              const status = habitDayStatus(h, key, habitRecords)
              const isDone = status === 'done'
              const isOffTime = status === 'offTime'
              const record = isOffTime ? habitRecordFor(habitRecords, h, key) : null
              const cellTitle = record
                ? t('habits.offTimeTooltip', { date: key, start: record.startTime, end: record.endTime })
                : key
              // 丸の塗りは達成の色なので、今日は曜日の文字で、選んだ日は枠で示す（カレンダーと同じ藍）
              const ringClass = isCellFocus
                ? 'ring-2 ring-date-400 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900'
                : ''
              return (
                <button
                  key={key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleHabitDate(h.id, key)
                  }}
                  className="flex justify-center"
                  aria-label={cellTitle}
                >
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-full text-sm transition-colors ${
                      isDone
                        ? 'text-white'
                        : isOffTime
                          ? 'border-2 bg-white font-semibold dark:bg-zinc-900'
                          : isScheduled
                            ? 'bg-zinc-300/70 text-zinc-500 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                            : 'bg-zinc-200/55 text-zinc-400 hover:bg-zinc-300/80 dark:bg-zinc-800/70 dark:text-zinc-500 dark:hover:bg-zinc-700'
                    } ${ringClass}`}
                    style={isDone ? { backgroundColor: h.color } : isOffTime ? { borderColor: h.color, color: h.color } : undefined}
                    title={cellTitle}
                  >
                    {isDone ? '✓' : isOffTime ? '△' : <span className={`text-[11px] ${isCellToday ? TODAY_TEXT : ''}`}>{habitWeekdayLabels[di]}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </li>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 pt-4 pb-3 md:px-6 md:pt-8 md:pb-4">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-2xl">{t('habits.title')}</h1>
          <button
            type="button"
            onClick={() => {
              if (showComposer) closeComposer()
              else setShowComposer(true)
            }}
            className={
              showComposer
                ? 'rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
                : 'rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-on-accent transition-colors hover:bg-accent-700'
            }
          >
            {showComposer ? t('common.close') : t('habits.addHabitCta')}
          </button>
        </div>
      </div>

      <div className="space-y-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-8">
        {/* 要約: 数字 2 つと直近 28 日の小さなヒートマップを 1 枚に（以前は画面の半分を占めていた） */}
        {habits.length > 0 && (
          <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:gap-6">
            <dl className="flex shrink-0 gap-6">
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{t('habits.score7d')}</dt>
                <dd className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{consistency}%</dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{t('habits.streakDays')}</dt>
                <dd className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {streak}
                  <span className="ml-0.5 text-sm font-normal text-zinc-500">{t('habits.daySuffix')}</span>
                </dd>
              </div>
            </dl>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[11px] text-zinc-500 dark:text-zinc-400">{t('habits.heatmapTitle')}</p>
              <div className="grid grid-cols-14 gap-1 sm:grid-cols-28" role="img" aria-label={t('habits.heatmapHint')}>
                {heatmapDays.map((d) => (
                  <div
                    key={d.key}
                    className={`h-4 rounded-sm ${d.ratio === 0 ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
                    style={d.ratio === 0 ? undefined : { backgroundColor: `rgba(99, 102, 241, ${0.3 + d.ratio * 0.7})` }}
                    title={t('habits.heatmapTooltip', { date: d.key, pct: Math.round(d.ratio * 100) })}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {showComposer ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <h2 className="mb-4 text-sm font-medium text-zinc-800 dark:text-zinc-200">{t('habits.newHabit')}</h2>
            <div className="space-y-3">
              <input
                ref={newTitleInputRef}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.nativeEvent.isComposing) return
                    e.preventDefault()
                    submitNew()
                  }
                  if (e.key === 'Escape') closeComposer()
                }}
                placeholder={t('habits.placeholderName')}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-accent-500/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <ColorPicker colorIndex={newColorIndex} onPick={setNewColorIndex} />
              <div className="flex gap-6 text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="new-habit-frequency"
                    checked={newFreq === 'daily'}
                    onChange={() => setNewFreq('daily')}
                    className="text-accent-500"
                  />
                  {t('habits.freqDaily')}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="new-habit-frequency"
                    checked={newFreq === 'weekly'}
                    onChange={() => setNewFreq('weekly')}
                    className="text-accent-500"
                  />
                  {t('habits.freqWeeklyLabel')}
                </label>
              </div>
              <WeekdayPicker freq={newFreq} weekdays={newWeekdays} onToggle={toggleNewWeekday} />
              <HabitTimeFields
                mode={newTimeMode}
                name="new-habit"
                startTime={newStartTime}
                endTime={newEndTime}
                onModeChange={setNewTimeMode}
                onStartTimeChange={setNewStartTime}
                onEndTimeChange={setNewEndTime}
              />
              <button
                type="button"
                onClick={submitNew}
                disabled={newFormDisabled}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('common.add')}
              </button>
            </div>
          </div>
        ) : null}

        {habits.length > 0 ? (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('habits.listForDayTitle')}</h2>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-1 items-center justify-center gap-1 sm:justify-start">
                <button
                  type="button"
                  onClick={() => shiftFocusDay(-1)}
                  className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  aria-label={t('habits.prevDayAria')}
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <span className="min-w-[9.5rem] text-center text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {focusDateLabel}
                </span>
                <button
                  type="button"
                  onClick={() => shiftFocusDay(1)}
                  className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  aria-label={t('habits.nextDayAria')}
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
              <button
                type="button"
                onClick={goFocusToday}
                disabled={isFocusToday}
                className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {t('common.today')}
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {weekDates.map((d, i) => {
                const key = habitDateKey(d)
                const isColToday = key === todayKey
                const isColFocus = key === selectedCalendarDateKey
                const labelTone = isColToday || isColFocus ? '' : 'text-zinc-400 dark:text-zinc-500'
                const headerDateShort = format(d, i18n.resolvedLanguage?.startsWith('ja') ? 'M/d' : 'MMM d', {
                  locale: dateLocale,
                })
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedCalendarDateKey(key)}
                    aria-label={t('habits.focusColumnAria', { date: headerDateShort })}
                    aria-current={isColFocus ? 'date' : undefined}
                    className={`w-full rounded-md py-1.5 text-center text-[10px] font-medium transition-colors hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 ${labelTone}`}
                  >
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 ${dayMarkerClass({ today: isColToday, selected: isColFocus })}`}
                    >
                      {habitWeekdayLabels[i]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <ul className="space-y-3">
        {habits.length === 0 && (
          <p className="py-4 text-sm text-zinc-400 dark:text-zinc-500">
            {t('habits.empty', { add: t('habits.addHabit') })}
          </p>
        )}
        {habits.length > 0 && habitsScheduledForFocus.length === 0 && habitsOffFocus.length > 0 && (
          <p className="py-2 text-sm text-zinc-400 dark:text-zinc-500">{t('habits.noneScheduledForDay')}</p>
        )}
        {habitsScheduledForFocus.map((h) => renderHabitRow(h, false))}
        {habitsOffFocus.length > 0 && habitsScheduledForFocus.length > 0 ? (
          <li className="list-none">
            <div className="pt-4 pb-1">
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('habits.offDaySectionTitle')}</h3>
            </div>
          </li>
        ) : null}
        {habitsOffFocus.map((h) => renderHabitRow(h, true))}
        </ul>
      </div>
    </div>
  )
}
