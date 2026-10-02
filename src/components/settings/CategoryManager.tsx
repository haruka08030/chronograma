import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, subDays } from 'date-fns'
import { useTaskStore } from '../../store/taskStore'
import { isActiveTask } from '../../lib/taskLifecycle'
import { minutesOfLogOnCalendarDay } from '../../lib/taskTimeRange'
import { CATEGORY_COLOR_KEYS, categoryColorKey, categoryHex, colorVars } from '../../lib/logCategoryColors'
import { hexForGoogleKey } from '../../lib/googleColors'

const USAGE_DAYS = 30

/**
 * 記録の分類の管理（旧「活動ログのタグ候補」の 1 行 1 タグのテキスト欄を置き換え）。
 * 色・名前・並び順・削除を行ごとに操作でき、直近 30 日の使用時間で「使っていない分類」も分かる。
 * 記録にだけある分類（候補に無い）は下にまとめて、ワンタップで候補に入れられる。
 */
export function CategoryManager() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const addLogCategory = useTaskStore((s) => s.addLogCategory)
  const renameLogCategory = useTaskStore((s) => s.renameLogCategory)
  const removeLogCategory = useTaskStore((s) => s.removeLogCategory)
  const moveLogCategory = useTaskStore((s) => s.moveLogCategory)
  const setLogCategoryColor = useTaskStore((s) => s.setLogCategoryColor)

  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [colorFor, setColorFor] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  /** 分類 → 直近 30 日の分数（分類なしは ''） */
  const usage = useMemo(() => {
    const map = new Map<string, number>()
    const days = Array.from({ length: USAGE_DAYS }, (_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'))
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

  const commitRename = (from: string) => {
    const to = editValue.trim()
    setEditing(null)
    if (!to || to === from) return
    if (presets.includes(to) && !window.confirm(t('categories.confirmMerge', { from, to }))) return
    renameLogCategory(from, to)
  }

  const submitNew = () => {
    const name = draft.trim()
    if (!name) return
    addLogCategory(name)
    setDraft('')
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
              <button
                type="button"
                onClick={() => setColorFor((c) => (c === name ? null : name))}
                aria-label={t('categories.changeColor', { name })}
                aria-expanded={colorFor === name}
                className="gc-dot h-4 w-4 shrink-0 rounded-full ring-2 ring-transparent transition hover:ring-zinc-300 dark:hover:ring-zinc-600"
                style={vars}
              />
              {editing === name ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitRename(name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  className="min-w-0 flex-1 rounded-md border border-accent-300 bg-white px-2 py-1 text-sm outline-none dark:border-accent-500/50 dark:bg-zinc-900"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(name)
                    setEditValue(name)
                  }}
                  className="min-w-0 flex-1 truncate text-left text-sm text-zinc-800 dark:text-zinc-200"
                >
                  {name}
                </button>
              )}
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
                <button
                  type="button"
                  onClick={() => removeLogCategory(name)}
                  aria-label={t('categories.remove', { name })}
                  title={t('categories.removeHelp')}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              {colorFor === name && (
                <div
                  role="radiogroup"
                  aria-label={t('categories.changeColor', { name })}
                  className="absolute left-2 top-full z-20 mt-1 grid grid-cols-12 gap-1.5 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
                >
                  {CATEGORY_COLOR_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={categoryColorKey(name, colors) === key}
                      aria-label={t(`googleColors.${key}`)}
                      title={t(`googleColors.${key}`)}
                      onClick={() => {
                        setLogCategoryColor(name, key)
                        setColorFor(null)
                      }}
                      style={colorVars(hexForGoogleKey(key)!)}
                      className={`gc-dot h-6 w-6 rounded-full ${
                        categoryColorKey(name, colors) === key ? 'ring-2 ring-zinc-900 ring-offset-2 dark:ring-white dark:ring-offset-zinc-800' : ''
                      }`}
                    />
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-3 px-4 py-2">
        <span className="h-4 w-4 shrink-0 rounded-full border border-dashed border-zinc-300 dark:border-zinc-600" aria-hidden />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !e.nativeEvent.isComposing) submitNew()
          }}
          placeholder={t('categories.addPlaceholder')}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-zinc-400"
        />
        {draft.trim() && (
          <button type="button" onClick={submitNew} className="text-xs font-medium text-accent-600 dark:text-accent-400">
            {t('categories.add')}
          </button>
        )}
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
    </>
  )
}
