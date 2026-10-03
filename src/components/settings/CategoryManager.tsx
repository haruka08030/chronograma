import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, subDays } from 'date-fns'
import { useTaskStore } from '../../store/taskStore'
import { isActiveTask } from '../../lib/taskLifecycle'
import { minutesOfLogOnCalendarDay } from '../../lib/taskTimeRange'
import { categoryHex, colorVars } from '../../lib/logCategoryColors'
import { appToday } from '../../lib/timeZone'
import { LabelsDialog } from '../labels/LabelsDialog'
import { buttonClass } from '../ui/buttonClass'

const USAGE_DAYS = 30

/**
 * 設定の「ラベル」。名前・色・追加・削除は「ラベルを編集」（✎ と同じ画面）だけで行い、
 * ここは直近 30 日の使用時間と並び順だけ。編集の入口が 2 つあると、削除やまとめ方の動きが食い違っていた。
 * 記録にだけあるラベル（候補に無い）は下にまとめて、ワンタップで候補に入れられる。
 */
export function CategoryManager() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const addLogCategory = useTaskStore((s) => s.addLogCategory)
  const moveLogCategory = useTaskStore((s) => s.moveLogCategory)

  const [editorOpen, setEditorOpen] = useState(false)

  /** 分類 → 直近 30 日の分数（分類なしは ''） */
  const usage = useMemo(() => {
    const map = new Map<string, number>()
    const days = Array.from({ length: USAGE_DAYS }, (_, i) => format(subDays(appToday(), i), 'yyyy-MM-dd'))
    for (const task of tasks) {
      if (!task.isTimeLog || !isActiveTask(task)) continue
      let minutes = 0
      for (const d of days) minutes += minutesOfLogOnCalendarDay(task, d)
      if (minutes <= 0) continue
      const key = task.tags[0] ?? ''
      map.set(key, (map.get(key) ?? 0) + minutes)
    }
    return map
  }, [tasks])

  const unlisted = useMemo(() => {
    const set = new Set<string>()
    for (const task of tasks) {
      if (task.isTimeLog && isActiveTask(task) && task.tags[0] && !presets.includes(task.tags[0])) set.add(task.tags[0])
    }
    return [...set]
  }, [tasks, presets])

  const fmt = (m: number) => {
    const h = Math.floor(m / 60)
    const min = m % 60
    if (h === 0) return t('planner.minutes', { m: min })
    if (min === 0) return t('planner.hours', { h })
    return t('planner.hoursMinutes', { h, m: min })
  }

  const uncategorized = usage.get('') ?? 0

  return (
    <>
      <ul>
        {presets.map((name, i) => {
          const vars = colorVars(categoryHex(name, colors))
          const minutes = usage.get(name) ?? 0
          return (
            <li key={name} className="group relative flex min-h-12 items-center gap-3 border-b border-zinc-100 px-4 py-2 last:border-b-0 dark:border-zinc-800">
              <span className="gc-dot h-4 w-4 shrink-0 rounded-full" style={vars} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">{name}</span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                {minutes > 0 ? fmt(minutes) : t('categories.unused')}
              </span>
              <div className="flex shrink-0 items-center opacity-100 md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => moveLogCategory(name, -1)}
                  aria-label={t('categories.moveUp', { name })}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                </button>
                <button
                  type="button"
                  disabled={i === presets.length - 1}
                  onClick={() => moveLogCategory(name, 1)}
                  aria-label={t('categories.moveDown', { name })}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="px-4 py-3">
        <button type="button" onClick={() => setEditorOpen(true)} className={buttonClass({ variant: 'secondary', size: 'md' })}>
          {t('labels.edit')}
        </button>
      </div>

      {(unlisted.length > 0 || uncategorized > 0) && (
        <div className="space-y-2 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
          {unlisted.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span>{t('categories.unlisted')}</span>
              {unlisted.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => addLogCategory(name)}
                  className="rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-zinc-600 hover:border-accent-400 hover:text-accent-600 dark:border-zinc-600 dark:text-zinc-300"
                >
                  ＋ {name}
                </button>
              ))}
            </div>
          )}
          {uncategorized > 0 && <p>{t('categories.uncategorizedTime', { time: fmt(uncategorized) })}</p>}
        </div>
      )}
      {editorOpen && <LabelsDialog onClose={() => setEditorOpen(false)} />}
    </>
  )
}
