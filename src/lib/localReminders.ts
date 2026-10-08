/**
 * タブを開いている間の通知（Web Push が使えないとき）。何をいつ出すかはサーバーと同じ
 * `schedule.ts` で決める: 朝のまとめ・予定の前・締切の前・予定のあとの記録の確認・夜の締め・タイマーの止め忘れ。
 * 夜の締めの数字は今日の計画と同じ `getDayPlan` で数える（サーバーは同じ数え方の `wrapUp.ts`）。
 */
import i18n from '../i18n/config'
import { isLogTask, type Task } from '../types/task'
import type { ActiveTimer, DailyReminders } from '../store/taskStore'
import {
  dailyDue,
  morningDigest,
  remindersInWindow,
  staleTimerDue,
  wrapUpDue,
  type FiredReminder,
  type ReminderSettings,
  type ReminderTask,
} from '../../supabase/functions/daily-reminders/schedule.ts'
import { taskUrl, WRAP_UP_URL } from '../../supabase/functions/daily-reminders/payload.ts'
import { getDayPlan } from './dayPlan'
import { formatDuration } from './timeGrid'
import { isActiveTask } from './taskLifecycle'
import { trackPageNotification } from './notificationCleanup'
import { zonedNow } from './timeZone'
import { fromDateKey, toDateKey } from './dateKey'
import { formatDate } from './dateFormat'
import { addDays } from 'date-fns'

const STATE_KEY = 'chronograma-local-reminders'
/** 閉じていた間の通知はまとめて出さない（開いた瞬間に昔の通知が並ばないように） */
const MAX_CATCH_UP_MS = 10 * 60_000

interface LocalState {
  /** 前回見た時刻（wall ms） */
  last?: number
  keys?: string[]
  /** 朝のまとめを出した日 */
  morning?: string
  /** 夜の締めを出した日 */
  wrapUp?: string
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
    scheduled_date: t.scheduledDate,
    due_date: t.dueDate,
    due_time: t.dueTime,
    start_time: t.startTime,
    end_time: t.endTime,
    end_date: t.endDate,
    reminders: t.reminders,
  }
}

/** 通知の対象になる未完了のタスク */
export function reminderCandidates(tasks: readonly Task[], excludedListIds: ReadonlySet<string>): ReminderTask[] {
  return tasks
    .filter((t) => !t.completed && !isLogTask(t) && !t.parentId && isActiveTask(t) && !excludedListIds.has(t.listId))
    .map(toReminderTask)
}

type Shown = {
  title: string
  body: string
  tag: string
  taskId?: string
  record?: boolean
  /** 押したときに開く URL（開始前・締切 1 件はその件の詳細。無ければ今日の計画） */
  url?: string
  /** 止め忘れ: どのタイマーか（開始時刻）。「止める」ボタンを付ける */
  timerStartedAt?: string
}

async function show(n: Shown, onClick: () => void) {
  // アクション（予定どおり / 記録する / 止める）は Service Worker の通知でしか付けられない
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  if (reg) {
    await reg.showNotification(n.title, {
      body: n.body,
      tag: n.tag,
      icon: '/icons/icon-192.png',
      data: {
        url: n.record && n.taskId ? `/?record=${encodeURIComponent(n.taskId)}` : (n.url ?? '/?view=planner'),
        // `taskId` は記録の確認だけ（Service Worker は `taskId` があると記録の画面を開く）
        taskId: n.record ? n.taskId : undefined,
        timerStartedAt: n.timerStartedAt,
      },
      ...(n.record
        ? {
            actions: [
              { action: 'as-planned', title: i18n.t('reminders.asPlanned') },
              { action: 'record', title: i18n.t('reminders.record') },
            ],
          }
        : n.timerStartedAt
          ? { actions: [{ action: 'stop-timer', title: i18n.t('reminders.stopTimer') }] }
          : {}),
    } as NotificationOptions)
    return
  }
  const notification = new Notification(n.title, { body: n.body, tag: n.tag })
  // 済んだ件になったら閉じられるように（`notificationCleanup.ts`）
  trackPageNotification(n.tag, notification)
  notification.onclick = () => {
    window.focus()
    onClick()
    notification.close()
  }
}

function range(start: string | null, end: string | null): string {
  return end ? `${start} – ${end}` : (start ?? '')
}

function dayLabel(date: string, today: string): string {
  if (date === today) return i18n.t('common.today')
  const tomorrow = toDateKey(addDays(fromDateKey(today), 1))
  if (date === tomorrow) return i18n.t('reminders.tomorrow')
  return formatDate(date, 'shortDate')
}

function reminderMessage(r: FiredReminder, today: string): Shown {
  if (r.kind === 'start') {
    const when = range(r.startTime, r.endTime)
    return {
      title: r.title,
      body: r.minutesBefore > 0 ? i18n.t('reminders.startBody', { count: r.minutesBefore, when }) : i18n.t('reminders.startNow', { when }),
      tag: `chronograma-start-${r.taskId}`,
      url: taskUrl(r.taskId, r.date),
    }
  }
  if (r.kind === 'due') {
    const day = dayLabel(r.date, today)
    return {
      title: i18n.t('reminders.dueTitle', { title: r.title }),
      body: r.startTime ? i18n.t('reminders.dueBy', { day, time: r.startTime }) : i18n.t('reminders.dueByDay', { day }),
      tag: `chronograma-due-${r.taskId}`,
      url: taskUrl(r.taskId, r.date),
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

/**
 * 夜の締め（#299）。数字だけ: 「今日: 予定 5 件中 3 件完了 ・ 記録 2時間30分 ・ 残り 2 件」（サーバーの `wrapUpPayload` と同じ並び）。
 * To-Do が無い日は予定の部分を、残りが無ければ残りを出さない
 */
export function wrapUpMessage(d: { done: number; total: number; open: number; loggedMinutes: number }): Shown {
  const parts = [
    d.total > 0 ? i18n.t('reminders.wrapUpDone', { done: d.done, total: d.total }) : null,
    i18n.t('reminders.wrapUpLogged', { time: formatDuration(d.loggedMinutes) }),
    d.open > 0 ? i18n.t('reminders.wrapUpLeft', { count: d.open }) : null,
  ].filter(Boolean)
  return {
    title: i18n.t('reminders.wrapUpTitle'),
    body: i18n.t('reminders.wrapUpToday', { parts: parts.join(i18n.t('reminders.sep')) }),
    tag: 'chronograma-wrap-up',
    url: WRAP_UP_URL,
  }
}

export function morningMessage(tasks: readonly ReminderTask[], today: string): Shown {
  const d = morningDigest(tasks, today)
  const sep = i18n.t('reminders.sep')
  const parts = [
    d.planned > 0 ? i18n.t('reminders.planned', { count: d.planned }) : null,
    d.due.length > 0
      ? i18n.t('reminders.due', {
          items: d.due
            .map((x) => (x.time ? i18n.t('reminders.dueItem', { title: x.title, time: x.time }) : x.title))
            .join(i18n.t('reminders.listSep')),
        })
      : null,
    d.overdue > 0 ? i18n.t('reminders.overdue', { count: d.overdue }) : null,
  ].filter(Boolean)
  return {
    title: i18n.t('reminders.morningTitle'),
    body: parts.length > 0 ? parts.join(sep) : i18n.t('reminders.emptyDay'),
    tag: 'chronograma-morning',
  }
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
  /** 開始前・締切 1 件（Service Worker の無い通知を押したとき） */
  onOpenTask: (taskId: string, date: string) => void
  /** 夜の締め（Service Worker の無い通知を押したとき） */
  onWrapUp: () => void
}) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
  const now = zonedNow()
  const today = toDateKey(now)
  const nowWall = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds())
  const state = readState()
  const from = Math.max(state.last ?? nowWall - 60_000, nowWall - MAX_CATCH_UP_MS)
  const sent = new Set(state.keys ?? [])
  const keys = [...(state.keys ?? [])]
  const tasks = reminderCandidates(ctx.tasks, ctx.excludedListIds)

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  if (dailyDue(ctx.daily.planTime, state.morning, today, nowMinutes)) {
    void show(morningMessage(tasks, today), ctx.onOpen)
    state.morning = today
  }
  if (dailyDue(ctx.daily.wrapUpTime, state.wrapUp, today, nowMinutes)) {
    const plan = getDayPlan(ctx.tasks, today, ctx.excludedListIds)
    // 記録が 0 の日は出さない（印も残さないので、時刻から 60 分の間に記録すれば出る）
    if (wrapUpDue(ctx.daily.wrapUpTime, state.wrapUp, today, nowMinutes, plan.loggedMinutes)) {
      const total = plan.done.length + plan.open.length
      void show(wrapUpMessage({ done: plan.done.length, total, open: plan.open.length, loggedMinutes: plan.loggedMinutes }), ctx.onWrapUp)
      state.wrapUp = today
    }
  }
  for (const r of remindersInWindow(tasks, ctx.settings, from, nowWall)) {
    if (sent.has(r.key)) continue
    keys.push(r.key)
    const msg = reminderMessage(r, today)
    void show(msg, () => (msg.record ? ctx.onRecord(r.taskId) : ctx.onOpenTask(r.taskId, r.date)))
  }
  const timer = ctx.activeTimer
  if (timer && staleTimerDue(timer.startedAt, Date.now(), state.timer)) {
    void show(
      {
        title: i18n.t('reminders.timerTitle'),
        body: i18n.t('reminders.timerBody', { title: timer.taskTitle }),
        tag: 'chronograma-timer',
        timerStartedAt: timer.startedAt,
      },
      ctx.onOpen,
    )
    state.timer = timer.startedAt
  }
  saveState({ ...state, last: nowWall, keys })
}
