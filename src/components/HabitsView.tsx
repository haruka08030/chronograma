import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, startOfWeek, subDays } from 'date-fns'
import { useTaskStore, paletteColors } from '../store/taskStore'
import type { Habit, HabitWeekday } from '../types/habit'
import {
  canSubmitHabitDraft,
  habitFrequencyFromDraft,
  toggleHabitWeekdaySelection,
} from '../lib/habitDraft'
import {
  colorIndexForPalette,
  habitDateKey,
  isHabitScheduledOnDate,
  completionRatioOnDate,
  completionsInLast7Days,
  consistencyForLast7Days,
  currentStreakDays,
} from '../lib/habitStats'

const HABIT_WEEKDAY_ORDER: HabitWeekday[] = [1, 2, 3, 4, 5, 6, 7]

const DEFAULT_WEEKDAYS: HabitWeekday[] = [1, 2, 3, 4, 5]
const HABIT_ICONS = [
  'M12 2.25c3.176 0 5.75 2.574 5.75 5.75 0 4.313-4.448 8.033-5.75 11.75C10.698 16.033 6.25 12.313 6.25 8c0-3.176 2.574-5.75 5.75-5.75zm0 3.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z',
  'M15.182 3.318a.75.75 0 011.06 0l4.44 4.44a.75.75 0 010 1.06l-8.03 8.03a3 3 0 01-1.289.744l-3.35.96a.75.75 0 01-.928-.928l.96-3.35a3 3 0 01.744-1.288l8.03-8.03zM5.25 19.5A1.5 1.5 0 006.75 21h10.5a1.5 1.5 0 000-3h-10.5a1.5 1.5 0 00-1.5 1.5z',
  'M4.5 4.5h6v6h-6v-6zm9 0h6v6h-6v-6zm-9 9h6v6h-6v-6zm9 1.5h6M16.5 12v6',
]

const iconPencil = 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10'
const iconTrash = 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0'

function ColorPicker({
  listColors,
  colorIndex,
  onPick,
}: {
  listColors: readonly string[]
  colorIndex: number
  onPick: (i: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('habits.color')}</span>
      {listColors.map((c, i) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(i)}
          className={`w-7 h-7 rounded-full ring-2 transition-shadow ${colorIndex === i ? 'ring-accent-500 ring-offset-2 dark:ring-offset-zinc-900' : 'ring-transparent hover:ring-zinc-300 dark:hover:ring-zinc-600'}`}
          style={{ backgroundColor: c }}
          aria-label={t('habits.colorSwatch', { n: i + 1 })}
        />
      ))}
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
              ? 'bg-accent-500 text-white'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
        >
          {labels[v - 1]}
        </button>
      ))}
    </div>
  )
}

export function HabitsView() {
  const { t } = useTranslation()
  const habits = useTaskStore((s) => s.habits)
  const addHabit = useTaskStore((s) => s.addHabit)
  const updateHabit = useTaskStore((s) => s.updateHabit)
  const deleteHabit = useTaskStore((s) => s.deleteHabit)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const listColorPaletteId = useTaskStore((s) => s.listColorPaletteId)
  const listColors = useMemo(() => paletteColors(listColorPaletteId), [listColorPaletteId])

  const [newTitle, setNewTitle] = useState('')
  const [newFreq, setNewFreq] = useState<'daily' | 'weekly'>('daily')
  const [newWeekdays, setNewWeekdays] = useState<HabitWeekday[]>(DEFAULT_WEEKDAYS)
  const [newHasTime, setNewHasTime] = useState(true)
  const [newStartTime, setNewStartTime] = useState('09:00')
  const [newEndTime, setNewEndTime] = useState('10:00')
  const [newColorIndex, setNewColorIndex] = useState(4)
  const newColor = listColors[Math.min(newColorIndex, listColors.length - 1)] ?? listColors[0]

  const [editingHabitId, setEditingHabitId] = useState<string | null>(null)
  const [showComposer, setShowComposer] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editFreq, setEditFreq] = useState<'daily' | 'weekly'>('daily')
  const [editWeekdays, setEditWeekdays] = useState<HabitWeekday[]>(DEFAULT_WEEKDAYS)
  const [editHasTime, setEditHasTime] = useState(true)
  const [editStartTime, setEditStartTime] = useState('09:00')
  const [editEndTime, setEditEndTime] = useState('10:00')
  const [editColorIndex, setEditColorIndex] = useState(4)
  const editColor = listColors[Math.min(editColorIndex, listColors.length - 1)] ?? listColors[0]

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
      setEditHasTime(Boolean(h.startTime && h.endTime))
      setEditStartTime(h.startTime ?? '09:00')
      setEditEndTime(h.endTime ?? '10:00')
      setEditColorIndex(colorIndexForPalette(h.color, listColors))
    },
    [listColors],
  )

  useEffect(() => {
    if (!editingHabitId || habits.some((h) => h.id === editingHabitId)) return
    queueMicrotask(() => {
      cancelEdit()
    })
  }, [habits, editingHabitId, cancelEdit])

  const toggleNewWeekday = (v: HabitWeekday) => {
    setNewWeekdays((prev) => toggleHabitWeekdaySelection(prev, v))
  }

  const toggleEditWeekday = (v: HabitWeekday) => {
    setEditWeekdays((prev) => toggleHabitWeekdaySelection(prev, v))
  }

  const submitNew = () => {
    const draft = {
      title: newTitle,
      freq: newFreq,
      weekdays: newWeekdays,
      startTime: newHasTime ? newStartTime : '',
      endTime: newHasTime ? newEndTime : '',
    }
    if (!canSubmitHabitDraft(draft)) return
    addHabit({
      title: newTitle.trim(),
      color: newColor,
      startTime: newHasTime ? newStartTime : null,
      endTime: newHasTime ? newEndTime : null,
      frequency: habitFrequencyFromDraft(draft.freq, draft.weekdays),
    })
    setNewTitle('')
  }

  const saveEdit = () => {
    if (!editingHabitId) return
    const draft = {
      title: editTitle,
      freq: editFreq,
      weekdays: editWeekdays,
      startTime: editHasTime ? editStartTime : '',
      endTime: editHasTime ? editEndTime : '',
    }
    if (!canSubmitHabitDraft(draft)) return
    updateHabit(editingHabitId, {
      title: editTitle.trim(),
      color: editColor,
      startTime: editHasTime ? editStartTime : null,
      endTime: editHasTime ? editEndTime : null,
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
    startTime: newHasTime ? newStartTime : '',
    endTime: newHasTime ? newEndTime : '',
  })
  const editFormDisabled = !canSubmitHabitDraft({
    title: editTitle,
    freq: editFreq,
    weekdays: editWeekdays,
    startTime: editHasTime ? editStartTime : '',
    endTime: editHasTime ? editEndTime : '',
  })

  const heatmapDays = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const d = subDays(new Date(), 27 - i)
        return { key: habitDateKey(d), ratio: completionRatioOnDate(habits, d) }
      }),
    [habits],
  )
  const consistency = useMemo(() => consistencyForLast7Days(habits), [habits])
  const streak = useMemo(() => currentStreakDays(habits), [habits])
  const weekDates = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [])
  const todayKey = habitDateKey(new Date())
  const habitWeekdayLabels = useMemo(
    () => t('habits.weekdays', { returnObjects: true }) as string[],
    [t],
  )

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{t('habits.title')}</h1>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{t('habits.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowComposer((v) => !v)}
            className={
              showComposer
                ? 'rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
                : 'rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-700'
            }
          >
            {showComposer ? t('common.close') : t('habits.addHabitCta')}
          </button>
        </div>
      </div>

      <div className="space-y-4 px-6 pb-8">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('habits.heatmapTitle')}</h2>
          <div className="grid grid-cols-7 gap-2">
            {heatmapDays.map((d) => {
              const intensity = d.ratio === 0 ? 0.12 : 0.35 + d.ratio * 0.6
              return (
                <div
                  key={d.key}
                  className="h-9 w-full rounded-md border border-zinc-100 dark:border-zinc-800 sm:h-10"
                  style={{ backgroundColor: `rgba(99, 102, 241, ${intensity})` }}
                  title={t('habits.heatmapTooltip', { date: d.key, pct: Math.round(d.ratio * 100) })}
                />
              )
            })}
          </div>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{t('habits.heatmapHint')}</p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="mb-1 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{t('habits.score7d')}</p>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100">{consistency}%</p>
          </div>
          <div className="rounded-xl border border-accent-300/60 bg-accent-500 p-4 text-white dark:border-accent-500/40 dark:bg-accent-600">
            <p className="mb-1 text-[11px] font-medium text-white/80">{t('habits.streakDays')}</p>
            <p className="text-3xl font-bold tabular-nums tracking-tight">
              {streak}
              <span className="ml-0.5 text-lg font-medium">{t('habits.daySuffix')}</span>
            </p>
          </div>
        </section>

        {showComposer ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <h2 className="mb-4 text-sm font-medium text-zinc-800 dark:text-zinc-200">{t('habits.newHabit')}</h2>
            <div className="space-y-3">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !newFormDisabled) submitNew()
                }}
                placeholder={t('habits.placeholderName')}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-accent-500/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <ColorPicker listColors={listColors} colorIndex={newColorIndex} onPick={setNewColorIndex} />
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
              <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={newHasTime}
                  onChange={(e) => setNewHasTime(e.target.checked)}
                  className="text-accent-500"
                />
                {t('habits.enableTimeRange')}
              </label>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('habits.time')}</span>
                <input
                  type="time"
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                  disabled={!newHasTime}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <span className="text-zinc-400">〜</span>
                <input
                  type="time"
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  disabled={!newHasTime}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <button
                type="button"
                onClick={submitNew}
                disabled={newFormDisabled}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('common.add')}
              </button>
            </div>
          </div>
        ) : null}

        <ul className="space-y-3">
        {habits.length === 0 && (
          <p className="py-4 text-sm text-zinc-400 dark:text-zinc-500">
            {t('habits.empty', { add: t('habits.addHabit') })}
          </p>
        )}
        {habits.map((h) => {
          const last7 = completionsInLast7Days(h.completedDates)
          const isEditing = editingHabitId === h.id
          const icon = HABIT_ICONS[Math.abs(h.id.charCodeAt(0)) % HABIT_ICONS.length]
          const completedSet = new Set(h.completedDates)
          const weeklyExpected = weekDates.filter((d) => isHabitScheduledOnDate(h, d)).length
          const weeklyDone = weekDates.filter((d) => completedSet.has(habitDateKey(d))).length
          const weeklyProgress = weeklyExpected > 0 ? Math.round((weeklyDone / weeklyExpected) * 100) : 0
          const goalText =
            h.frequency.type === 'daily'
              ? t('habits.goalDaily')
              : t('habits.goalWeekly', { count: h.frequency.weekdays.length })
          const timeText =
            h.startTime && h.endTime ? t('habits.timeRange', { start: h.startTime, end: h.endTime }) : null

          if (isEditing) {
            return (
              <li key={h.id}>
                <div
                  className="overflow-hidden rounded-xl border border-accent-400/60 bg-white dark:border-accent-500/40 dark:bg-zinc-900/40"
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
                        if (e.key === 'Enter' && !editFormDisabled) saveEdit()
                      }}
                      placeholder={t('habits.nameShort')}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-accent-500/30 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-100"
                    />
                    <ColorPicker listColors={listColors} colorIndex={editColorIndex} onPick={setEditColorIndex} />
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
                    <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={editHasTime}
                        onChange={(e) => setEditHasTime(e.target.checked)}
                        className="text-accent-500"
                      />
                      {t('habits.enableTimeRange')}
                    </label>
                    <div className="flex flex-wrap gap-3 items-center text-sm">
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('habits.time')}</span>
                      <input
                        type="time"
                        value={editStartTime}
                        onChange={(e) => setEditStartTime(e.target.value)}
                        disabled={!editHasTime}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-100"
                      />
                      <span className="text-zinc-400">〜</span>
                      <input
                        type="time"
                        value={editEndTime}
                        onChange={(e) => setEditEndTime(e.target.value)}
                        disabled={!editHasTime}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-100"
                      />
                    </div>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      {t('habits.editNote', { count: last7 })}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={editFormDisabled}
                        className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700
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
                title={t('habits.cardEditHint')}
                onClick={() => beginEdit(h)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    beginEdit(h)
                  }
                }}
                className="group rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-800/40"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke={h.color} strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{h.title}</p>
                      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{goalText}</p>
                      {timeText ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{timeText}</p> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="grid h-12 w-12 place-items-center rounded-full bg-zinc-100 dark:bg-zinc-800"
                      style={{
                        background: `conic-gradient(${h.color} ${weeklyProgress * 3.6}deg, rgba(148,163,184,0.25) 0deg)`,
                      }}
                    >
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-xs font-semibold tabular-nums text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                        {weeklyProgress}%
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        beginEdit(h)
                      }}
                      className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                      title={t('common.edit')}
                      aria-label={t('common.edit')}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d={iconPencil} />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(h.id, e)}
                      className="p-2 rounded-lg text-zinc-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title={t('common.delete')}
                      aria-label={t('common.delete')}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d={iconTrash} />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {weekDates.map((d, i) => {
                    const key = habitDateKey(d)
                    const isToday = key === todayKey
                    const isScheduled = isHabitScheduledOnDate(h, d)
                    const isDone = completedSet.has(key)
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={!isScheduled}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!isScheduled) return
                          toggleHabitDate(h.id, key)
                        }}
                        className="flex flex-col items-center gap-1 disabled:cursor-default"
                      >
                        <span
                          className={`text-[10px] font-medium ${
                            isToday
                              ? 'text-accent-600 dark:text-accent-300'
                              : 'text-zinc-400 dark:text-zinc-500'
                          }`}
                        >
                          {habitWeekdayLabels[i]}
                        </span>
                        <span
                          className={`grid h-9 w-9 place-items-center rounded-full text-sm transition-colors ${
                            isDone
                              ? 'bg-accent-600 text-white'
                              : isScheduled
                                ? 'bg-zinc-300/70 text-zinc-500 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                                : 'bg-zinc-200/70 text-zinc-300 dark:bg-zinc-800 dark:text-zinc-700'
                          } ${isToday ? 'ring-2 ring-accent-300 dark:ring-accent-500/60' : ''}`}
                          title={key}
                        >
                          {isDone ? '✓' : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {t('habits.weekProgress', { count: last7 })}
                </p>
              </div>
            </li>
          )
        })}
        </ul>
      </div>
    </div>
  )
}
