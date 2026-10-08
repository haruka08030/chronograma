// Sends Web Push reminders: morning summary, before plans, before deadlines, record prompts after plans,
// and a stale-timer nudge. Invoked by pg_cron every 5 minutes (see README). Requires CRON_SECRET.
// 送る時間は前の成功の回から今まで（上限 60 分。表 `reminder_runs`、migration 012）。
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:... or https://...), CRON_SECRET
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by the platform)
import { createClient } from 'npm:@supabase/supabase-js@2.103.0'
import webpush from 'npm:web-push@3.6.7'
import {
  CRON_INTERVAL_MINUTES,
  dailyDue,
  dayWallMs,
  morningDigest,
  remindersInWindow,
  staleTimerDue,
  type ReminderTask,
} from './schedule.ts'
import { MESSAGES, reminderPayload, type Msg, type Payload } from './payload.ts'
import { isKnownPushEndpoint } from '../_shared/pushEndpoint.ts'
import {
  fetchAllPages,
  groupBy,
  runFinishPatch,
  runPool,
  runStatsPatch,
  runStatus,
  runWindowStart,
  RUN_CLAIM_STALE_MINUTES,
  sendJobs,
  type RunStats,
} from './batch.ts'

type Sub = {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
  timezone: string
  lang: string
  plan_time: string | null
  last_plan_sent: string | null
  event_reminder_minutes?: number | null
  due_reminders?: boolean | null
  record_prompts?: boolean | null
  reminder_sent?: { keys?: string[] } | null
  timer_started_at?: string | null
  timer_title?: string | null
  timer_notified_for?: string | null
}

/** 送った鍵をいくつまで覚えるか（古いものから捨てる） */
const MAX_SENT_KEYS = 300
/** 同時に処理する利用者の数（DB とプッシュサービスへの同時接続を抑える） */
const USER_CONCURRENCY = 10
/** 1 通の送信を待つ上限。応答しないプッシュサービスで枠を塞がない */
const SEND_TIMEOUT_MS = 10_000

function localNow(timeZone: string, now: Date): { date: string; minutes: number } {
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

/** 秘密の値を比べる。かかる時間から一致した長さが分からないよう、両方のハッシュを全バイト比べる */
async function secretEquals(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || !(await secretEquals(req.headers.get('x-cron-secret') ?? '', secret))) {
    return new Response('forbidden', { status: 403 })
  }

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const now = new Date()
  const nowIso = now.toISOString()

  // この回を始めてよいかを `reminder_runs` の 1 行で確かめる（前の回が 5 分を超えて走っていたら、同じ時間を同時に送らない）。
  // 「走っていない（running_since が null）か、目印が古すぎる」ときだけ running_since を自分の時刻にする 1 回の update。
  // 同時に 2 回来ても、行のロックで後の update は先の書き込みを見て 0 行になる。
  // pg_try_advisory_lock は使わない（PostgREST は呼び出しごとに接続を使い回すので、セッションのロックを次の呼び出しまで持てない）
  const staleBefore = new Date(now.getTime() - RUN_CLAIM_STALE_MINUTES * 60_000).toISOString()
  const claim = await admin
    .from('reminder_runs')
    .update({ running_since: nowIso })
    .eq('id', 1)
    .or(`running_since.is.null,running_since.lt."${staleBefore}"`)
    .select('last_ok_at')
  if (claim.error) {
    console.error('[daily-reminders] claim run failed', claim.error)
    return new Response(claim.error.message, { status: 500 })
  }
  if (!claim.data || claim.data.length === 0) {
    // 前の回がまだ走っている。この回の分は、前の回か次の回が送る
    return new Response(JSON.stringify({ skipped: 'running' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const windowStartMs = runWindowStart((claim.data[0] as { last_ok_at: string | null }).last_ok_at, now.getTime(), CRON_INTERVAL_MINUTES)

  /**
   * 回の終わり。目印を外し、全部うまくいったときだけ last_ok_at を進める（自分の目印のときだけ。取り直されていたら触らない）。
   * そのあと、この回の数と失敗の時刻を残す（運用で見る。`supabase/metrics/health.sql`）
   */
  const finishRun = async (stats: RunStats) => {
    const { error } = await admin.from('reminder_runs').update(runFinishPatch(stats.failed, nowIso)).eq('id', 1).eq('running_since', nowIso)
    // 書けなくても、目印は RUN_CLAIM_STALE_MINUTES 分で取り直され、last_ok_at が進まない分は次の回が送る
    if (error) console.error('[daily-reminders] finish run failed', error)
    // 数は別に書く（列が無い DB（`021` の前）でも、上の目印の外しと last_ok_at は止めない）
    const stat = await admin.from('reminder_runs').update(runStatsPatch(stats, nowIso)).eq('id', 1)
    if (stat.error) console.error('[daily-reminders] save run stats failed', stat.error)
  }

  // 1 回に返るのは 1000 行まで。主キーの順にページを読み切る（読み終えてから送るので、途中で消しても行はずれない）
  let subs: Sub[]
  try {
    subs = await fetchAllPages(async (from, to) => {
      const { data, error } = await admin
        .from('push_subscriptions')
        .select('*')
        .or(
          'plan_time.not.is.null,event_reminder_minutes.not.is.null,due_reminders.is.true,record_prompts.is.true,timer_started_at.not.is.null',
        )
        .order('endpoint')
        .range(from, to)
      if (error) throw new Error(error.message)
      return (data ?? []) as Sub[]
    })
  } catch (err) {
    console.error('[daily-reminders] load subscriptions failed', err)
    await finishRun({ checked: 0, sent: 0, removed: 0, failed: 1 })
    return new Response(err instanceof Error ? err.message : 'load failed', { status: 500 })
  }

  /**
   * 通知に使う未完了のタスク（ルート・予定/締切のあるもの）。いつか / チェックリストのリストは除く。
   * 1 回に返るのは 1000 行まで。主キー（id）の順にページを読み切る
   */
  const openTasks = async (userId: string): Promise<ReminderTask[]> => {
    const unplanned = await fetchAllPages(async (from, to) => {
      const { data, error } = await admin
        .from('lists')
        .select('id')
        .eq('user_id', userId)
        .in('kind', ['someday', 'checklist'])
        .order('id')
        .range(from, to)
      if (error) throw new Error(error.message)
      return (data ?? []) as { id: string }[]
    })
    const excluded = new Set(unplanned.map((l) => l.id))
    // 読めなかったら送らない（空のまとめを送って last_plan_sent を進めない。次の回にやり直す）
    const rows = await fetchAllPages(async (from, to) => {
      const { data, error } = await admin
        .from('tasks')
        .select('id,title,list_id,scheduled_date,due_date,due_time,start_time,end_time,end_date,reminders')
        .eq('user_id', userId)
        .eq('completed', false)
        .eq('is_time_log', false)
        .is('parent_id', null)
        .is('deleted_at', null)
        .is('archived_at', null)
        .or('scheduled_date.not.is.null,due_date.not.is.null')
        .order('id')
        .range(from, to)
      if (error) throw new Error(error.message)
      return (data ?? []) as ReminderTask[]
    })
    return rows.filter((t) => !excluded.has(t.list_id))
  }

  let sent = 0
  let removed = 0
  let failed = 0

  const removeSub = async (endpoint: string) => {
    const { error } = await admin.from('push_subscriptions').delete().eq('endpoint', endpoint)
    if (error) throw new Error(error.message)
    removed++
  }

  const needsTasks = (sub: Sub) => Boolean(sub.plan_time || sub.event_reminder_minutes != null || sub.due_reminders || sub.record_prompts)

  /** 1 つの端末へ、今送る通知を組み立てて並べて送り、送った印を 1 回で書く */
  const processSub = async (sub: Sub, tasks: ReminderTask[]) => {
    const local = localNow(sub.timezone, now)
    const msg: Msg = sub.lang === 'en' ? MESSAGES.en : MESSAGES.ja
    const nowWall = (dayWallMs(local.date) ?? 0) + local.minutes * 60_000
    const sentKeys = [...(sub.reminder_sent?.keys ?? [])]
    const sentSet = new Set(sentKeys)
    const jobs: { payload: Payload; keys?: string[]; patch?: Record<string, unknown> }[] = []

    if (dailyDue(sub.plan_time, sub.last_plan_sent, local.date, local.minutes)) {
      const d = morningDigest(tasks, local.date)
      const parts = [
        d.planned > 0 ? msg.planned(d.planned) : null,
        d.due.length > 0 ? msg.due(d.due.map((x) => msg.dueItem(x.title, x.time)).join(msg.listSep)) : null,
        d.overdue > 0 ? msg.overdue(d.overdue) : null,
      ].filter(Boolean)
      jobs.push({
        payload: {
          title: msg.morningTitle,
          body: parts.length > 0 ? parts.join(msg.sep) : msg.emptyDay,
          tag: 'chronograma-morning',
          url: '/?view=planner',
        },
        patch: { last_plan_sent: local.date },
      })
    }

    const fired = remindersInWindow(
      tasks,
      {
        eventReminderMinutes: sub.event_reminder_minutes ?? null,
        dueReminders: sub.due_reminders === true,
        recordPrompts: sub.record_prompts === true,
      },
      // 壁時計でも同じ長さだけさかのぼる（前の成功の回から今まで）
      nowWall - (now.getTime() - windowStartMs),
      nowWall,
    ).filter((r) => !sentSet.has(r.key))
    // 同じ時刻に重なった締切は 1 通にまとめる（1 件ずつ出すと通知が洪水になる）
    const dues = fired.filter((r) => r.kind === 'due')
    if (dues.length > 1) {
      jobs.push({
        payload: {
          title: msg.dueGroupTitle,
          body: dues.map((r) => msg.dueItem(r.title, r.startTime)).join(msg.listSep),
          tag: 'chronograma-due',
          url: '/?view=planner',
        },
        keys: dues.map((r) => r.key),
      })
    }
    for (const r of fired) {
      if (r.kind === 'due' && dues.length > 1) continue
      jobs.push({ payload: reminderPayload(msg, r, local.date), keys: [r.key] })
    }

    if (staleTimerDue(sub.timer_started_at, now.getTime(), sub.timer_notified_for)) {
      jobs.push({
        payload: { title: msg.timerTitle, body: msg.timerBody(sub.timer_title ?? ''), tag: 'chronograma-timer', url: '/?view=planner' },
        patch: { timer_notified_for: sub.timer_started_at },
      })
    }
    if (jobs.length === 0) return

    const outcome = await sendJobs(jobs, (job) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(job.payload), {
        TTL: 60 * 60,
        timeout: SEND_TIMEOUT_MS,
      }),
    )
    sent += outcome.delivered.length
    failed += outcome.failed.length
    for (const f of outcome.failed) {
      console.error('[daily-reminders] send failed', (f.error as { statusCode?: number }).statusCode, f.error)
    }
    // 購読が失効（アプリ削除・権限取り消し）したら消す
    if (outcome.gone) {
      await removeSub(sub.endpoint)
      return
    }
    // 送れたものの印だけを残す（送れなかったものは次の回にもう一度）
    const patch: Record<string, unknown> = {}
    for (const job of outcome.delivered) {
      Object.assign(patch, job.patch ?? {})
      if (job.keys) sentKeys.push(...job.keys)
    }
    if (outcome.delivered.some((job) => job.keys)) patch.reminder_sent = { keys: sentKeys.slice(-MAX_SENT_KEYS) }
    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from('push_subscriptions').update(patch).eq('endpoint', sub.endpoint)
      if (error) throw new Error(error.message)
    }
  }

  /** 1 人分。タスクは端末がいくつあっても 1 回だけ読み、端末へは並べて送る */
  const processUser = async (userSubs: Sub[]) => {
    const valid: Sub[] = []
    for (const sub of userSubs) {
      // プッシュサービス以外の宛先へは送らない（DB の制約より前に入った行）
      if (isKnownPushEndpoint(sub.endpoint)) valid.push(sub)
      else await removeSub(sub.endpoint)
    }
    if (valid.length === 0) return
    const tasks = valid.some(needsTasks) ? await openTasks(valid[0].user_id) : []
    const results = await Promise.allSettled(valid.map((sub) => processSub(sub, tasks)))
    for (const r of results) {
      if (r.status === 'rejected') {
        failed++
        console.error('[daily-reminders] subscription failed', r.reason)
      }
    }
  }

  const results = await runPool(
    groupBy(subs, (s) => s.user_id),
    USER_CONCURRENCY,
    processUser,
  )
  for (const r of results) {
    if (r.status === 'rejected') {
      failed++
      console.error('[daily-reminders] user failed', r.reason)
    }
  }

  await finishRun({ checked: subs.length, sent, removed, failed })

  // 失敗があれば 500（cron の実行の記録で気づけるように）。中身は同じ
  return new Response(JSON.stringify({ checked: subs.length, sent, removed, failed }), {
    status: runStatus(failed),
    headers: { 'Content-Type': 'application/json' },
  })
})
