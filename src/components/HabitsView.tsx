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
              ? 'bg-accent-500 text-white shadow-sm'
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

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-1">習慣</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 leading-relaxed">
        予定 vs ログの左列に、習慣の時間帯が表示されます。達成は予定ブロックのチェックで記録できます。既存の習慣は各カードで編集できます。
      </p>

      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm p-5 mb-8 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">新規習慣</h2>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !newFormDisabled) submitNew()
          }}
          placeholder="名前（例: 朝のストレッチ）"
          className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700
                     text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-accent-500/30"
        />
        <ColorPicker listColors={listColors} colorIndex={newColorIndex} onPick={setNewColorIndex} />
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="new-habit-frequency"
              checked={newFreq === 'daily'}
              onChange={() => setNewFreq('daily')}
              className="text-accent-500"
            />
            毎日
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300">
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
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">時間</span>
          <input
            type="time"
            value={newStartTime}
            onChange={(e) => setNewStartTime(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
          />
          <span className="text-zinc-400">〜</span>
          <input
            type="time"
            value={newEndTime}
            onChange={(e) => setNewEndTime(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={submitNew}
            disabled={newFormDisabled}
            className="px-4 py-2 rounded-xl bg-accent-500 text-white text-sm font-medium hover:bg-accent-600
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            追加
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

          if (isEditing) {
            return (
              <li key={h.id}>
                <div
                  className="flex items-stretch gap-0 rounded-2xl border border-accent-400/60 dark:border-accent-500/40
                    ring-1 ring-accent-500/20 bg-white dark:bg-zinc-900/40 shadow-sm overflow-hidden"
                >
                  <div
                    className="w-1.5 shrink-0 self-stretch min-h-[8rem]"
                    style={{ backgroundColor: editColor }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0 p-4 space-y-3">
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
                      className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700
                                 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-accent-500/30"
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
                                   disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
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
                className="group flex items-stretch gap-0 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 shadow-sm transition-colors cursor-pointer
                  hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
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
