import { useState, useMemo, useEffect, useCallback } from 'react'
import { subDays, format } from 'date-fns'
import { useTaskStore, paletteColors } from '../store/taskStore'
import type { Habit, HabitWeekday } from '../types/habit'

const WEEKDAYS: { v: HabitWeekday; label: string }[] = [
  { v: 1, label: '月' },
  { v: 2, label: '火' },
  { v: 3, label: '水' },
  { v: 4, label: '木' },
  { v: 5, label: '金' },
  { v: 6, label: '土' },
  { v: 7, label: '日' },
]

const DEFAULT_WEEKDAYS: HabitWeekday[] = [1, 2, 3, 4, 5]

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

const iconPencil = 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10'
const iconTrash = 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0'

export function HabitsView() {
  const habits = useTaskStore((s) => s.habits)
  const addHabit = useTaskStore((s) => s.addHabit)
  const updateHabit = useTaskStore((s) => s.updateHabit)
  const deleteHabit = useTaskStore((s) => s.deleteHabit)
  const listColorPaletteId = useTaskStore((s) => s.listColorPaletteId)
  const listColors = useMemo(() => paletteColors(listColorPaletteId), [listColorPaletteId])

  const [editingHabitId, setEditingHabitId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [freq, setFreq] = useState<'daily' | 'weekly'>('daily')
  const [weekdays, setWeekdays] = useState<HabitWeekday[]>(DEFAULT_WEEKDAYS)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [colorIndex, setColorIndex] = useState(4)
  const color = listColors[Math.min(colorIndex, listColors.length - 1)] ?? listColors[0]

  const resetFormToNew = useCallback(() => {
    setEditingHabitId(null)
    setTitle('')
    setFreq('daily')
    setWeekdays(DEFAULT_WEEKDAYS)
    setStartTime('09:00')
    setEndTime('10:00')
    setColorIndex(Math.min(4, listColors.length - 1))
  }, [listColors.length])

  const beginEdit = useCallback(
    (h: Habit) => {
      setEditingHabitId(h.id)
      setTitle(h.title)
      if (h.frequency.type === 'daily') {
        setFreq('daily')
        setWeekdays(DEFAULT_WEEKDAYS)
      } else {
        setFreq('weekly')
        setWeekdays([...h.frequency.weekdays].sort((a, b) => a - b))
      }
      setStartTime(h.startTime ?? '09:00')
      setEndTime(h.endTime ?? '10:00')
      setColorIndex(colorIndexForPalette(h.color, listColors))
    },
    [listColors],
  )

  useEffect(() => {
    if (!editingHabitId || habits.some((h) => h.id === editingHabitId)) return
    queueMicrotask(() => {
      resetFormToNew()
    })
  }, [habits, editingHabitId, resetFormToNew])

  const toggleWeekday = (v: HabitWeekday) => {
    setWeekdays((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => a - b),
    )
  }

  const submit = () => {
    const t = title.trim()
    if (!t) return
    if (freq === 'weekly' && weekdays.length === 0) return
    if (startTime >= endTime) return

    const payload = {
      title: t,
      color,
      startTime,
      endTime,
      frequency: freq === 'daily' ? ({ type: 'daily' } as const) : ({ type: 'weekly', weekdays } as const),
    }

    if (editingHabitId) {
      updateHabit(editingHabitId, payload)
      resetFormToNew()
    } else {
      addHabit(payload)
      setTitle('')
    }
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (typeof window !== 'undefined' && !window.confirm('この習慣を削除しますか？')) return
    deleteHabit(id)
    if (editingHabitId === id) resetFormToNew()
  }

  const formDisabled = !title.trim() || (freq === 'weekly' && weekdays.length === 0) || startTime >= endTime

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-1">習慣</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 leading-relaxed">
        予定 vs ログの左列に、習慣の時間帯が表示されます。達成は予定ブロックのチェックで記録できます。
      </p>

      <div
        className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm p-5 mb-8 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {editingHabitId ? '習慣を編集' : '新規習慣'}
          </h2>
          {editingHabitId && (
            <button
              type="button"
              onClick={resetFormToNew}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              キャンセル
            </button>
          )}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !formDisabled) submit()
          }}
          placeholder="名前（例: 朝のストレッチ）"
          className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700
                     text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-accent-500/30"
        />
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">色</span>
          {listColors.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() => setColorIndex(i)}
              className={`w-7 h-7 rounded-full ring-2 transition-shadow ${colorIndex === i ? 'ring-accent-500 ring-offset-2 dark:ring-offset-zinc-900' : 'ring-transparent hover:ring-zinc-300 dark:hover:ring-zinc-600'}`}
              style={{ backgroundColor: c }}
              aria-label={`色 ${i + 1}`}
            />
          ))}
        </div>
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="frequency"
              checked={freq === 'daily'}
              onChange={() => setFreq('daily')}
              className="text-accent-500"
            />
            毎日
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="frequency"
              checked={freq === 'weekly'}
              onChange={() => setFreq('weekly')}
              className="text-accent-500"
            />
            週指定
          </label>
        </div>
        {freq === 'weekly' && (
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => toggleWeekday(v)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${weekdays.includes(v)
                    ? 'bg-accent-500 text-white shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">時間</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
          />
          <span className="text-zinc-400">〜</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={submit}
            disabled={formDisabled}
            className="px-4 py-2 rounded-xl bg-accent-500 text-white text-sm font-medium hover:bg-accent-600
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {editingHabitId ? '保存' : '追加'}
          </button>
        </div>
      </div>

      <ul className="space-y-2.5">
        {habits.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 py-4">まだ習慣がありません。</p>
        )}
        {habits.map((h) => {
          const last7 = completionsInLast7Days(h.completedDates)
          const isEditing = editingHabitId === h.id
          return (
            <li key={h.id}>
              <div
                role="button"
                tabIndex={0}
                title="クリックして編集"
                onClick={() => beginEdit(h)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    beginEdit(h)
                  }
                }}
                className={`group flex items-stretch gap-0 rounded-2xl border bg-white dark:bg-zinc-900/40 shadow-sm transition-colors cursor-pointer
                  ${isEditing
                    ? 'border-accent-400/60 ring-1 ring-accent-500/20 dark:border-accent-500/40'
                    : 'border-zinc-200/90 dark:border-zinc-800 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40'}`}
              >
                <div
                  className="w-1.5 shrink-0 rounded-l-2xl self-stretch min-h-[3.5rem]"
                  style={{ backgroundColor: h.color }}
                  aria-hidden
                />
                <div className="flex flex-1 min-w-0 items-center gap-3 pl-3 pr-2 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[15px] text-zinc-900 dark:text-zinc-100 truncate leading-snug">
                      {h.title}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                      {h.frequency.type === 'daily'
                        ? '毎日'
                        : `週: ${h.frequency.weekdays.map((d) => WEEKDAYS.find((x) => x.v === d)?.label).join('・')}`}
                      {h.startTime && h.endTime && ` · ${h.startTime}–${h.endTime}`}
                      <span className="text-zinc-400 dark:text-zinc-500"> · 直近7日 {last7} 回</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100">
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
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
