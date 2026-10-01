import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { recentLogs } from '../lib/logCategory'
import { categoryHex, colorVars } from '../lib/logCategoryColors'
import { isActiveTask } from '../lib/taskLifecycle'
import { minutesOfLogOnCalendarDay } from '../lib/taskTimeRange'
import { TimeLogTagField } from './TimeLogTagField'
import { TimeInput, addClockMinutes } from './TimeInput'

/** 「L」キーで今日画面の「記録する」を開くためのイベント */
export const OPEN_TIMER_EVENT = 'chronograma:open-timer'

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** 今の時刻を 5 分単位に丸めた HH:MM */
function nowRounded(): string {
  const d = new Date()
  const m = Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5
  return addClockMinutes('00:00', Math.min(m, 1435))
}

/**
 * 今日画面の「記録」ブロック（旧・記録画面を統合）。
 * 1. 分類ごとの記録時間（色の帯＋凡例）— 記録がある日だけ
 * 2. タイマー開始（最近の記録はワンタップで再開）と「後から記録」
 * 入力欄は押したときだけ開く。記録中は FloatingTimer に任せ、開始ボタンは隠す。
 */
export function RecordPanel({
  dateKey,
  viewingToday,
  onBarClick,
}: {
  dateKey: string
  viewingToday: boolean
  /** 色の帯を押したとき（スマホではタイムラインへ切り替える） */
  onBarClick?: () => void
}) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const startTimer = useTaskStore((s) => s.startTimer)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)

  const [mode, setMode] = useState<'idle' | 'timer' | 'manual'>('idle')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const recent = useMemo(() => recentLogs(tasks, 2), [tasks])

  const dayLogs = useMemo(
    () => tasks.filter((x) => x.isTimeLog && isActiveTask(x) && minutesOfLogOnCalendarDay(x, dateKey) > 0),
    [tasks, dateKey],
  )
  const { totalMinutes, byCategory } = useMemo(() => {
    const m = new Map<string, number>()
    let total = 0
    for (const log of dayLogs) {
      const min = minutesOfLogOnCalendarDay(log, dateKey)
      total += min
      const cat = log.tags[0] ?? ''
      m.set(cat, (m.get(cat) ?? 0) + min)
    }
    return { totalMinutes: total, byCategory: [...m.entries()].sort((a, b) => b[1] - a[1]) }
  }, [dayLogs, dateKey])

  const canStartTimer = viewingToday && !activeTimer
  // 未来の日は「後から」記録できない
  const canLogLater = dateKey <= format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    const open = () => {
      if (useTaskStore.getState().activeTimer) return
      setMode('timer')
    }
    window.addEventListener(OPEN_TIMER_EVENT, open)
    return () => window.removeEventListener(OPEN_TIMER_EVENT, open)
  }, [])

  const close = () => {
    setMode('idle')
    setTitle('')
    setCategory('')
  }

  const openManual = () => {
    // 今日なら「直前の記録の終わり → 今」を初期値にして、空いた時間をそのまま埋められるように
    if (viewingToday) {
      const e = nowRounded()
      const prevEnd = dayLogs
        .filter((x) => x.dueDate === dateKey && !x.endDate && x.endTime && toMin(x.endTime) < toMin(e))
        .map((x) => x.endTime!)
        .sort()
        .at(-1)
      setStart(prevEnd ?? addClockMinutes(e, -60))
      setEnd(e)
    } else {
      setStart('')
      setEnd('')
    }
    setMode('manual')
  }

  const name = title.trim() || category.trim()
  const overnight = Boolean(start && end && toMin(end) < toMin(start))
  // 記録は今より先には作れない（今日は「今」まで。日をまたぐのも不可）
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const inFuture = viewingToday && Boolean(start && end) && (overnight || toMin(end) > nowMin)
  const canSaveManual = Boolean(name && start && end && start !== end && !inFuture)

  const submit = () => {
    if (!name) return
    const tags = category.trim() ? [category.trim()] : []
    if (mode === 'timer') {
      startTimer(name, tags)
    } else {
      if (!canSaveManual) return
      // 終わりが始まりより前なら日をまたいだ記録（夜〜翌朝の睡眠など）
      const endDate = overnight ? format(addDays(parseISO(`${dateKey}T12:00:00`), 1), 'yyyy-MM-dd') : null
      addTimeLog(name, dateKey, start, end, tags, undefined, endDate)
    }
    close()
  }

  const formatMinutes = (m: number) => {
    const h = Math.floor(m / 60)
    const min = m % 60
    if (h === 0) return t('planner.minutes', { m: min })
    if (min === 0) return t('planner.hours', { h })
    return t('planner.hoursMinutes', { h, m: min })
  }
  const labelOf = (cat: string) => cat || t('tags.untagged')

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape') close()
  }

  const summary = totalMinutes > 0 && (
    <div>
      <button
        type="button"
        onClick={onBarClick}
        aria-label={t('records.barAria')}
        className="flex h-2 w-full gap-px overflow-hidden rounded-full md:cursor-default"
      >
        {byCategory.map(([cat, min]) => (
          <span
            key={cat}
            className="gc-dot h-full"
            title={`${labelOf(cat)} ${formatMinutes(min)}`}
            style={{ ...colorVars(categoryHex(cat || null, logCategoryColors)), width: `${(min / totalMinutes) * 100}%` }}
          />
        ))}
      </button>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        {byCategory.map(([cat, min]) => (
          <li key={cat} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="gc-dot h-2 w-2 shrink-0 rounded-full" style={colorVars(categoryHex(cat || null, logCategoryColors))} aria-hidden />
            <span className="max-w-[8rem] truncate">{labelOf(cat)}</span>
            <span className="tabular-nums text-zinc-400 dark:text-zinc-500">{formatMinutes(min)}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  if (mode !== 'idle') {
    return (
      <div className="space-y-3">
        {summary}
        <div className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onEnter}
            placeholder={mode === 'timer' ? t('quickLog.titlePlaceholder') : t('records.laterPlaceholder')}
            className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
          {mode === 'manual' && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <TimeInput
                value={start}
                onChange={setStart}
                className="w-[5.5rem] rounded-md bg-zinc-50 px-2 py-1 text-sm tabular-nums text-zinc-900 outline-none dark:bg-zinc-800 dark:text-zinc-100"
              />
              <span aria-hidden>–</span>
              <TimeInput
                value={end}
                onChange={setEnd}
                pickerDefault={start ? addClockMinutes(start, 60) : undefined}
                className="w-[5.5rem] rounded-md bg-zinc-50 px-2 py-1 text-sm tabular-nums text-zinc-900 outline-none dark:bg-zinc-800 dark:text-zinc-100"
              />
              {inFuture ? (
                <span className="text-xs text-red-500 dark:text-red-400">{t('records.noFuture')}</span>
              ) : (
                overnight && <span className="text-xs">{t('records.nextDay')}</span>
              )}
            </div>
          )}
          <TimeLogTagField value={category} onChange={setCategory} compact />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={mode === 'timer' ? !name : !canSaveManual}
              className="rounded-lg bg-accent-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-40"
            >
              {mode === 'timer' ? t('quickLog.go') : t('records.save')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!canStartTimer && !canLogLater && !summary) return null

  return (
    <div className="space-y-3">
      {summary}
      <div className="flex flex-wrap items-center gap-1.5">
        {canStartTimer && (
          <>
            <button
              type="button"
              onClick={() => setMode('timer')}
              className="inline-flex min-h-9 items-center gap-1 rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-700 md:min-h-0
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
                className="min-h-9 max-w-[9rem] truncate rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 md:min-h-0
                           dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {r.title}
              </button>
            ))}
          </>
        )}
        {canLogLater && (
          <button
            type="button"
            onClick={openManual}
            className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 md:min-h-0
                       dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('records.later')}
          </button>
        )}
      </div>
    </div>
  )
}
