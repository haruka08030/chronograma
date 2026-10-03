import { useMemo, useState } from 'react'
import { formatDuration } from '../lib/timeGrid'
import { useTranslation } from 'react-i18next'
import { tip } from '../lib/tooltip'
import { addDays } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { recentLogs } from '../lib/logCategory'
import { categoryHex, colorVars, recordLabelKey, recordLabelKeyHex } from '../lib/logCategoryColors'
import { recordLabelKeyText } from '../lib/todoColorLabels'
import { isActiveTask } from '../lib/taskLifecycle'
import { minutesOfLogOnCalendarDay } from '../lib/taskTimeRange'
import { TimeLogTagField } from './TimeLogTagField'
import { TimeInput } from './TimeInput'
import { isSleepRecord } from '../lib/sleep'
import { zonedNow } from '../lib/timeZone'
import { PlayIcon, PlusIcon } from './icons'
import { buttonClass } from './ui/buttonClass'
import { isSubmitEnter } from '../lib/keyboard'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { addClockMinutes, timeToMinutes } from '../lib/clockTime'
import { chipClass } from './ui/chipClass'
import { usePendingAction } from '../lib/pendingAction'

/** 「L」キーで今日画面の「記録する」を開くためのイベント */
/** 「l」で今日を開いて「記録する」を開く（`requestAction`） */
export const OPEN_TIMER_ACTION = 'open-timer'


/** 今の時刻を 5 分単位に丸めた HH:MM */
function nowRounded(): string {
  const d = zonedNow()
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
}: {
  dateKey: string
  viewingToday: boolean
}) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const startTimer = useTaskStore((s) => s.startTimer)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const labelPresets = useTaskStore((s) => s.timeLogTagPresets)

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
      // 睡眠は分類の帯に入れない（上の「睡眠」の行で見る）
      if (isSleepRecord(log)) continue
      const min = minutesOfLogOnCalendarDay(log, dateKey)
      total += min
      const cat = recordLabelKey(log, labelPresets, logCategoryColors)
      m.set(cat, (m.get(cat) ?? 0) + min)
    }
    return { totalMinutes: total, byCategory: [...m.entries()].sort((a, b) => b[1] - a[1]) }
  }, [dayLogs, dateKey, labelPresets, logCategoryColors])

  // 記録中でも始められる（前の記録を保存して切り替える）
  const canStartTimer = viewingToday
  // いま計っているものは「もう一度始める」に出さない
  const recentChoices = recent.filter((r) => r.title !== activeTimer?.taskTitle)
  // 未来の日は「後から」記録できない
  const canLogLater = dateKey <= toDateKey(zonedNow())

  usePendingAction(OPEN_TIMER_ACTION, () => setMode('timer'))

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
        .filter((x) => x.dueDate === dateKey && !x.endDate && x.endTime && timeToMinutes(x.endTime) < timeToMinutes(e))
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
  const overnight = Boolean(start && end && timeToMinutes(end) < timeToMinutes(start))
  // 記録は今より先には作れない（今日は「今」まで。日をまたぐのも不可）
  const nowMin = zonedNow().getHours() * 60 + zonedNow().getMinutes()
  const inFuture = viewingToday && Boolean(start && end) && (overnight || timeToMinutes(end) > nowMin)
  const canSaveManual = Boolean(name && start && end && start !== end && !inFuture)

  const submit = () => {
    if (!name) return
    const tags = category.trim() ? [category.trim()] : []
    if (mode === 'timer') {
      startTimer(name, tags)
    } else {
      if (!canSaveManual) return
      // 終わりが始まりより前なら日をまたいだ記録（夜〜翌朝の睡眠など）
      const endDate = overnight ? toDateKey(addDays(fromDateKey(dateKey), 1)) : null
      addTimeLog(name, dateKey, start, end, tags, undefined, endDate)
    }
    close()
  }

  const labelOf = (cat: string) => recordLabelKeyText(cat, labelPresets, logCategoryColors, t)

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isSubmitEnter(e)) {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape') close()
  }

  const summary = totalMinutes > 0 && (
    <div>
      {/* 見るだけの帯。スマホでタイムラインへ行くのは上の「タイムライン」タブ */}
      <div className="flex h-2 w-full gap-px overflow-hidden rounded-full">
        {byCategory.map(([cat, min]) => (
          <span
            key={cat}
            className="gc-dot h-full"
            title={`${labelOf(cat)} ${formatDuration(min)}`}
            style={{ ...colorVars(recordLabelKeyHex(cat, logCategoryColors)), width: `${(min / totalMinutes) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        {byCategory.map(([cat, min]) => (
          <li key={cat} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="gc-dot h-2 w-2 shrink-0 rounded-full" style={colorVars(recordLabelKeyHex(cat, logCategoryColors))} aria-hidden />
            <span className="max-w-[8rem] truncate">{labelOf(cat)}</span>
            <span className="tabular-nums text-zinc-400 dark:text-zinc-500">{formatDuration(min)}</span>
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
              className={buttonClass({ variant: 'ghost', size: 'sm' })}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={mode === 'timer' ? !name : !canSaveManual}
              className={buttonClass({ variant: 'primary', size: 'sm' })}
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
      {/* 始める操作（記録する・後から）は大きく横並び。最近の記録はその下に小さく */}
      <div className="flex gap-2">
        {canStartTimer && (
          <button
            type="button"
            onClick={() => setMode('timer')}
            {...tip(t('quickLog.start'), 'L')}
            className={buttonClass({ variant: 'primary', size: 'lg' }, 'flex-1 shadow-sm')}
          >
            <PlayIcon className="h-4 w-4" />
            {t('quickLog.start')}
          </button>
        )}
        {canLogLater && (
          <button
            type="button"
            onClick={openManual}
            className={buttonClass({ variant: 'secondary', size: 'lg' }, 'flex-1')}
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
            {t('records.later')}
          </button>
        )}
      </div>
      {canStartTimer && recentChoices.length > 0 && (
        <div className="-mt-1 flex flex-wrap items-center gap-1.5">
          {recentChoices.map((r) => (
            <button
              key={r.title}
              type="button"
              onClick={() => startTimer(r.title, r.category ? [r.category] : [])}
              {...tip(t('quickLog.resume', { title: r.title }))}
              aria-label={t('quickLog.resume', { title: r.title })}
              className={chipClass({ variant: 'outline', size: 'md' }, 'min-h-9 max-w-[10rem] gap-1.5 md:min-h-7')}
            >
              {/* 分類の色の ▶ — 押すとこの記録をもう一度始める */}
              <PlayIcon className="h-2.5 w-2.5 shrink-0 text-[var(--c)]" style={colorVars(categoryHex(r.category, logCategoryColors))} />
              <span className="truncate">{r.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
