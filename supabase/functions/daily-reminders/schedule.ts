/**
 * 通知を「いつ送るか」を決める純粋な部分。サーバー（Edge Function `index.ts`、Deno）と、
 * タブを開いている間のブラウザの通知（`src/lib/localReminders.ts`）の両方がこれを使う。
 * 依存は持たない（どちらからも読めるように）。
 *
 * 時刻はすべて「アプリのタイムゾーンの壁時計」。日付と時刻を UTC として数えたミリ秒（wall ms）で比べる。
 */

/** cron の間隔（分）。この幅に入った通知を送る */
export const CRON_INTERVAL_MINUTES = 5

/** 締切の前（既定）: 前日のこの時刻（締切日の 0 時からの分。-240 = 前日 20:00） */
export const DUE_EVE_MINUTES = -4 * 60
/** 締切の前（既定）: 時刻つきの締切はこの分だけ前にも */
export const DUE_LEAD_MINUTES = 3 * 60
/** タイマーがこの時間を超えたら止め忘れとして知らせる */
export const STALE_TIMER_MS = 3 * 60 * 60 * 1000

/**
 * 通知の基準。
 * - `start`: 予定の開始時刻の `minutes` 分前
 * - `due`: 締切の時刻（`due_time`）の `minutes` 分前
 * - `dueDay`: 締切日の 0 時から `minutes` 分（負なら前の日。-240 = 前日 20:00、480 = 当日 8:00）
 */
export type ReminderAnchor = 'start' | 'due' | 'dueDay'

export interface TaskReminder {
  at: ReminderAnchor
  minutes: number
}

/** 通知の判定に使うタスクの列（DB の行と同じ名前） */
export interface ReminderTask {
  id: string
  title: string
  list_id: string
  scheduled_date?: string | null
  due_date?: string | null
  due_time?: string | null
  start_time?: string | null
  end_time?: string | null
  end_date?: string | null
  /** null は既定（設定）のまま */
  reminders?: TaskReminder[] | null
}

export interface ReminderSettings {
  /** 予定の前（null はオフ） */
  eventReminderMinutes: number | null
  /** 締切の前（前日 20:00 ＋ 時刻つきは 3 時間前） */
  dueReminders: boolean
  /** 予定のあとの記録の確認 */
  recordPrompts: boolean
}

export type FiredKind = 'start' | 'due' | 'record'

export interface FiredReminder {
  /** 同じ通知を二度出さないための鍵 */
  key: string
  kind: FiredKind
  taskId: string
  title: string
  /** 予定の日付（start / record）か締切日（due） */
  date: string
  /** 開始〜終了（start / record）か締切の時刻（due、無ければ null） */
  startTime: string | null
  endTime: string | null
  /** 何分前の通知か（start / due）。0 はちょうど */
  minutesBefore: number
}

/** `HH:mm`（Postgres の time 列は `HH:mm:ss` で返ることもある）を 0 時からの分に。読めなければ null */
export function minutesOfClock(time: string | null | undefined): number | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** `yyyy-MM-dd` の 0 時の wall ms */
export function dayWallMs(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** 日付＋時刻の wall ms */
export function wallMs(date: string, time: string | null | undefined): number | null {
  const day = dayWallMs(date)
  const min = minutesOfClock(time)
  if (day == null || min == null) return null
  return day + min * 60_000
}

/** wall ms → `yyyy-MM-dd` */
export function wallDate(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** 予定の日（予定日、古いデータは時刻つきの期限日） */
function planDate(t: ReminderTask): string | null {
  if (!t.start_time) return null
  return t.scheduled_date ?? t.due_date ?? null
}

/** 設定から決まる、そのタスクの既定の通知 */
export function defaultReminders(t: ReminderTask, s: ReminderSettings): TaskReminder[] {
  const out: TaskReminder[] = []
  if (s.eventReminderMinutes != null && planDate(t)) out.push({ at: 'start', minutes: s.eventReminderMinutes })
  if (s.dueReminders && t.due_date) {
    out.push({ at: 'dueDay', minutes: DUE_EVE_MINUTES })
    if (minutesOfClock(t.due_time) != null) out.push({ at: 'due', minutes: DUE_LEAD_MINUTES })
  }
  return out
}

/** 基準が無い通知（開始時刻の無いタスクの「開始 10 分前」など）は外す */
export function applicableReminders(t: ReminderTask, list: readonly TaskReminder[]): TaskReminder[] {
  return list.filter((r) =>
    r.at === 'start'
      ? Boolean(planDate(t))
      : r.at === 'due'
        ? Boolean(t.due_date && minutesOfClock(t.due_time) != null)
        : Boolean(t.due_date),
  )
}

/** そのタスクで実際に使う通知（タスクで決めていればそれ、無ければ設定の既定） */
export function effectiveReminders(t: ReminderTask, s: ReminderSettings): TaskReminder[] {
  return applicableReminders(t, t.reminders ?? defaultReminders(t, s))
}

/** 通知の時刻（wall ms）。基準が読めなければ null */
export function reminderFireMs(t: ReminderTask, r: TaskReminder): number | null {
  if (r.at === 'start') {
    const d = planDate(t)
    const at = d ? wallMs(d, t.start_time) : null
    return at == null ? null : at - r.minutes * 60_000
  }
  if (!t.due_date) return null
  if (r.at === 'due') {
    const at = wallMs(t.due_date, t.due_time)
    return at == null ? null : at - r.minutes * 60_000
  }
  const day = dayWallMs(t.due_date)
  return day == null ? null : day + r.minutes * 60_000
}

/** 予定の終わり（wall ms）。終了が開始以前なら翌日 */
export function planEndMs(t: ReminderTask): number | null {
  const d = planDate(t)
  if (!d || !t.end_time) return null
  const start = wallMs(d, t.start_time)
  let end = wallMs(t.end_date ?? d, t.end_time)
  if (start == null || end == null) return null
  if (end <= start) end += 24 * 60 * 60_000
  return end
}

/**
 * `(fromMs, toMs]` に鳴る通知。開始前・締切前・予定のあとの記録の確認。
 * 呼び出し側で、完了・削除・アーカイブ済み、サブタスク、いつか / チェックリストのリストを除いておく。
 */
export function remindersInWindow(tasks: readonly ReminderTask[], s: ReminderSettings, fromMs: number, toMs: number): FiredReminder[] {
  const out: FiredReminder[] = []
  const inWindow = (ms: number | null): ms is number => ms != null && ms > fromMs && ms <= toMs
  for (const t of tasks) {
    for (const r of effectiveReminders(t, s)) {
      const at = reminderFireMs(t, r)
      if (!inWindow(at)) continue
      const isStart = r.at === 'start'
      const date = isStart ? planDate(t)! : t.due_date!
      out.push({
        key: `${t.id}:${r.at}:${r.minutes}:${date}`,
        kind: isStart ? 'start' : 'due',
        taskId: t.id,
        title: t.title,
        date,
        startTime: isStart ? clock(t.start_time) : clock(t.due_time),
        endTime: isStart ? clock(t.end_time) : null,
        minutesBefore: r.at === 'dueDay' ? Math.max(0, Math.round(((dayWallMs(date) ?? at) - at) / 60_000)) : r.minutes,
      })
    }
    if (s.recordPrompts) {
      const end = planEndMs(t)
      if (inWindow(end)) {
        const date = planDate(t)!
        out.push({
          key: `${t.id}:record:${date}`,
          kind: 'record',
          taskId: t.id,
          title: t.title,
          date,
          startTime: clock(t.start_time),
          endTime: clock(t.end_time),
          minutesBefore: 0,
        })
      }
    }
  }
  return out
}

function clock(time: string | null | undefined): string | null {
  return time ? time.slice(0, 5) : null
}

/** 朝のまとめ（今日の予定・今日の締切・期限切れ）。除外は呼び出し側で */
export interface MorningDigest {
  planned: number
  due: { title: string; time: string | null }[]
  overdue: number
}

export function morningDigest(tasks: readonly ReminderTask[], today: string): MorningDigest {
  let planned = 0
  let overdue = 0
  const due: MorningDigest['due'] = []
  for (const t of tasks) {
    const placed = t.scheduled_date ?? (t.start_time ? t.due_date : null)
    if (placed === today) planned++
    if (t.due_date === today) due.push({ title: t.title, time: clock(t.due_time) })
    else if (t.due_date && t.due_date < today) overdue++
  }
  due.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
  return { planned, due, overdue }
}

/** 止め忘れの通知を出すか（同じタイマーには 1 回だけ） */
export function staleTimerDue(startedAt: string | null | undefined, nowMs: number, notifiedFor: string | null | undefined): boolean {
  if (!startedAt || notifiedFor === startedAt) return false
  const start = Date.parse(startedAt)
  return Number.isFinite(start) && nowMs - start >= STALE_TIMER_MS
}

/** 毎日 1 回の通知（朝のまとめ・夜の締め）を出すか。指定時刻から 60 分を過ぎたらその日は出さない */
export function dailyDue(time: string | null | undefined, lastSent: string | null | undefined, today: string, nowMinutes: number): boolean {
  const at = minutesOfClock(time)
  if (at == null || lastSent === today) return false
  const diff = nowMinutes - at
  return diff >= 0 && diff < 60
}

/**
 * 夜の締めの通知（#299）を出すか。時刻は朝のまとめと同じく指定時刻から 60 分まで、1 日 1 回。
 * その日の記録が 0 なら出さない（使っていない日に責めない。60 分の間に記録すれば出る）
 */
export function wrapUpDue(
  time: string | null | undefined,
  lastSent: string | null | undefined,
  today: string,
  nowMinutes: number,
  loggedMinutes: number,
): boolean {
  return loggedMinutes > 0 && dailyDue(time, lastSent, today, nowMinutes)
}

/** 今（`now`）が、そのタイムゾーンの壁時計で何日の何分か（0 時からの分）。読めないタイムゾーンは UTC */
export function localNow(timeZone: string, now: Date): { date: string; minutes: number } {
  let tz = timeZone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    tz = 'UTC'
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute) }
}
