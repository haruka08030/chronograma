import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isToday,
  addWeeks,
  subWeeks,
} from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import { TaskDetail } from './TaskDetail'
import { CompleteWithLogModal, type CompleteWithLogDraft } from './CompleteWithLogModal'
import { TimeLogTagField } from './TimeLogTagField'
import { HOUR_HEIGHT, HOURS, timeToY, formatTimeLabel, timeToMinutes, durationMinutesForTaskId } from '../lib/timeGrid'
import { matchPlanAndActualForDate, type MatchedPair, type MatchStatus } from '../lib/matchEvents'
import { useTimelineDrag, getResizeCursor, type CreatePopup } from '../lib/useTimelineDrag'
import { useTimelineDrop } from '../lib/useTimelineDrop'
import {
  initGoogleAuth,
  signIn,
  signInSilent,
  signOut,
  fetchCalendarEvents,
  isGoogleAvailable,
  getClientId,
} from '../lib/googleCalendar'
import type { CalendarEvent } from '../types/calendarEvent'
import type { PlannedItem } from '../types/plannedItem'
import type { Task } from '../types/task'
import { calendarEventToPlannedItem, scheduledTaskToPlannedItem } from '../lib/plannedItemUtils'
import { habitToPlannedItem } from '../lib/habitSlots'
import { useNowMinuteTick } from '../hooks/useNowMinuteTick'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'

const GRID_TOTAL_HEIGHT = HOUR_HEIGHT * 24
const GUTTER_WIDTH = 56

/** 予定 vs ログ: ソース種別ではなくマッチステータスで色を統一 */
function blockStylesForStatus(status: MatchStatus): {
  borderClass: string
  bgClass: string
  textClass: string
} {
  switch (status) {
    case 'matched':
      return {
        borderClass: 'border-emerald-400 dark:border-emerald-500/50',
        bgClass: 'bg-emerald-50 dark:bg-emerald-500/15',
        textClass: 'text-emerald-900 dark:text-emerald-100',
      }
    case 'time-drift':
      return {
        borderClass: 'border-amber-400 dark:border-amber-500/60',
        bgClass: 'bg-amber-50 dark:bg-amber-500/10',
        textClass: 'text-amber-800 dark:text-amber-200',
      }
    case 'planned-only':
      return {
        borderClass: 'border-red-300 dark:border-red-500/40 border-dashed',
        bgClass: 'bg-red-50/60 dark:bg-red-500/10',
        textClass: 'text-red-800 dark:text-red-200',
      }
    case 'actual-only':
      return {
        borderClass: 'border-purple-300 dark:border-purple-500/40',
        bgClass: 'bg-purple-50 dark:bg-purple-500/15',
        textClass: 'text-purple-800 dark:text-purple-200',
      }
    default:
      return {
        borderClass: 'border-zinc-200 dark:border-zinc-600',
        bgClass: 'bg-zinc-50 dark:bg-zinc-800/80',
        textClass: 'text-zinc-800 dark:text-zinc-200',
      }
  }
}

function neutralPlanStyles(): { borderClass: string; bgClass: string; textClass: string } {
  return {
    borderClass: 'border-zinc-200 dark:border-zinc-600',
    bgClass: 'bg-zinc-50 dark:bg-zinc-800/80',
    textClass: 'text-zinc-800 dark:text-zinc-200',
  }
}

/** 左列（予定）: マッチ結果。タスク完了のみマッチ色に寄せる（習慣はログ突合のみ。達成フラグだけでは緑にしない） */
function planBlockStyles(
  matchStatus: MatchedPair | undefined,
  opts?: { taskCompleted?: boolean },
): { borderClass: string; bgClass: string; textClass: string } {
  if (opts?.taskCompleted) {
    return blockStylesForStatus('matched')
  }
  if (!matchStatus) return neutralPlanStyles()
  return blockStylesForStatus(matchStatus.status)
}

/** 右列（ログ）: マッチステータスのみ（タグ色は使わない） */
function actualBlockStyles(matchStatus: MatchedPair | undefined): {
  borderClass: string
  bgClass: string
  textClass: string
} {
  if (!matchStatus) return neutralPlanStyles()
  return blockStylesForStatus(matchStatus.status)
}

function PlannedItemBlock({ item, matchStatus, dateKey, onGoogleDone, onHabitDone, onOpen }: {
  item: PlannedItem
  matchStatus?: MatchedPair
  dateKey: string
  onGoogleDone: (title: string, dateKey: string, startTime: string, endTime: string) => void
  onHabitDone?: () => void
  onOpen?: () => void
}) {
  const { t } = useTranslation()
  const top = timeToY(item.startTime)
  const height = Math.max(timeToY(item.endTime) - top, HOUR_HEIGHT / 4)

  const isDone = matchStatus?.status === 'matched' || matchStatus?.status === 'time-drift'
  const styles = planBlockStyles(matchStatus)

  let label: string | null = null
  if (matchStatus?.status === 'time-drift') {
    label = t('planVsActual.statusDrift', { count: matchStatus.driftMinutes })
  } else if (matchStatus?.status === 'planned-only') {
    label = t('planVsActual.statusNotRun')
  }

  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-[11px] leading-tight overflow-hidden
        border ${styles.borderClass} ${styles.bgClass} ${styles.textClass} select-none group/planned
        ${onOpen ? 'cursor-pointer' : ''}`}
      style={{ top, height, minHeight: 18 }}
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
      onClick={(e) => {
        if (!onOpen) return
        e.stopPropagation()
        onOpen()
      }}
    >
      <div className="flex items-start gap-0.5">
        <span className="font-medium truncate flex-1">{item.summary}</span>
        {item.source === 'google' && !isDone && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onGoogleDone(item.summary, dateKey, item.startTime, item.endTime)
            }}
            className="flex-shrink-0 w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-600
                       hover:bg-emerald-100 dark:hover:bg-emerald-500/20 hover:border-emerald-500
                       transition-colors opacity-100 sm:opacity-0 sm:group-hover/planned:opacity-100 flex items-center justify-center"
            title={t('planVsActual.logAsActualTitle')}
          >
            <svg className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </button>
        )}
        {item.source === 'habit' && !isDone && onHabitDone && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onHabitDone()
            }}
            className="flex-shrink-0 w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-600
                       hover:bg-emerald-100 dark:hover:bg-emerald-500/20 hover:border-emerald-500
                       transition-colors opacity-100 sm:opacity-0 sm:group-hover/planned:opacity-100 flex items-center justify-center"
            title={t('planVsActual.logAsActualTitle')}
          >
            <svg className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </button>
        )}
      </div>
      {height >= 32 && (
        <span className="block text-[10px] opacity-70 mt-px">
          {item.startTime} – {item.endTime}
        </span>
      )}
      {label && (
        <span className={`block text-[9px] font-semibold mt-0.5 opacity-90 ${styles.textClass}`}>
          {label}
        </span>
      )}
    </div>
  )
}

function ScheduledTaskDragBlock({ task, matchStatus, onPointerDown, onOpenDetail }: {
  task: Task
  matchStatus?: MatchedPair
  onPointerDown: (e: React.PointerEvent) => void
  onOpenDetail: () => void
}) {
  const { t } = useTranslation()
  const top = timeToY(task.startTime!)
  const height = Math.max(timeToY(task.endTime!) - top, HOUR_HEIGHT / 4)

  const styles = planBlockStyles(matchStatus, { taskCompleted: task.completed })
  let label: string | null = null

  if (matchStatus?.status === 'time-drift') {
    label = t('planVsActual.statusDrift', { count: matchStatus.driftMinutes })
  } else if (matchStatus?.status === 'planned-only' && !task.completed) {
    label = t('planVsActual.statusNotRun')
  }

  const handlePointerMoveLocal = (e: React.PointerEvent) => {
    const cursor = getResizeCursor(e)
    ;(e.currentTarget as HTMLElement).style.cursor = cursor ?? 'grab'
  }

  return (
    <button
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e) }}
      onClick={(e) => {
        e.stopPropagation()
        onOpenDetail()
      }}
      onPointerMove={handlePointerMoveLocal}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onOpenDetail()
        }
      }}
      className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-[11px] leading-tight overflow-hidden cursor-grab active:cursor-grabbing
        border transition-shadow hover:shadow-md hover:z-10 select-none text-left touch-none
        ${styles.borderClass} ${styles.bgClass} ${styles.textClass}
        ${task.completed ? 'line-through opacity-80' : ''}`}
      style={{ top, height, minHeight: 18 }}
    >
      <span className="font-medium truncate block">{task.title}</span>
      {height >= 32 && (
        <span className="block text-[10px] opacity-70 mt-px">
          {task.startTime} – {task.endTime}
        </span>
      )}
      {label && (
        <span className={`block text-[9px] font-semibold mt-0.5 opacity-90 ${styles.textClass}`}>{label}</span>
      )}
    </button>
  )
}

function ActualBlock({ task, matchStatus, onPointerDown, onOpenDetail }: {
  task: { id: string; title: string; startTime: string; endTime: string }
  matchStatus?: MatchedPair
  onPointerDown: (e: React.PointerEvent) => void
  onOpenDetail: () => void
}) {
  const { t } = useTranslation()
  const top = timeToY(task.startTime)
  const height = Math.max(timeToY(task.endTime) - top, HOUR_HEIGHT / 4)

  const styles = actualBlockStyles(matchStatus)
  let label: string | null = null

  if (matchStatus?.status === 'time-drift') {
    label = t('planVsActual.statusDrift', { count: matchStatus.driftMinutes })
  } else if (matchStatus?.status === 'actual-only') {
    label = t('planVsActual.statusUnplanned')
  }

  const handlePointerMoveLocal = (e: React.PointerEvent) => {
    const cursor = getResizeCursor(e)
    ;(e.currentTarget as HTMLElement).style.cursor = cursor ?? 'grab'
  }

  return (
    <button
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e) }}
      onClick={(e) => {
        e.stopPropagation()
        onOpenDetail()
      }}
      onPointerMove={handlePointerMoveLocal}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onOpenDetail()
        }
      }}
      className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-[11px] leading-tight overflow-hidden cursor-grab active:cursor-grabbing
        border transition-shadow hover:shadow-md hover:z-10 select-none text-left touch-none
        ${styles.borderClass} ${styles.bgClass} ${styles.textClass}`}
      style={{ top, height, minHeight: 18 }}
    >
      <span className="font-medium truncate block">{task.title}</span>
      {height >= 32 && (
        <span className="block text-[10px] opacity-70 mt-px">
          {task.startTime} – {task.endTime}
        </span>
      )}
      {label && (
        <span className={`block text-[9px] font-semibold mt-0.5 opacity-90 ${styles.textClass}`}>
          {label}
        </span>
      )}
    </button>
  )
}

function InlineTimeAdd({ popup, onDone }: { popup: CreatePopup; onDone: (title?: string) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  const submit = () => {
    const trimmed = value.trim()
    onDone(trimmed || undefined)
  }

  const isLog = popup.intent === 'log'

  return (
    <div
      className={`absolute left-0.5 right-0.5 z-30 rounded-md border-2 shadow-lg overflow-hidden
        ${isLog ? 'border-emerald-500 bg-white dark:bg-zinc-900' : 'border-cyan-500 bg-white dark:bg-zinc-900'}`}
      style={{ top: timeToY(popup.startTime), height: Math.max(timeToY(popup.endTime) - timeToY(popup.startTime), 40) }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-1.5 flex flex-col h-full">
        <input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onDone()
          }}
          onBlur={submit}
          placeholder={isLog ? t('planVsActual.inlinePlaceholderLog') : t('planVsActual.inlinePlaceholderTask')}
          className="w-full text-xs bg-transparent outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
        />
        <span className="text-[10px] text-zinc-400 mt-auto">
          {popup.startTime} – {popup.endTime}
        </span>
      </div>
    </div>
  )
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

function GoogleConnectBanner() {
  const { t } = useTranslation()
  const googleConnected = useTaskStore((s) => s.googleConnected)
  const setGoogleConnected = useTaskStore((s) => s.setGoogleConnected)
  const setGoogleAccessToken = useTaskStore((s) => s.setGoogleAccessToken)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clientId = getClientId()

  const handleConnect = async () => {
    setLoading(true)
    setError(null)
    try {
      await initGoogleAuth()
      const token = await signIn()
      setGoogleAccessToken(token)
      setGoogleConnected(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('account.genericError'))
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = () => {
    signOut()
    setGoogleAccessToken(null)
    setGoogleConnected(false)
    useTaskStore.getState().setCalendarEvents([])
  }

  if (!clientId) {
    return (
      <div className="mx-6 mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-sm text-amber-700 dark:text-amber-300">
        <p className="font-medium">{t('planVsActual.googleHeading')}</p>
        <p className="text-xs mt-1 opacity-80">
          {t('planVsActual.googleBody')}
        </p>
      </div>
    )
  }

  if (googleConnected) {
    return (
      <div className="mx-6 mt-4 flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          {t('planVsActual.googleConnected')}
        </div>
        <button
          onClick={handleDisconnect}
          className="ml-auto text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          {t('planVsActual.disconnect')}
        </button>
      </div>
    )
  }

  return (
    <div className="mx-6 mt-4">
      <button
        onClick={handleConnect}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                   bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700
                   hover:bg-zinc-50 dark:hover:bg-zinc-750 transition-colors text-sm font-medium
                   text-zinc-700 dark:text-zinc-300 shadow-sm disabled:opacity-50"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        {loading ? t('planVsActual.connecting') : t('planVsActual.connect')}
      </button>
      {error && (
        <p className="text-xs text-red-500 mt-1.5">{error}</p>
      )}
    </div>
  )
}

function Legend() {
  const { t } = useTranslation()
  const matched = blockStylesForStatus('matched')
  const drift = blockStylesForStatus('time-drift')
  const plannedOnly = blockStylesForStatus('planned-only')
  const actualOnly = blockStylesForStatus('actual-only')
  const neutral = neutralPlanStyles()
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-2 text-[11px]">
      <div className="flex items-center gap-1.5">
        <div className={`w-3 h-3 rounded-sm border ${matched.bgClass} ${matched.borderClass}`} />
        <span className="text-zinc-500 dark:text-zinc-400">{t('planVsActual.legendDone')}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`w-3 h-3 rounded-sm border ${drift.bgClass} ${drift.borderClass}`} />
        <span className="text-zinc-500 dark:text-zinc-400">{t('planVsActual.legendDrift')}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`w-3 h-3 rounded-sm border ${plannedOnly.bgClass} ${plannedOnly.borderClass}`} />
        <span className="text-zinc-500 dark:text-zinc-400">{t('planVsActual.legendMissed')}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`w-3 h-3 rounded-sm border ${actualOnly.bgClass} ${actualOnly.borderClass}`} />
        <span className="text-zinc-500 dark:text-zinc-400">{t('planVsActual.legendExtra')}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`w-3 h-3 rounded-sm border ${neutral.bgClass} ${neutral.borderClass}`} />
        <span className="text-zinc-500 dark:text-zinc-400">{t('planVsActual.legendPending')}</span>
      </div>
    </div>
  )
}

export function PlanVsActualView() {
  const { t, i18n } = useTranslation()
  const [anchor, setAnchor] = useState(new Date())
  const tasks = useTaskStore((s) => s.tasks)
  const habits = useTaskStore((s) => s.habits)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  const googleConnected = useTaskStore((s) => s.googleConnected)
  const setCalendarEvents = useTaskStore((s) => s.setCalendarEvents)
  const setGoogleAccessToken = useTaskStore((s) => s.setGoogleAccessToken)
  const addTaskWithTime = useTaskStore((s) => s.addTaskWithTime)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const addCompletedTaskWithTime = useTaskStore((s) => s.addCompletedTaskWithTime)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const updateTask = useTaskStore((s) => s.updateTask)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const startTimer = useTaskStore((s) => s.startTimer)
  const selectView = useTaskStore((s) => s.selectView)
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)
  const [showTimerInput, setShowTimerInput] = useState(false)
  const [timerInputValue, setTimerInputValue] = useState('')
  const [timerTagValue, setTimerTagValue] = useState('')
  const [completionDraft, setCompletionDraft] = useState<CompleteWithLogDraft | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const days = useMemo(() => {
    const ws = startOfWeek(anchor, { weekStartsOn: 1 })
    const we = endOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: ws, end: we })
  }, [anchor])

  useEffect(() => {
    if (!googleConnected) return
    let cancelled = false

    const doFetch = async () => {
      try {
        if (!isGoogleAvailable()) {
          await initGoogleAuth()
        }

        let token = useTaskStore.getState().googleAccessToken
        if (!token) {
          try {
            token = await signInSilent()
          } catch {
            token = await signIn()
          }
          if (!cancelled) setGoogleAccessToken(token)
        }

        const ws = startOfWeek(anchor, { weekStartsOn: 1 })
        const we = endOfWeek(anchor, { weekStartsOn: 1 })
        we.setHours(23, 59, 59)
        const events = await fetchCalendarEvents(ws, we, token)
        if (!cancelled) {
          setCalendarEvents(events)
          setFetchError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setFetchError(e instanceof Error ? e.message : t('account.genericError'))
        }
      }
    }

    doFetch()
    return () => { cancelled = true }
  }, [anchor, googleConnected, setCalendarEvents, setGoogleAccessToken, t])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of calendarEvents) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  }, [calendarEvents])

  const scheduledTasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.dueDate || t.parentId || !t.startTime || !t.endTime || t.isTimeLog) continue
      const arr = map.get(t.dueDate) ?? []
      arr.push(t)
      map.set(t.dueDate, arr)
    }
    return map
  }, [tasks])

  const logTasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.dueDate || t.parentId || !t.startTime || !t.endTime || !t.isTimeLog) continue
      const arr = map.get(t.dueDate) ?? []
      arr.push(t)
      map.set(t.dueDate, arr)
    }
    return map
  }, [tasks])

  const plannedListsByDate = useMemo(() => {
    const map = new Map<string, PlannedItem[]>()
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd')
      const list: PlannedItem[] = []
      for (const e of eventsByDate.get(key) ?? []) {
        const p = calendarEventToPlannedItem(e)
        if (p) list.push(p)
      }
      for (const h of habits) {
        const p = habitToPlannedItem(h, key)
        if (p) list.push(p)
      }
      for (const t of scheduledTasksByDate.get(key) ?? []) {
        const p = scheduledTaskToPlannedItem(t)
        if (p) list.push(p)
      }
      list.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
      map.set(key, list)
    }
    return map
  }, [days, eventsByDate, habits, scheduledTasksByDate])

  const matchesByDate = useMemo(() => {
    const map = new Map<string, MatchedPair[]>()
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd')
      const planned = plannedListsByDate.get(key) ?? []
      const actual = logTasksByDate.get(key) ?? []
      map.set(key, matchPlanAndActualForDate(planned, actual))
    }
    return map
  }, [days, plannedListsByDate, logTasksByDate])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = HOUR_HEIGHT * 7.5
    }
  }, [])

  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const weekLabel = `${format(days[0], i18n.resolvedLanguage?.startsWith('ja') ? 'M月d日' : 'MMM d', { locale: dateLocale })} – ${format(days[6], i18n.resolvedLanguage?.startsWith('ja') ? 'M月d日' : 'MMM d', { locale: dateLocale })}`

  const getRelativeY = useCallback((clientY: number, dateKey: string) => {
    if (!gridRef.current) return 0
    const cols = gridRef.current.querySelectorAll<HTMLElement>('[data-datekey]')
    for (const col of cols) {
      if (col.dataset.datekey === dateKey) {
        const rect = col.getBoundingClientRect()
        return Math.max(0, Math.min(clientY - rect.top, GRID_TOTAL_HEIGHT))
      }
    }
    return 0
  }, [])

  const getDateKeyFromX = useCallback((clientX: number): string | null => {
    if (!gridRef.current) return null
    const cols = gridRef.current.querySelectorAll<HTMLElement>('[data-datekey]')
    for (const col of cols) {
      const rect = col.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) {
        return col.dataset.datekey ?? null
      }
    }
    return null
  }, [])

  const timelineDrag = useTimelineDrag({
    getRelativeY,
    getDateKeyFromX,
    onMoveDone: (taskId: string, dateKey: string, startTime: string, endTime: string) => {
      updateTask(taskId, { dueDate: dateKey, startTime, endTime })
    },
    onResizeDone: (taskId: string, startTime: string, endTime: string) => {
      updateTask(taskId, { startTime, endTime })
    },
    defaultCreateIntent: 'schedule',
    onBlockTap: useCallback((taskId: string) => {
      const tapped = useTaskStore.getState().tasks.find((t) => t.id === taskId)
      if (!tapped) return
      if (!tapped.completed && !tapped.isTimeLog && tapped.dueDate && tapped.startTime && tapped.endTime) {
        setCompletionDraft({
          taskId: tapped.id,
          title: tapped.title,
          date: tapped.dueDate,
          startTime: tapped.startTime,
          endTime: tapped.endTime,
          memo: tapped.description.trim(),
          mode: 'as-planned',
          tags: [...tapped.tags],
        })
        return
      }
      openDetail(taskId)
    }, [openDetail]),
  })

  const movingTask = useMemo(() => {
    const id = timelineDrag.movingTaskId
    if (!id) return null
    return tasks.find((t) => t.id === id) ?? null
  }, [timelineDrag.movingTaskId, tasks])

  const getTaskDuration = useCallback(
    (taskId: string): number | null => durationMinutesForTaskId(tasks, taskId),
    [tasks],
  )

  const timelineDropSchedule = useTimelineDrop({
    getRelativeY,
    getTaskDuration,
    onDrop: (taskId, dateKey, startTime, endTime) => {
      updateTask(taskId, { dueDate: dateKey, startTime, endTime, isTimeLog: false })
    },
  })

  const timelineDropLog = useTimelineDrop({
    getRelativeY,
    getTaskDuration,
    onDrop: (taskId, dateKey, startTime, endTime) => {
      updateTask(taskId, { dueDate: dateKey, startTime, endTime, isTimeLog: true, completed: true })
    },
  })

  const handleCreateDone = useCallback((title?: string) => {
    const p = timelineDrag.popup
    if (title && p) {
      if (p.intent === 'log') {
        addTimeLog(title, p.dateKey, p.startTime, p.endTime)
      } else {
        addTaskWithTime(title, p.dateKey, p.startTime, p.endTime)
      }
    }
    timelineDrag.dismissPopup()
  }, [timelineDrag, addTaskWithTime, addTimeLog])

  const handlePlannedDone = useCallback((title: string, dateKey: string, startTime: string, endTime: string) => {
    addCompletedTaskWithTime(title, dateKey, startTime, endTime)
  }, [addCompletedTaskWithTime])

  const openCompleteWithLog = useCallback((task: Task) => {
    if (task.completed || task.isTimeLog || !task.dueDate || !task.startTime || !task.endTime) {
      openDetail(task.id)
      return
    }
    setCompletionDraft({
      taskId: task.id,
      title: task.title,
      date: task.dueDate,
      startTime: task.startTime,
      endTime: task.endTime,
      memo: task.description.trim(),
      mode: 'as-planned',
      tags: [...task.tags],
    })
  }, [openDetail])

  /** 習慣スロットのチェックは Google 予定と同様ワンクリック（タイムログ追加＋未達成なら達成）。既に達成済みでログだけ欠けた場合はログのみ追加 */
  const completeHabitSlotFromPlan = useCallback(
    (habitId: string, title: string, dateKey: string, startTime: string, endTime: string) => {
      const toMin = (v: string) => {
        const [h, m] = v.split(':').map(Number)
        return h * 60 + m
      }
      if (toMin(endTime) <= toMin(startTime)) {
        alert(t('alert.endAfterStart'))
        return
      }
      addCompletedTaskWithTime(title, dateKey, startTime, endTime)
      const habit = habits.find((h) => h.id === habitId)
      const alreadyDone = habit?.completedDates.includes(dateKey) ?? false
      if (!alreadyDone) {
        toggleHabitDate(habitId, dateKey)
      }
    },
    [addCompletedTaskWithTime, toggleHabitDate, habits, t],
  )

  const submitCompleteWithLog = useCallback(() => {
    if (!completionDraft) return
    const memo = completionDraft.memo.trim()
    const toMin = (v: string) => {
      const [h, m] = v.split(':').map(Number)
      return h * 60 + m
    }
    if (toMin(completionDraft.endTime) <= toMin(completionDraft.startTime)) {
      alert(t('alert.endAfterStart'))
      return
    }
    addTimeLog(
      completionDraft.title,
      completionDraft.date,
      completionDraft.startTime,
      completionDraft.endTime,
      completionDraft.tags,
      memo || undefined,
    )
    toggleTask(completionDraft.taskId)
    setCompletionDraft(null)
  }, [completionDraft, addTimeLog, toggleTask, t])

  function getMatchForPlanned(dateKey: string, plannedId: string): MatchedPair | undefined {
    return matchesByDate.get(dateKey)?.find(
      (m) => m.planned?.id === plannedId && m.status !== 'actual-only',
    )
  }

  function getMatchForActual(dateKey: string, taskId: string): MatchedPair | undefined {
    return matchesByDate.get(dateKey)?.find(
      (m) => m.actual?.id === taskId && m.status !== 'planned-only',
    )
  }

  const habitIdFromSlotId = (slotId: string): string | null => {
    const m = /^habit-slot::([^:]+)::/.exec(slotId)
    return m ? m[1] : null
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-6 pt-8 pb-4 flex-shrink-0">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{t('planVsActual.title')}</h1>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{weekLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {!activeTimer && !showTimerInput && (
              <button
                onClick={() => setShowTimerInput(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                           bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400
                           hover:bg-accent-100 dark:hover:bg-accent-500/20 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('planVsActual.startRecording')}
              </button>
            )}
            {showTimerInput && !activeTimer && (
              <div className="flex flex-col gap-1.5 min-w-[11rem] max-w-[14rem]">
                <input
                  autoFocus
                  value={timerInputValue}
                  onChange={(e) => setTimerInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && timerInputValue.trim()) {
                      const tags = timerTagValue.trim() ? [timerTagValue.trim()] : []
                      startTimer(timerInputValue.trim(), tags)
                      setTimerInputValue('')
                      setTimerTagValue('')
                      setShowTimerInput(false)
                    }
                    if (e.key === 'Escape') { setShowTimerInput(false); setTimerInputValue(''); setTimerTagValue('') }
                  }}
                  onBlur={() => { if (!timerInputValue.trim() && !timerTagValue.trim()) setShowTimerInput(false) }}
                  placeholder={t('planVsActual.timerWhat')}
                  className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-zinc-800 border border-accent-300 dark:border-accent-500/40
                             outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
                <TimeLogTagField
                  compact
                  listId="plan-vs-actual-timer"
                  value={timerTagValue}
                  onChange={setTimerTagValue}
                  inputClassName="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700
                             outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && timerInputValue.trim()) {
                      const tags = timerTagValue.trim() ? [timerTagValue.trim()] : []
                      startTimer(timerInputValue.trim(), tags)
                      setTimerInputValue('')
                      setTimerTagValue('')
                      setShowTimerInput(false)
                    }
                    if (e.key === 'Escape') { setShowTimerInput(false); setTimerInputValue(''); setTimerTagValue('') }
                  }}
                />
              </div>
            )}
            {activeTimer && (
              <button
                onClick={() => selectView('activity-log')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                           bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400
                           hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {t('planVsActual.recording')}
              </button>
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAnchor((a) => subWeeks(a, 1))}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <button
                onClick={() => setAnchor(new Date())}
                className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800
                           text-zinc-600 dark:text-zinc-400 transition-colors"
              >
                {t('planVsActual.thisWeek')}
              </button>
              <button
                onClick={() => setAnchor((a) => addWeeks(a, 1))}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <GoogleConnectBanner />

        {fetchError && googleConnected && (
          <div className="mx-6 mt-2 text-xs text-red-500">{fetchError}</div>
        )}

        <Legend />

        <div className="flex border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 px-2">
          <div style={{ width: GUTTER_WIDTH }} className="flex-shrink-0" />
          <div className="flex-1 grid grid-cols-7">
            {days.map((day) => {
              const today = isToday(day)
              return (
                <div key={day.toISOString()} className={`text-center py-2 ${today ? 'text-accent-600 dark:text-accent-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                  <div className="text-[11px] font-medium">{format(day, 'E', { locale: dateLocale })}</div>
                  <div className={`text-lg font-semibold inline-flex items-center justify-center w-8 h-8 rounded-full
                    ${today ? 'bg-accent-500 text-white' : ''}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="flex justify-center gap-0.5 mt-0.5">
                    <span className="text-[9px] text-blue-500 dark:text-blue-400">{t('common.planned')}</span>
                    <span className="text-[9px] text-zinc-300 dark:text-zinc-600">|</span>
                    <span className="text-[9px] text-emerald-500 dark:text-emerald-400">{t('common.log')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-2">
          <div className="flex" style={{ height: GRID_TOTAL_HEIGHT }}>
            <div style={{ width: GUTTER_WIDTH }} className="flex-shrink-0 relative">
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
              className="flex-1 grid grid-cols-7 relative"
              onPointerMove={timelineDrag.handlePointerMove}
              onPointerUp={timelineDrag.handlePointerUp}
            >
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const plannedItems = plannedListsByDate.get(key) ?? []
                const dayLogs = logTasksByDate.get(key) ?? []
                const today = isToday(day)

                return (
                  <div
                    key={key}
                    data-datekey={key}
                    className={`relative border-l border-zinc-100 dark:border-zinc-800
                      ${today ? 'bg-accent-50/20 dark:bg-accent-500/5' : ''}`}
                    style={{ height: GRID_TOTAL_HEIGHT }}
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

                    <div className="absolute top-0 bottom-0 left-1/2 w-px bg-zinc-100 dark:bg-zinc-800/60 z-[1]" />

                    {today && <NowIndicator />}

                    {/* 予定列 */}
                    <div
                      className="absolute top-0 bottom-0 left-0 right-1/2 cursor-crosshair z-[2]"
                      onPointerDown={(e) => timelineDrag.handleCreatePointerDown(e, key, 'schedule')}
                      onDragEnter={timelineDropSchedule.handleDragEnter}
                      onDragOver={(e) => timelineDropSchedule.handleDragOver(e, key)}
                      onDragLeave={timelineDropSchedule.handleDragLeave}
                      onDrop={(e) => timelineDropSchedule.handleDropEvent(e, key)}
                    >
                      {plannedItems.map((item) => {
                        const match = getMatchForPlanned(key, item.id)
                        if (item.source === 'scheduled-task') {
                          const tid = item.id.startsWith('task::') ? item.id.slice('task::'.length) : ''
                          const task = tasks.find((t) => t.id === tid)
                          if (!task) return null
                          return (
                            <div key={item.id} style={{ opacity: timelineDrag.movingTaskId === task.id ? 0.3 : 1 }}>
                              <ScheduledTaskDragBlock
                                task={task}
                                matchStatus={match}
                                onPointerDown={(e) => timelineDrag.handleBlockPointerDown(e, task.id, key, task.startTime!, task.endTime!, gridRef.current)}
                                onOpenDetail={() => openCompleteWithLog(task)}
                              />
                            </div>
                          )
                        }
                        if (item.source === 'habit') {
                          const hid = habitIdFromSlotId(item.id)
                          return (
                            <PlannedItemBlock
                              key={item.id}
                              item={item}
                              matchStatus={match}
                              dateKey={key}
                              onGoogleDone={handlePlannedDone}
                              onHabitDone={hid
                                ? () => completeHabitSlotFromPlan(hid, item.summary, key, item.startTime, item.endTime)
                                : undefined}
                            />
                          )
                        }
                        return (
                          <PlannedItemBlock
                            key={item.id}
                            item={item}
                            matchStatus={match}
                            dateKey={key}
                            onGoogleDone={handlePlannedDone}
                          />
                        )
                      })}

                      {timelineDrag.dragPreview && timelineDrag.dragPreview.dateKey === key && timelineDrag.activeCreateIntent === 'schedule' && (
                        <div
                          className="absolute left-0.5 right-0.5 rounded-md pointer-events-none z-20
                            bg-cyan-500/20 border-2 border-cyan-500/60"
                          style={{ top: timelineDrag.dragPreview.top, height: timelineDrag.dragPreview.height }}
                        >
                          <span className="text-[10px] text-cyan-800 dark:text-cyan-200 px-1.5 font-medium">
                            {timelineDrag.dragPreview.label}
                          </span>
                        </div>
                      )}

                      {timelineDropSchedule.dropPreview && timelineDropSchedule.dropPreview.dateKey === key && (
                        <div
                          className="absolute left-0.5 right-0.5 rounded-md pointer-events-none z-20
                                     bg-cyan-500/20 border-2 border-cyan-500/60 border-dashed"
                          style={{ top: timelineDropSchedule.dropPreview.top, height: timelineDropSchedule.dropPreview.height }}
                        >
                          <span className="text-[10px] text-cyan-800 dark:text-cyan-200 px-1.5 font-medium">
                            {timelineDropSchedule.dropPreview.label}
                          </span>
                        </div>
                      )}

                      {timelineDrag.dragPreview && timelineDrag.dragPreview.dateKey === key && timelineDrag.dragPreview.kind !== 'create' && movingTask && !movingTask.isTimeLog && (
                        <div
                          className="absolute left-0.5 right-0.5 rounded-md pointer-events-none z-20
                            bg-cyan-400/30 border-2 border-cyan-500 shadow-lg"
                          style={{ top: timelineDrag.dragPreview.top, height: timelineDrag.dragPreview.height }}
                        >
                          <span className="text-[10px] text-cyan-800 dark:text-cyan-200 px-1.5 font-medium">
                            {timelineDrag.dragPreview.label}
                          </span>
                        </div>
                      )}

                      {timelineDrag.popup && timelineDrag.popup.dateKey === key && timelineDrag.popup.intent === 'schedule' && (
                        <InlineTimeAdd popup={timelineDrag.popup} onDone={handleCreateDone} />
                      )}
                    </div>

                    {/* ログ列 */}
                    <div
                      className="absolute top-0 bottom-0 left-1/2 right-0 cursor-crosshair z-[2]"
                      onPointerDown={(e) => timelineDrag.handleCreatePointerDown(e, key, 'log')}
                      onDragEnter={timelineDropLog.handleDragEnter}
                      onDragOver={(e) => timelineDropLog.handleDragOver(e, key)}
                      onDragLeave={timelineDropLog.handleDragLeave}
                      onDrop={(e) => timelineDropLog.handleDropEvent(e, key)}
                    >
                      {dayLogs.map((t) => (
                        <div key={t.id} style={{ opacity: timelineDrag.movingTaskId === t.id ? 0.3 : 1 }}>
                          <ActualBlock
                            task={{ id: t.id, title: t.title, startTime: t.startTime!, endTime: t.endTime! }}
                            matchStatus={getMatchForActual(key, t.id)}
                            onPointerDown={(e) => timelineDrag.handleBlockPointerDown(e, t.id, key, t.startTime!, t.endTime!, gridRef.current)}
                            onOpenDetail={() => openDetail(t.id)}
                          />
                        </div>
                      ))}

                      {timelineDrag.dragPreview && timelineDrag.dragPreview.dateKey === key && timelineDrag.activeCreateIntent === 'log' && (
                        <div
                          className={`absolute left-0.5 right-0.5 rounded-md pointer-events-none z-20
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

                      {timelineDropLog.dropPreview && timelineDropLog.dropPreview.dateKey === key && (
                        <div
                          className="absolute left-0.5 right-0.5 rounded-md pointer-events-none z-20
                                     bg-emerald-500/20 border-2 border-emerald-500/60 border-dashed"
                          style={{ top: timelineDropLog.dropPreview.top, height: timelineDropLog.dropPreview.height }}
                        >
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-300 px-1.5 font-medium">
                            {timelineDropLog.dropPreview.label}
                          </span>
                        </div>
                      )}

                      {timelineDrag.dragPreview && timelineDrag.dragPreview.dateKey === key && timelineDrag.dragPreview.kind !== 'create' && movingTask && movingTask.isTimeLog && (
                        <div
                          className="absolute left-0.5 right-0.5 rounded-md pointer-events-none z-20
                            bg-emerald-400/30 border-2 border-emerald-500 shadow-lg"
                          style={{ top: timelineDrag.dragPreview.top, height: timelineDrag.dragPreview.height }}
                        >
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-300 px-1.5 font-medium">
                            {timelineDrag.dragPreview.label}
                          </span>
                        </div>
                      )}

                      {timelineDrag.popup && timelineDrag.popup.dateKey === key && timelineDrag.popup.intent === 'log' && (
                        <InlineTimeAdd popup={timelineDrag.popup} onDone={handleCreateDone} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {detailTask && (
        <TaskDetail task={detailTask} onClose={closeDetail} />
      )}
      {completionDraft && (
        <CompleteWithLogModal
          draft={completionDraft}
          radioGroupName="completion-mode-pva"
          onClose={() => setCompletionDraft(null)}
          onChange={(patch) => setCompletionDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
          onSubmit={submitCompleteWithLog}
        />
      )}
    </div>
  )
}
