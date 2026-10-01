import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { recentLogs } from '../lib/logCategory'
import { TimeLogTagField } from './TimeLogTagField'

/**
 * 「今日」画面から記録を始める 1 行。最近の記録はワンタップで再開、
 * 「記録する」で タイトル（任意）＋分類 を選んで開始。記録中は FloatingTimer に任せて隠れる。
 */
export function QuickLogStarter() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const startTimer = useTaskStore((s) => s.startTimer)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const recent = useMemo(() => recentLogs(tasks, 3), [tasks])

  if (activeTimer) return null

  const start = () => {
    const name = title.trim() || category.trim()
    if (!name) return
    startTimer(name, category.trim() ? [category.trim()] : [])
    setTitle('')
    setCategory('')
    setOpen(false)
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-9 items-center gap-1 rounded-full bg-zinc-900 px-3 py-1 text-xs md:min-h-0 font-medium text-white transition-colors hover:bg-zinc-700
                     dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M7 5.5v13a1 1 0 001.52.85l10.4-6.5a1 1 0 000-1.7L8.52 4.65A1 1 0 007 5.5z" />
          </svg>
          {t('quickLog.start')}
        </button>
        {recent.map((r) => (
          <button
            key={r.title}
            type="button"
            onClick={() => startTimer(r.title, r.category ? [r.category] : [])}
            title={t('quickLog.resume', { title: r.title })}
            className="min-h-9 max-w-[10rem] truncate rounded-full border border-zinc-200 px-2.5 py-1 text-xs md:min-h-0 text-zinc-600 transition-colors hover:bg-zinc-50
                       dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {r.title}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !e.nativeEvent.isComposing) {
            e.preventDefault()
            start()
          }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={t('quickLog.titlePlaceholder')}
        className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
      />
      <TimeLogTagField value={category} onChange={setCategory} compact />
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={start}
          disabled={!title.trim() && !category.trim()}
          className="rounded-lg bg-accent-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-40"
        >
          {t('quickLog.go')}
        </button>
      </div>
    </div>
  )
}
