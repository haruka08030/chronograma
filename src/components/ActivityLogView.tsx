import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { format, addDays, subDays, isToday } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import { HOUR_HEIGHT, HOURS, timeToY, formatTimeLabel, timeToMinutes, formatDuration } from '../lib/timeGrid'
import { useTimelineDrag, getResizeCursor } from '../lib/useTimelineDrag'
import { useTimelineDrop } from '../lib/useTimelineDrop'
import { TaskDetail } from './TaskDetail'
import { getTagColor, logBlockAccentFromTags, timeLogTagUniverse } from '../lib/tagColors'

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
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
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
          placeholder="ログを追加"
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
  const [selectedDate, setSelectedDate] = useState(new Date())
  const dateKey = format(selectedDate, 'yyyy-MM-dd')
  const isTodaySelected = isToday(selectedDate)

  const tasks = useTaskStore((s) => s.tasks)
  const updateTask = useTaskStore((s) => s.updateTask)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const startTimer = useTaskStore((s) => s.startTimer)
  const stopTimer = useTaskStore((s) => s.stopTimer)

  const [timerElapsed, setTimerElapsed] = useState(0)
  const [timerTitle, setTimerTitle] = useState('')
  const [timerTag, setTimerTag] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [manualTag, setManualTag] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

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
    onMoveDone: (taskId, _dk, startTime, endTime) => { updateTask(taskId, { dueDate: dateKey, startTime, endTime }) },
    onResizeDone: (taskId, startTime, endTime) => { updateTask(taskId, { startTime, endTime }) },
    onBlockTap: useCallback((taskId: string) => {
      setDetailId(taskId)
    }, []),
  })

  const getTaskDuration = useCallback((taskId: string): number | null => {
    const t = tasks.find((x) => x.id === taskId)
    if (t?.startTime && t?.endTime) return timeToMinutes(t.endTime) - timeToMinutes(t.startTime)
    return null
  }, [tasks])

  const timelineDrop = useTimelineDrop({
    getRelativeY,
    getTaskDuration,
    onDrop: (taskId, _dk, startTime, endTime) => {
      updateTask(taskId, { dueDate: dateKey, startTime, endTime, isTimeLog: true, completed: true })
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
      .filter((t) => t.dueDate === dateKey && t.startTime && t.endTime && !t.parentId && t.isTimeLog)
      .sort((a, b) => timeToMinutes(a.startTime!) - timeToMinutes(b.startTime!))
  }, [tasks, dateKey])

  const tagUniverse = useMemo(() => timeLogTagUniverse(tasks), [tasks])

  const summary = useMemo(() => {
    let totalMinutes = 0
    const byTag = new Map<string, number>()
    for (const t of dayLogs) {
      if (!t.startTime || !t.endTime) continue
      const dur = timeToMinutes(t.endTime) - timeToMinutes(t.startTime)
      if (dur <= 0) continue
      totalMinutes += dur
      for (const tag of t.tags) {
        byTag.set(tag, (byTag.get(tag) ?? 0) + dur)
      }
      if (t.tags.length === 0) {
        byTag.set('未分類', (byTag.get('未分類') ?? 0) + dur)
      }
    }
    return { totalMinutes, byTag: Array.from(byTag.entries()).sort((a, b) => b[1] - a[1]) }
  }, [dayLogs])

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
    if (timeToMinutes(manualEnd) <= timeToMinutes(manualStart)) {
      setManualError('終了時刻は開始時刻より後にしてください')
      return
    }
    setManualError(null)
    const tags = manualTag.trim() ? [manualTag.trim()] : []
    addTimeLog(title, dateKey, manualStart, manualEnd, tags)
    setManualTitle('')
    setManualStart('')
    setManualEnd('')
    setManualTag('')
    setShowManual(false)
  }

  const dateLabel = format(selectedDate, 'M月d日 (E)', { locale: ja })
  const detailTask = detailId ? tasks.find((t) => t.id === detailId) : null

  return (
    <>
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-8 pb-4 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">ログ</h1>
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
            今日
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
              タイマー
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
                  停止して記録
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={timerTitle}
                  onChange={(e) => setTimerTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleStartTimer() }}
                  placeholder="何をする？"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800/50
                             border border-zinc-200 dark:border-zinc-700 outline-none
                             focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                             text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
                <div className="flex gap-2">
                  <input
                    value={timerTag}
                    onChange={(e) => setTimerTag(e.target.value)}
                    placeholder="タグ (任意)"
                    className="flex-1 px-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800/50
                               border border-zinc-200 dark:border-zinc-700 outline-none
                               focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                               text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                    list="tag-suggestions"
                  />
                  <datalist id="tag-suggestions">
                    {tagUniverse.map((t) => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <button
                  onClick={handleStartTimer}
                  disabled={!timerTitle.trim()}
                  className="w-full py-2.5 rounded-xl bg-accent-500 hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed
                             text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                  開始
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
                後から記録
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
                  placeholder="活動名"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800/50
                             border border-zinc-200 dark:border-zinc-700 outline-none
                             focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                             text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-zinc-400 mb-0.5 block">開始</label>
                    <input
                      type="time"
                      value={manualStart}
                      onChange={(e) => setManualStart(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800/50
                                 border border-zinc-200 dark:border-zinc-700 outline-none
                                 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                                 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 mb-0.5 block">終了</label>
                    <input
                      type="time"
                      value={manualEnd}
                      onChange={(e) => setManualEnd(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800/50
                                 border border-zinc-200 dark:border-zinc-700 outline-none
                                 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                                 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>
                <input
                  value={manualTag}
                  onChange={(e) => setManualTag(e.target.value)}
                  placeholder="タグ (任意)"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800/50
                             border border-zinc-200 dark:border-zinc-700 outline-none
                             focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                             text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                  list="tag-suggestions-manual"
                />
                <datalist id="tag-suggestions-manual">
                  {tagUniverse.map((t) => <option key={t} value={t} />)}
                </datalist>
                {manualError && (
                  <p className="text-xs text-red-500">{manualError}</p>
                )}
                <button
                  onClick={handleManualAdd}
                  disabled={!manualTitle.trim() || !manualStart || !manualEnd}
                  className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed
                             text-white font-medium text-sm transition-colors"
                >
                  記録する
                </button>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">サマリー</h2>
            <div className="text-center py-2">
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {formatDuration(summary.totalMinutes)}
              </p>
              <p className="text-xs text-zinc-400 mt-1">合計記録時間</p>
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
              <p className="text-xs text-zinc-400 text-center py-2">まだ記録がありません</p>
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
                  const top = timeToY(task.startTime)
                  const height = Math.max(timeToY(task.endTime) - top, HOUR_HEIGHT / 4)
                  const dur = timeToMinutes(task.endTime) - timeToMinutes(task.startTime)
                  const color = logBlockAccentFromTags(task.tags, tagUniverse)

                  return (
                    <button
                      key={task.id}
                      className={`absolute left-2 right-2 rounded-lg px-3 py-1.5 text-[12px] leading-tight overflow-hidden
                        cursor-grab active:cursor-grabbing select-none text-left touch-none
                        border transition-shadow hover:shadow-md hover:z-10
                        ${color.border}
                        ${color.bg}
                        ${task.completed ? 'opacity-90' : ''}`}
                      style={{ top, height, minHeight: 24, opacity: timelineDrag.movingTaskId === task.id ? 0.3 : undefined }}
                      onPointerDown={(e) => { e.stopPropagation(); timelineDrag.handleBlockPointerDown(e, task.id, dateKey, task.startTime!, task.endTime!, gridRef.current) }}
                      onPointerMove={(e) => { const c = getResizeCursor(e); (e.currentTarget as HTMLElement).style.cursor = c ?? 'grab' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          setDetailId(task.id)
                        }
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`font-medium truncate ${color.text}`}>
                          {task.title}
                        </span>
                      </div>
                      {height >= 36 && (
                        <span className="block text-[10px] opacity-70 mt-0.5">
                          {task.startTime} – {task.endTime} ({formatDuration(dur)})
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

    {detailTask && (
      <TaskDetail task={detailTask} onClose={() => setDetailId(null)} />
    )}
    </>
  )
}
