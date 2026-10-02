/**
 * タブを開いている間の通知（Web Push が使えないとき）。何をいつ出すかはサーバーと同じ
 * `schedule.ts` で決める: 朝のまとめ・予定の前・締切の前・予定のあとの記録の確認・タイマーの止め忘れ。
 */
import { format, parseISO } from 'date-fns'
import i18n from '../i18n/config'
import type { Task } from '../types/task'
import type { ActiveTimer, DailyReminders } from '../store/taskStore'
import {
  dailyDue,
  morningDigest,
  remindersInWindow,
  staleTimerDue,
  type FiredReminder,
  type ReminderSettings,
  type ReminderTask,
} from '../../supabase/functions/daily-reminders/schedule.ts'
import { isActiveTask } from './taskLifecycle'
import { zonedNow } from './timeZone'

const STATE_KEY = 'chronograma-local-reminders'
/** 閉じていた間の通知はまとめて出さない（開いた瞬間に昔の通知が並ばないように） */
const MAX_CATCH_UP_MS = 10 * 60_000

interface LocalState {
  /** 前回見た時刻（wall ms） */
  last?: number
  keys?: string[]
  /** 朝のまとめを出した日 */
  morning?: string
  /** 止め忘れを知らせたタイマーの開始時刻 */
  timer?: string
}

function readState(): LocalState {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as LocalState
  } catch {
    return {}
  }
}

function saveState(s: LocalState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...s, keys: (s.keys ?? []).slice(-300) }))
  } catch {
    /* 保存できなくても通知は出す（重複の可能性だけ残る） */
  }
}

/** アプリの列をサーバーと同じ形に */
export function toReminderTask(t: Task): ReminderTask {
  return {
    id: t.id,
    title: t.title,
    list_id: t.listId,
    scheduled_date: t.scheduledDate ?? null,
    due_date: t.dueDate,
    due_time: t.dueTime ?? null,
    start_time: t.startTime,
    end_time: t.endTime,
    end_date: t.endDate ?? null,
    reminders: t.reminders ?? null,
  }
}

/** 通知の対象になる未完了のタスク */
export function reminderCandidates(tasks: readonly Task[], excludedListIds: ReadonlySet<string>): ReminderTask[] {
  return tasks
    .filter((t) => !t.completed && !t.isTimeLog && !t.parentId && isActiveTask(t) && !excludedListIds.has(t.listId))
    .map(toReminderTask)
}

type Shown = { title: string; body: string; tag: string; taskId?: string; record?: boolean }

async function show(n: Shown, onClick: () => void) {
  // アクション（予定どおり / 記録する）は Service Worker の通知でしか付けられない
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  if (reg) {
    await reg.showNotification(n.title, {
      body: n.body,
      tag: n.tag,
      icon: '/icons/icon-192.png',
      data: { url: n.record && n.taskId ? `/?record=${encodeURIComponent(n.taskId)}` : '/?view=planner', taskId: n.taskId },
      ...(n.record
        ? {
            actions: [
              { action: 'as-planned', title: i18n.t('reminders.asPlanned') },
              { action: 'record', title: i18n.t('reminders.record') },
            ],
          }
        : {}),
    } as NotificationOptions)
    return
  }
  const notification = new Notification(n.title, { body: n.body, tag: n.tag })
  notification.onclick = () => {
    window.focus()
    onClick()
    notification.close()
  }
}

function range(start: string | null, end: string | null): string {
  return end ? `${start} – ${end}` : start ?? ''
}

function dayLabel(date: string, today: string): string {
  if (date === today) return i18n.t('common.today')
  const tomorrow = format(new Date(parseISO(`${today}T12:00:00`).getTime() + 86_400_000), 'yyyy-MM-dd')
  if (date === tomorrow) return i18n.t('reminders.tomorrow')
  return format(parseISO(`${date}T12:00:00`), 'M/d')
}

function reminderMessage(r: FiredReminder, today: string): Shown {
  if (r.kind === 'start') {
    const when = range(r.startTime, r.endTime)
    return {
      title: r.title,
      body: r.minutesBefore > 0 ? i18n.t('reminders.startBody', { count: r.minutesBefore, when }) : i18n.t('reminders.startNow', { when }),
      tag: `chronograma-start-${r.taskId}`,
    }
  }
  if (r.kind === 'due') {
    const day = dayLabel(r.date, today)
    return {
      title: i18n.t('reminders.dueTitle', { title: r.title }),
      body: r.startTime ? i18n.t('reminders.dueBy', { day, time: r.startTime }) : i18n.t('reminders.dueByDay', { day }),
      tag: `chronograma-due-${r.taskId}`,
    }
  }
  return {
    title: i18n.t('reminders.recordTitle', { title: r.title }),
    body: range(r.startTime, r.endTime),
    tag: `chronograma-record-${r.taskId}`,
    taskId: r.taskId,
    record: true,
  }
}

export function morningMessage(tasks: readonly ReminderTask[], today: string): Shown {
  const d = morningDigest(tasks, today)
  const sep = i18n.t('reminders.sep')
  const parts = [
    d.planned > 0 ? i18n.t('reminders.planned', { count: d.planned }) : null,
    d.due.length > 0
      ? i18n.t('reminders.due', {
          items: d.due.map((x) => (x.time ? i18n.t('reminders.dueItem', { title: x.title, time: x.time }) : x.title)).join(i18n.t('reminders.listSep')),
        })
      : null,
    d.overdue > 0 ? i18n.t('reminders.overdue', { count: d.overdue }) : null,
  ].filter(Boolean)
  return { title: i18n.t('reminders.morningTitle'), body: parts.length > 0 ? parts.join(sep) : i18n.t('reminders.emptyDay'), tag: 'chronograma-morning' }
}

/** 30 秒ごとに呼ぶ。通知の許可が無ければ何もしない */
export function checkLocalReminders(ctx: {
  tasks: readonly Task[]
  excludedListIds: ReadonlySet<string>
  daily: DailyReminders
  settings: ReminderSettings
  activeTimer: ActiveTimer | null
  onOpen: () => void
  onRecord: (taskId: string) => void
}) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
  const now = zonedNow()
  const today = format(now, 'yyyy-MM-dd')
  const nowWall = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds())
  const state = readState()
  const from = Math.max(state.last ?? nowWall - 60_000, nowWall - MAX_CATCH_UP_MS)
  const sent = new Set(state.keys ?? [])
  const keys = [...(state.keys ?? [])]
  const tasks = reminderCandidates(ctx.tasks, ctx.excludedListIds)

  if (dailyDue(ctx.daily.planTime, state.morning, today, now.getHours() * 60 + now.getMinutes())) {
    void show(morningMessage(tasks, today), ctx.onOpen)
    state.morning = today
  }
  for (const r of remindersInWindow(tasks, ctx.settings, from, nowWall)) {
    if (sent.has(r.key)) continue
    keys.push(r.key)
    const msg = reminderMessage(r, today)
    void show(msg, () => (msg.record ? ctx.onRecord(r.taskId) : ctx.onOpen()))
  }
  const timer = ctx.activeTimer
  if (timer && staleTimerDue(timer.startedAt, Date.now(), state.timer)) {
    void show({ title: i18n.t('reminders.timerTitle'), body: i18n.t('reminders.timerBody', { title: timer.taskTitle }), tag: 'chronograma-timer' }, ctx.onOpen)
    state.timer = timer.startedAt
  }
  saveState({ ...state, last: nowWall, keys })
}
