import { useState, useMemo } from 'react'
import { useTaskStore, paletteColors } from '../store/taskStore'
import type { HabitWeekday } from '../types/habit'

const WEEKDAYS: { v: HabitWeekday; label: string }[] = [
  { v: 1, label: '月' },
  { v: 2, label: '火' },
  { v: 3, label: '水' },
  { v: 4, label: '木' },
  { v: 5, label: '金' },
  { v: 6, label: '土' },
  { v: 7, label: '日' },
]

export function HabitsView() {
  const habits = useTaskStore((s) => s.habits)
  const addHabit = useTaskStore((s) => s.addHabit)
  const deleteHabit = useTaskStore((s) => s.deleteHabit)
  const listColorPaletteId = useTaskStore((s) => s.listColorPaletteId)
  const listColors = useMemo(() => paletteColors(listColorPaletteId), [listColorPaletteId])

  const [title, setTitle] = useState('')
  const [freq, setFreq] = useState<'daily' | 'weekly'>('daily')
  const [weekdays, setWeekdays] = useState<HabitWeekday[]>([1, 2, 3, 4, 5])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [colorIndex, setColorIndex] = useState(4)
  const color = listColors[Math.min(colorIndex, listColors.length - 1)] ?? listColors[0]

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
    addHabit({
      title: t,
      color,
      startTime,
      endTime,
      frequency: freq === 'daily' ? { type: 'daily' } : { type: 'weekly', weekdays },
    })
    setTitle('')
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">習慣</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
        予定 vs ログの左列に、習慣の時間帯が表示されます。達成は予定ブロックのチェックで記録できます。
      </p>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4 mb-8 space-y-4">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">習慣を追加</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="名前（例: 朝のストレッチ）"
          className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700
                     text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-accent-500/30"
        />
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-zinc-500">色</span>
          {listColors.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() => setColorIndex(i)}
              className={`w-6 h-6 rounded-full ring-2 ${colorIndex === i ? 'ring-accent-500 ring-offset-2 dark:ring-offset-zinc-900' : 'ring-0'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="frequency"
              checked={freq === 'daily'}
              onChange={() => setFreq('daily')}
              className="text-accent-500"
            />
            毎日
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
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
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                  ${weekdays.includes(v)
                    ? 'bg-accent-500 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <label className="text-zinc-500">時間</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="px-2 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
          />
          <span className="text-zinc-400">〜</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="px-2 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || (freq === 'weekly' && weekdays.length === 0)}
          className="px-4 py-2 rounded-lg bg-accent-500 text-white text-sm font-medium hover:bg-accent-600
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          追加
        </button>
      </div>

      <ul className="space-y-2">
        {habits.length === 0 && (
          <p className="text-sm text-zinc-400">まだ習慣がありません。</p>
        )}
        {habits.map((h) => (
          <li
            key={h.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30"
          >
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{h.title}</p>
              <p className="text-xs text-zinc-500">
                {h.frequency.type === 'daily'
                  ? '毎日'
                  : `週: ${h.frequency.weekdays.map((d) => WEEKDAYS.find((x) => x.v === d)?.label).join('・')}`}
                {h.startTime && h.endTime && ` · ${h.startTime}–${h.endTime}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => deleteHabit(h.id)}
              className="text-xs text-red-500 hover:underline flex-shrink-0"
            >
              削除
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
