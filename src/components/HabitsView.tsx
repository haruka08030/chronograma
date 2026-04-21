import { useState, useMemo, useEffect, useCallback } from 'react'
import { addDays, format, getISODay, getISOWeek, startOfWeek, subDays } from 'date-fns'
import { useTaskStore, paletteColors } from '../store/taskStore'
import type { Habit, HabitWeekday } from '../types/habit'

const WEEKDAYS: { v: HabitWeekday; label: string }[] = [
  { v: 1, label: 'M' },
  { v: 2, label: 'T' },
  { v: 3, label: 'W' },
  { v: 4, label: 'T' },
  { v: 5, label: 'F' },
  { v: 6, label: 'S' },
  { v: 7, label: 'S' },
]

const DEFAULT_WEEKDAYS: HabitWeekday[] = [1, 2, 3, 4, 5]
const HABIT_ICONS = [
  'M12 2.25c3.176 0 5.75 2.574 5.75 5.75 0 4.313-4.448 8.033-5.75 11.75C10.698 16.033 6.25 12.313 6.25 8c0-3.176 2.574-5.75 5.75-5.75zm0 3.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z',
  'M15.182 3.318a.75.75 0 011.06 0l4.44 4.44a.75.75 0 010 1.06l-8.03 8.03a3 3 0 01-1.289.744l-3.35.96a.75.75 0 01-.928-.928l.96-3.35a3 3 0 01.744-1.288l8.03-8.03zM5.25 19.5A1.5 1.5 0 006.75 21h10.5a1.5 1.5 0 000-3h-10.5a1.5 1.5 0 00-1.5 1.5z',
  'M4.5 4.5h6v6h-6v-6zm9 0h6v6h-6v-6zm-9 9h6v6h-6v-6zm9 1.5h6M16.5 12v6',
]

function colorIndexForPalette(habitColor: string, listColors: readonly string[]): number {
  const normalized = habitColor.trim().toLowerCase()
  const i = listColors.findIndex((c) => c.trim().toLowerCase() === normalized)
  return i >= 0 ? i : Math.min(4, listColors.length - 1)
}

function completionsInLast7Days(completedDates: string[]): number {
  const set = new Set(completedDates)
  let n = 0
  const today = new Date()
  for (let i = 0; i < 7; i++) {
    const key = format(subDays(today, i), 'yyyy-MM-dd')
    if (set.has(key)) n++
  }
  return n
}

function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function isHabitScheduledOnDate(habit: Habit, d: Date): boolean {
  if (habit.frequency.type === 'daily') return true
  const weekday = getISODay(d) as HabitWeekday
  return habit.frequency.weekdays.includes(weekday)
}

function completionRatioOnDate(habits: Habit[], d: Date): number {
  if (habits.length === 0) return 0
  const key = dateKey(d)
  let expected = 0
  let completed = 0
  for (const h of habits) {
    if (!isHabitScheduledOnDate(h, d)) continue
    expected++
    if (h.completedDates.includes(key)) completed++
  }
  if (expected === 0) return 0
  return completed / expected
}

function consistencyForLast7Days(habits: Habit[]): number {
  let expected = 0
  let completed = 0
  for (let i = 0; i < 7; i++) {
    const d = subDays(new Date(), i)
    const key = dateKey(d)
    for (const h of habits) {
      if (!isHabitScheduledOnDate(h, d)) continue
      expected++
      if (h.completedDates.includes(key)) completed++
    }
  }
  if (expected === 0) return 0
  return Math.round((completed / expected) * 100)
}

function currentStreakDays(habits: Habit[]): number {
  if (habits.length === 0) return 0
  const anyCompletion = new Set(habits.flatMap((h) => h.completedDates))
  let streak = 0
  for (let i = 0; i < 1200; i++) {
    const key = dateKey(subDays(new Date(), i))
    if (!anyCompletion.has(key)) break
    streak++
  }
  return streak
}

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
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">色</span>
      {listColors.map((c, i) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(i)}
          className={`w-7 h-7 rounded-full ring-2 transition-shadow ${colorIndex === i ? 'ring-accent-500 ring-offset-2 dark:ring-offset-zinc-900' : 'ring-transparent hover:ring-zinc-300 dark:hover:ring-zinc-600'}`}
          style={{ backgroundColor: c }}
          aria-label={`色 ${i + 1}`}
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
  if (freq !== 'weekly') return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map(({ v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onToggle(v)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
            ${weekdays.includes(v)
              ? 'bg-accent-500 text-white'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function HabitsView() {
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
  const [newStartTime, setNewStartTime] = useState('09:00')
  const [newEndTime, setNewEndTime] = useState('10:00')
  const [newColorIndex, setNewColorIndex] = useState(4)
  const newColor = listColors[Math.min(newColorIndex, listColors.length - 1)] ?? listColors[0]

  const [editingHabitId, setEditingHabitId] = useState<string | null>(null)
  const [showComposer, setShowComposer] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editFreq, setEditFreq] = useState<'daily' | 'weekly'>('daily')
  const [editWeekdays, setEditWeekdays] = useState<HabitWeekday[]>(DEFAULT_WEEKDAYS)
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
    setNewWeekdays((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => a - b),
    )
  }

  const toggleEditWeekday = (v: HabitWeekday) => {
    setEditWeekdays((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => a - b),
    )
  }

  const submitNew = () => {
    const t = newTitle.trim()
    if (!t) return
    if (newFreq === 'weekly' && newWeekdays.length === 0) return
    if (newStartTime >= newEndTime) return
    addHabit({
      title: t,
      color: newColor,
      startTime: newStartTime,
      endTime: newEndTime,
      frequency: newFreq === 'daily' ? { type: 'daily' } : { type: 'weekly', weekdays: newWeekdays },
    })
    setNewTitle('')
  }

  const saveEdit = () => {
    if (!editingHabitId) return
    const t = editTitle.trim()
    if (!t) return
    if (editFreq === 'weekly' && editWeekdays.length === 0) return
    if (editStartTime >= editEndTime) return
    updateHabit(editingHabitId, {
      title: t,
      color: editColor,
      startTime: editStartTime,
      endTime: editEndTime,
      frequency: editFreq === 'daily' ? { type: 'daily' } : { type: 'weekly', weekdays: editWeekdays },
    })
    cancelEdit()
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (typeof window !== 'undefined' && !window.confirm('この習慣を削除しますか？')) return
    deleteHabit(id)
    if (editingHabitId === id) cancelEdit()
  }

  const newFormDisabled =
    !newTitle.trim() || (newFreq === 'weekly' && newWeekdays.length === 0) || newStartTime >= newEndTime
  const editFormDisabled =
    !editTitle.trim() || (editFreq === 'weekly' && editWeekdays.length === 0) || editStartTime >= editEndTime

  const heatmapDays = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const d = subDays(new Date(), 27 - i)
        return { key: dateKey(d), ratio: completionRatioOnDate(habits, d) }
      }),
    [habits],
  )
  const consistency = useMemo(() => consistencyForLast7Days(habits), [habits])
  const streak = useMemo(() => currentStreakDays(habits), [habits])
  const weekIndex = getISOWeek(new Date())
  const weekDates = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">習慣</h1>
          <button
            type="button"
            onClick={() => setShowComposer((v) => !v)}
            className="rounded-full bg-accent-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-accent-700"
          >
            {showComposer ? 'Close' : 'Add Habit'}
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl px-6 pb-8">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.18em] text-zinc-800 dark:text-zinc-200">
            Master View
          </p>
          <div className="grid grid-cols-14 gap-2">
            {heatmapDays.map((d) => {
              const intensity = d.ratio === 0 ? 0.12 : 0.35 + d.ratio * 0.6
              return (
                <div
                  key={d.key}
                  className="h-8 rounded-md border border-zinc-100 dark:border-zinc-800"
                  style={{ backgroundColor: `rgba(99, 102, 241, ${intensity})` }}
                  title={`${d.key}: ${Math.round(d.ratio * 100)}%`}
                />
              )
            })}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Last 28 Days Kinetic Load</p>
            <button
              type="button"
              onClick={() => setShowComposer(true)}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              Expand
            </button>
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-600">Week {weekIndex}</p>
            <p className="text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">{consistency}%</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Consistency Score
            </p>
          </div>
          <div className="rounded-2xl border border-accent-300/60 bg-accent-500 p-5 text-white dark:border-accent-500/40 dark:bg-accent-600">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/80">Hot Streak</p>
            <p className="text-5xl font-black tracking-tight">{streak}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-white/80">Days Completed</p>
          </div>
        </section>

        {showComposer ? (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">New Habit</h2>
            <div className="space-y-3">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !newFormDisabled) submitNew()
                }}
                placeholder="名前（例: 朝のストレッチ）"
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
                  毎日
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="new-habit-frequency"
                    checked={newFreq === 'weekly'}
                    onChange={() => setNewFreq('weekly')}
                    className="text-accent-500"
                  />
                  週指定
                </label>
              </div>
              <WeekdayPicker freq={newFreq} weekdays={newWeekdays} onToggle={toggleNewWeekday} />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">時間</span>
                <input
                  type="time"
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <span className="text-zinc-400">〜</span>
                <input
                  type="time"
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <button
                type="button"
                onClick={submitNew}
                disabled={newFormDisabled}
                className="rounded-full bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                追加
              </button>
            </div>
          </div>
        ) : null}

        <ul className="mt-4 space-y-3">
        {habits.length === 0 && (
          <p className="py-4 text-sm text-zinc-400 dark:text-zinc-500">まだ習慣がありません。右上の Add Habit から作成できます。</p>
        )}
        {habits.map((h) => {
          const last7 = completionsInLast7Days(h.completedDates)
          const isEditing = editingHabitId === h.id
          const icon = HABIT_ICONS[Math.abs(h.id.charCodeAt(0)) % HABIT_ICONS.length]
          const completedSet = new Set(h.completedDates)
          const weeklyExpected = weekDates.filter((d) => isHabitScheduledOnDate(h, d)).length
          const weeklyDone = weekDates.filter((d) => completedSet.has(dateKey(d))).length
          const weeklyProgress = weeklyExpected > 0 ? Math.round((weeklyDone / weeklyExpected) * 100) : 0
          const goalText = h.frequency.type === 'daily' ? 'Goal: Every day' : `Goal: ${h.frequency.weekdays.length} days / week`
          const timeText = h.startTime && h.endTime ? `${h.startTime} - ${h.endTime}` : null

          if (isEditing) {
            return (
              <li key={h.id}>
                <div
                  className="overflow-hidden rounded-2xl border border-accent-400/60 bg-white dark:border-accent-500/40 dark:bg-zinc-900/40"
                >
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">この習慣を編集</h3>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(h.id, e)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0"
                        title="削除"
                        aria-label="削除"
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
                      placeholder="名前"
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
                        毎日
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
                        <input
                          type="radio"
                          name="edit-habit-frequency"
                          checked={editFreq === 'weekly'}
                          onChange={() => setEditFreq('weekly')}
                          className="text-accent-500"
                        />
                        週指定
                      </label>
                    </div>
                    <WeekdayPicker freq={editFreq} weekdays={editWeekdays} onToggle={toggleEditWeekday} />
                    <div className="flex flex-wrap gap-3 items-center text-sm">
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">時間</span>
                      <input
                        type="time"
                        value={editStartTime}
                        onChange={(e) => setEditStartTime(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                      />
                      <span className="text-zinc-400">〜</span>
                      <input
                        type="time"
                        value={editEndTime}
                        onChange={(e) => setEditEndTime(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">直近7日 {last7} 回達成（保存後も履歴はそのまま）</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={editFormDisabled}
                        className="px-4 py-2 rounded-xl bg-accent-500 text-white text-sm font-medium hover:bg-accent-600
                                   disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-600 text-sm font-medium text-zinc-700 dark:text-zinc-300
                                   hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        キャンセル
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
                title="クリックしてこのカードで編集"
                onClick={() => beginEdit(h)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    beginEdit(h)
                  }
                }}
                className="group rounded-2xl border border-zinc-200 bg-white p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-800/40"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke={h.color} strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">{h.title}</p>
                      <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{goalText}</p>
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
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-xs font-bold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
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
                      title="編集"
                      aria-label="編集"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d={iconPencil} />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(h.id, e)}
                      className="p-2 rounded-lg text-zinc-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="削除"
                      aria-label="削除"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d={iconTrash} />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {weekDates.map((d, i) => {
                    const key = dateKey(d)
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
                        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">{WEEKDAYS[i]?.label}</span>
                        <span
                          className={`grid h-9 w-9 place-items-center rounded-full text-sm transition-colors ${
                            isDone
                              ? 'bg-accent-600 text-white'
                              : isScheduled
                                ? 'bg-zinc-300/70 text-zinc-500 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                                : 'bg-zinc-200/70 text-zinc-300 dark:bg-zinc-800 dark:text-zinc-700'
                          }`}
                          title={key}
                        >
                          {isDone ? '✓' : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">直近7日: {last7} 回達成</p>
              </div>
            </li>
          )
        })}
        </ul>
      </div>
    </div>
  )
}
