import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { format, addDays, subDays, isToday } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import {
  HOUR_HEIGHT,
  HOURS,
  timeToY,
  formatTimeLabel,
  formatDuration,
} from '../lib/timeGrid'
import {
  compareLogsOnDay,
  durationMinutesForTaskId,
  durationMinutesForTaskSlot,
  isOvernightTimeLog,
  logOverlapsDateKey,
  minutesOfLogOnCalendarDay,
  patchAfterTimelineMove,
  timeLogSegmentLayoutForDay,
} from '../lib/taskTimeRange'
import { isActiveTask } from '../lib/taskLifecycle'
import { useTimelineDrag, getResizeCursor } from '../lib/useTimelineDrag'
import { useTimelineDrop } from '../lib/useTimelineDrop'
import { TaskDetail } from './TaskDetail'
import { getTagColor, logBlockAccentFromTags, buildTimeLogTagUniverse } from '../lib/tagColors'
import { TimeLogTagField } from './TimeLogTagField'
import { TimeInput, addClockMinutes } from './TimeInput'
import { useNowMinuteTick } from '../hooks/useNowMinuteTick'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'

const GRID_TOTAL_HEIGHT = HOUR_HEIGHT * 24

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function NowIndicator() {
  const now = useNowMinuteTick()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const top = (minutes / 60) * HOUR_HEIGHT
  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="relative">
        <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
        <div className="h-px bg-red-500" />
      </div>
    </div>
  )
}

function InlineTimeAdd({ startTime, endTime, onDone }: { startTime: string; endTime: string; onDone: (title?: string) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const submit = () => { 
    if (isSubmitting) return  
    setIsSubmitting(true)
    onDone(value.trim() || undefined)
  }
  const cancel = () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    onDone()
  }
  return (
    <div className="absolute left-2 right-2 z-30 rounded-lg border-2 border-emerald-500
                 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden"
      style={{ top: timeToY(startTime), height: Math.max(timeToY(endTime) - timeToY(startTime), 40) }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-1.5 flex flex-col h-full">
        <input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel() }}
          onBlur={submit}
          placeholder={t('activityLog.inlineAddPlaceholder')}
          className="w-full text-xs bg-transparent outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
        />
        <span className="text-[10px] text-zinc-400 mt-auto">
          {startTime} – {endTime}
        </span>
      </div>
    </div>
  )
}

export function ActivityLogView() {
  const { t, i18n } = useTranslation()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const dateKey = format(selectedDate, 'yyyy-MM-dd')
  const isTodaySelected = isToday(selectedDate)

  const tasks = useTaskStore((s) => s.tasks)
  const timeLogTagPresets = useTaskStore((s) => s.timeLogTagPresets)
  const updateTask = useTaskStore((s) => s.updateTask)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const startTimer = useTaskStore((s) => s.startTimer)
  const stopTimer = useTaskStore((s) => s.stopTimer)

  const [timerElapsed, setTimerElapsed] = useState(0)
  const [timerTitle, setTimerTitle] = useState('')
  const [timerTag, setTimerTag] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [manualStartDate, setManualStartDate] = useState(dateKey)
  const [manualEndDate, setManualEndDate] = useState(dateKey)
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [manualTag, setManualTag] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)

  useEffect(() => {
    setManualStartDate(dateKey)
    setManualEndDate(dateKey)
  }, [dateKey])

  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const getRelativeY = useCallback((clientY: number, unusedDateKey: string) => {
    void unusedDateKey
    if (!gridRef.current) return 0
    const rect = gridRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(clientY - rect.top, GRID_TOTAL_HEIGHT))
  }, [])

  const timelineDrag = useTimelineDrag({
    getRelativeY,
    onMoveDone: (taskId, _dk, startTime, endTime) => {
      const prev = useTaskStore.getState().tasks.find((x) => x.id === taskId)
      if (!prev) return
      updateTask(taskId, patchAfterTimelineMove(prev, dateKey, startTime, endTime))
    },
    onResizeDone: (taskId, startTime, endTime) => { updateTask(taskId, { startTime, endTime }) },
    onBlockTap: useCallback((taskId: string) => {
      openDetail(taskId)
    }, [openDetail]),
  })

  const getTaskDuration = useCallback(
    (taskId: string): number | null => durationMinutesForTaskId(tasks, taskId),
    [tasks],
  )

  const timelineDrop = useTimelineDrop({
    getRelativeY,
    getTaskDuration,
    onDrop: (taskId, _dk, startTime, endTime) => {
      updateTask(taskId, { dueDate: dateKey, startTime, endTime, isTimeLog: true, completed: true, endDate: null })
    },
  })

  const handleCreateDone = useCallback((title?: string) => {
    if (title && timelineDrag.popup) {
      addTimeLog(title, dateKey, timelineDrag.popup.startTime, timelineDrag.popup.endTime)
    }
    timelineDrag.dismissPopup()
  }, [timelineDrag, addTimeLog, dateKey])

  const dayLogs = useMemo(() => {
    return tasks
      .filter((t) => t.startTime && t.endTime && !t.parentId && t.isTimeLog && isActiveTask(t) && logOverlapsDateKey(t, dateKey))
      .sort((a, b) => compareLogsOnDay(a, b, dateKey))
  }, [tasks, dateKey])

  const tagUniverse = useMemo(
    () => buildTimeLogTagUniverse(timeLogTagPresets, tasks),
    [timeLogTagPresets, tasks],
  )

  const summary = useMemo(() => {
    let totalMinutes = 0
    const byTag = new Map<string, number>()
    for (const log of dayLogs) {
      const dur = minutesOfLogOnCalendarDay(log, dateKey)
      if (dur <= 0) continue
      totalMinutes += dur
      for (const tag of log.tags) {
        byTag.set(tag, (byTag.get(tag) ?? 0) + dur)
      }
      if (log.tags.length === 0) {
        const untagged = t('tags.untagged')
        byTag.set(untagged, (byTag.get(untagged) ?? 0) + dur)
      }
    }
    return { totalMinutes, byTag: Array.from(byTag.entries()).sort((a, b) => b[1] - a[1]) }
  }, [dayLogs, t])

  useEffect(() => {
    if (!activeTimer) {
      queueMicrotask(() => setTimerElapsed(0))
      return
    }
    const start = new Date(activeTimer.startedAt).getTime()
    const tick = () => setTimerElapsed(Date.now() - start)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeTimer])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = HOUR_HEIGHT * 7.5
    }
  }, [])

  const handleStartTimer = () => {
    const title = timerTitle.trim()
    if (!title) return
    const tags = timerTag.trim() ? [timerTag.trim()] : []
    startTimer(title, tags)
    setTimerTitle('')
    setTimerTag('')
  }

  const handleManualAdd = () => {
    const title = manualTitle.trim()
    if (!title || !manualStart || !manualEnd) return
    const endDateArg = manualEndDate !== manualStartDate ? manualEndDate : null
    const dur = durationMinutesForTaskSlot({
      dueDate: manualStartDate,
      endDate: endDateArg,
      startTime: manualStart,
      endTime: manualEnd,
      isTimeLog: true,
    })
    if (dur == null || dur <= 0) {
      setManualError(t('alert.endAfterStart'))
      return
    }
    setManualError(null)
    const tags = manualTag.trim() ? [manualTag.trim()] : []
    addTimeLog(title, manualStartDate, manualStart, manualEnd, tags, undefined, endDateArg)
    setManualTitle('')
    setManualStart('')
    setManualEnd('')
    setManualTag('')
    setShowManual(false)
  }

  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const dateLabel = format(selectedDate, i18n.resolvedLanguage?.startsWith('ja') ? 'M月d日 (E)' : 'MMM d (E)', { locale: dateLocale })
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-row">
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-8 pb-4 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{t('activityLog.title')}</h1>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedDate((d) => subDays(d, 1))}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={() => setSelectedDate(new Date())}
            className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800
                       text-zinc-600 dark:text-zinc-400 transition-colors"
          >
            {t('activityLog.today')}
          </button>
          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left panel: Timer + Manual entry + Summary */}
        <div className="w-80 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto p-4 space-y-5">
          {/* Timer section */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('activityLog.timer')}
            </h2>

            {activeTimer ? (
              <div className="space-y-3">
                <div className="text-center">
                  <p className="text-3xl font-mono font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {formatElapsed(timerElapsed)}
                  </p>
                  <p className="text-sm text-zinc-500 mt-1">{activeTimer.taskTitle}</p>
                  {activeTimer.tags.length > 0 && (
                    <div className="flex justify-center gap-1 mt-1">
                      {activeTimer.tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-100 dark:bg-accent-500/20 text-accent-700 dark:text-accent-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={stopTimer}
                  className="w-full py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  {t('activityLog.stopAndSave')}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={timerTitle}
                  onChange={(e) => setTimerTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleStartTimer() }}
                  placeholder={t('activityLog.timerWhat')}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800/50
                             border border-zinc-200 dark:border-zinc-700 outline-none
                             focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                             text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
                <TimeLogTagField
                  listId="activity-log-timer"
                  value={timerTag}
                  onChange={setTimerTag}
                  inputClassName="w-full px-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800/50
                               border border-zinc-200 dark:border-zinc-700 outline-none
                               focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                               text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
                <button
                  onClick={handleStartTimer}
                  disabled={!timerTitle.trim()}
                  className="w-full py-2.5 rounded-xl bg-accent-500 hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed
                             text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                  {t('activityLog.start')}
                </button>
              </div>
            )}
          </div>

          {/* Manual entry section */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <button
              onClick={() => setShowManual(!showManual)}
              className="w-full flex items-center justify-between text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                {t('activityLog.logLater')}
              </span>
              <svg className={`w-4 h-4 transition-transform ${showManual ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {showManual && (
              <div className="space-y-2 pt-1">
                <input
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder={t('activityLog.activityName')}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800/50
                             border border-zinc-200 dark:border-zinc-700 outline-none
                             focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                             text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
                <div className="space-y-2">
                  <div
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/30
                               p-3 space-y-2"
                  >
                    <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{t('common.start')}</p>
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="flex flex-col gap-1 min-w-[10.5rem] flex-1">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          {t('activityLog.startDate')}
                        </label>
                        <input
                          type="date"
                          value={manualStartDate}
                          onChange={(e) => setManualStartDate(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-zinc-900
                                     border border-zinc-200 dark:border-zinc-700 outline-none
                                     focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                                     text-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                      <div className="flex flex-col gap-1 w-[7.5rem] shrink-0">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          {t('taskDetail.time')}
                        </label>
                        <TimeInput
                          value={manualStart}
                          onChange={setManualStart}
                          className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-zinc-900
                                     border border-zinc-200 dark:border-zinc-700 outline-none
                                     focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                                     text-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                    </div>
                  </div>
                  <div
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/30
                               p-3 space-y-2"
                  >
                    <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{t('common.end')}</p>
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="flex flex-col gap-1 min-w-[10.5rem] flex-1">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          {t('activityLog.endDate')}
                        </label>
                        <input
                          type="date"
                          value={manualEndDate}
                          min={manualStartDate}
                          onChange={(e) => setManualEndDate(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-zinc-900
                                     border border-zinc-200 dark:border-zinc-700 outline-none
                                     focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                                     text-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                      <div className="flex flex-col gap-1 w-[7.5rem] shrink-0">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          {t('taskDetail.time')}
                        </label>
                        <TimeInput
                          value={manualEnd}
                          onChange={setManualEnd}
                          pickerDefault={manualStart ? addClockMinutes(manualStart, 60) : undefined}
                          className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-zinc-900
                                     border border-zinc-200 dark:border-zinc-700 outline-none
                                     focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                                     text-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{t('activityLog.overnightHint')}</p>
                <TimeLogTagField
                  listId="activity-log-manual"
                  value={manualTag}
                  onChange={setManualTag}
                  inputClassName="w-full px-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800/50
                             border border-zinc-200 dark:border-zinc-700 outline-none
                             focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                             text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
                {manualError && (
                  <p className="text-xs text-red-500">{manualError}</p>
                )}
                <button
                  onClick={handleManualAdd}
                  disabled={!manualTitle.trim() || !manualStart || !manualEnd}
                  className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed
                             text-white font-medium text-sm transition-colors"
                >
                  {t('activityLog.record')}
                </button>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('activityLog.summary')}</h2>
            <div className="text-center py-2">
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {formatDuration(summary.totalMinutes)}
              </p>
              <p className="text-xs text-zinc-400 mt-1">{t('activityLog.totalLogged')}</p>
            </div>
            {summary.byTag.length > 0 && (
              <div className="space-y-2">
                {summary.byTag.map(([tag, minutes], i) => {
                  const pct = summary.totalMinutes > 0 ? (minutes / summary.totalMinutes) * 100 : 0
                  const color = getTagColor(i)
                  return (
                    <div key={tag}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className={`px-1.5 py-0.5 rounded-full ${color.bg} ${color.text} ${color.border} border`}>{tag}</span>
                        <span className="text-zinc-500 tabular-nums">{formatDuration(minutes)}</span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${color.bg.replace('bg-', 'bg-').replace('/20', '/60').replace('100', '400')}`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {dayLogs.length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-2">{t('activityLog.noLogs')}</p>
            )}
          </div>
        </div>

        {/* Right panel: Timeline */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="flex" style={{ height: GRID_TOTAL_HEIGHT }}>
              <div className="w-14 flex-shrink-0 relative">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute right-2 text-[11px] text-zinc-400 dark:text-zinc-500 leading-none select-none"
                    style={{ top: h * HOUR_HEIGHT - 6 }}
                  >
                    {h > 0 ? formatTimeLabel(h) : ''}
                  </div>
                ))}
              </div>

              <div
                ref={gridRef}
                className="flex-1 relative cursor-crosshair"
                style={{ height: GRID_TOTAL_HEIGHT }}
                onPointerDown={(e) => timelineDrag.handleCreatePointerDown(e, dateKey)}
                onPointerMove={timelineDrag.handlePointerMove}
                onPointerUp={timelineDrag.handlePointerUp}
                onDragEnter={timelineDrop.handleDragEnter}
                onDragOver={(e) => timelineDrop.handleDragOver(e, dateKey)}
                onDragLeave={timelineDrop.handleDragLeave}
                onDrop={(e) => timelineDrop.handleDropEvent(e, dateKey)}
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-zinc-100 dark:border-zinc-800/60"
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                ))}
                {HOURS.map((h) => (
                  <div
                    key={`half-${h}`}
                    className="absolute left-0 right-0 border-t border-zinc-50 dark:border-zinc-800/30 border-dashed"
                    style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {isTodaySelected && <NowIndicator />}

                {dayLogs.map((task) => {
                  if (!task.startTime || !task.endTime) return null
                  const seg = timeLogSegmentLayoutForDay(task, dateKey)
                  if (!seg) return null
                  const { top, height } = seg
                  const dur = durationMinutesForTaskSlot(task)
                  const color = logBlockAccentFromTags(task.tags, tagUniverse)

                  return (
                    <button
                      key={`${task.id}::${dateKey}`}
                      className={`absolute left-2 right-2 rounded-lg px-3 py-1.5 text-[12px] leading-tight overflow-hidden
                        cursor-grab active:cursor-grabbing select-none text-left touch-none
                        border transition-shadow hover:shadow-md hover:z-10
                        ${color.border}
                        ${color.bg}
                        ${task.completed ? 'opacity-90' : ''}`}
                      style={{ top, height, minHeight: 24, opacity: timelineDrag.movingTaskId === task.id ? 0.3 : undefined }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        timelineDrag.handleBlockPointerDown(e, task.id, dateKey, task.startTime!, task.endTime!, gridRef.current, {
                          startTime: task.startTime!,
                          endTime: task.endTime!,
                          isTimeLog: true,
                          dueDate: task.dueDate,
                          endDate: task.endDate,
                        })
                      }}
                      onPointerMove={(e) => { const c = getResizeCursor(e); (e.currentTarget as HTMLElement).style.cursor = c ?? 'grab' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          openDetail(task.id)
                        }
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`font-medium truncate ${color.text}`}>
                          {task.title}
                        </span>
                      </div>
                      {height >= 36 && dur != null && dur > 0 && (
                        <span className="block text-[10px] opacity-70 mt-0.5">
                          {task.startTime} – {task.endTime} ({formatDuration(dur)})
                          {isOvernightTimeLog(task) ? ` · ${t('activityLog.spansNextDay', { time: task.endTime })}` : ''}
                        </span>
                      )}
                      {height >= 52 && task.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {task.tags.map((tag) => (
                            <span key={tag} className={`text-[9px] px-1 py-0.5 rounded-full ${color.bg} ${color.text}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  )
                })}

                {timelineDrag.dragPreview && (
                  <div
                    className={`absolute left-2 right-2 rounded-lg pointer-events-none z-20
                      ${timelineDrag.dragPreview.kind === 'create'
                        ? 'bg-emerald-500/20 border-2 border-emerald-500/60'
                        : 'bg-emerald-400/30 border-2 border-emerald-500 shadow-lg'}`}
                    style={{ top: timelineDrag.dragPreview.top, height: timelineDrag.dragPreview.height }}
                  >
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-300 px-1.5 font-medium">
                      {timelineDrag.dragPreview.label}
                    </span>
                  </div>
                )}

                {timelineDrop.dropPreview && (
                  <div
                    className="absolute left-2 right-2 rounded-lg pointer-events-none z-20
                               bg-accent-500/20 border-2 border-accent-500/60 border-dashed"
                    style={{ top: timelineDrop.dropPreview.top, height: timelineDrop.dropPreview.height }}
                  >
                    <span className="text-[10px] text-accent-700 dark:text-accent-300 px-1.5 font-medium">
                      {timelineDrop.dropPreview.label}
                    </span>
                  </div>
                )}

                {timelineDrag.popup && (
                  <InlineTimeAdd
                    startTime={timelineDrag.popup.startTime}
                    endTime={timelineDrag.popup.endTime}
                    onDone={handleCreateDone}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {detailTask && <TaskDetail task={detailTask} onClose={closeDetail} />}
    </div>
  )
}
