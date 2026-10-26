// Sends Web Push reminders: morning summary (with yesterday's numbers, #278), before plans, before deadlines, record prompts after plans,
// the evening wrap-up with the day's numbers, a stale-timer nudge, the focus timer's time-up (#290) and payments / expiry dates (#454). Invoked by pg_cron every 5 minutes (see README). Requires CRON_SECRET.
// 送る時間は前の成功の回から今まで（上限 60 分。表 `reminder_runs`、migration 012）。
//
// 回の終わりに、連携のトークンのうち今の鍵で閉じていない行を少しずつ閉じ直す（`_shared/tokenSweep.ts`、鍵の入れ替え）。
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:... or https://...), CRON_SECRET,
// TOKEN_ENCRYPTION_KEY / TOKEN_ENCRYPTION_PREVIOUS_KEYS (closing tokens again with the current key)
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by the platform)
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.103.0'
import webpush from 'npm:web-push@3.6.7'
import {
  CRON_INTERVAL_MINUTES,
  dailyDue,
  dayWallMs,
  localNow,
  morningDigest,
  remindersInWindow,
  dropRecordedPrompts,
  staleTimerDue,
  timerEndDue,
  wrapUpDue,
  type ReminderTask,
} from './schedule.ts'
import {
  MESSAGES,
  duesPayload,
  morningPayload,
  reminderPayload,
  timerEndPayload,
  timerPayload,
  wrapUpPayload,
  type Msg,
  type Payload,
} from './payload.ts'
import { DUES_DEFAULT_TIME, duesSentKey, duesToNotify, normalizeDues, type DueItem } from './dues.ts'
import { previousDay, wrapUpDigest, wrapUpRowFilter, type WrapUpDigest, type WrapUpHabitRow, type WrapUpRow } from './wrapUp.ts'
import { isKnownPushEndpoint } from '../_shared/pushEndpoint.ts'
import { keyRing } from '../_shared/secretBox.ts'
import { resealStaleTokens, type SweepDb } from '../_shared/tokenSweep.ts'
import {
  afterPairFilter,
  chunks,
  fetchAllAfter,
  groupBy,
  runFinishPatch,
  runPool,
  runKeyMismatchPatch,
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
  /** 夜のまとめ（'HH:mm'、null = オフ）と、最後に送った日（1 日 1 回） */
  wrap_up_time?: string | null
  last_wrap_up_sent?: string | null
  event_reminder_minutes?: number | null
  due_reminders?: boolean | null
  record_prompts?: boolean | null
  reminder_sent?: { keys?: string[] } | null
  timer_started_at?: string | null
  timer_title?: string | null
  timer_notified_for?: string | null
  /** 「あと何分」の終わりの時刻（#290、`user_active_timer.ends_at` の写し、`028`）と、時間の通知を送った終わりの時刻 */
  timer_ends_at?: string | null
  timer_end_notified_for?: string | null
}

/** 送った鍵をいくつまで覚えるか（古いものから捨てる） */
const MAX_SENT_KEYS = 300
/** 同時に処理する利用者の数（DB とプッシュサービスへの同時接続を抑える） */
const USER_CONCURRENCY = 10
/** 1 通の送信を待つ上限。応答しないプッシュサービスで枠を塞がない */
const SEND_TIMEOUT_MS = 10_000

/** いつか / チェックリストのリストを読むとき、1 回の問い合わせに並べる利用者の数（URL の長さを抑える） */
const LIST_USERS_PER_QUERY = 100
/** 1 回に閉じ直すトークンの行の数（表ごと） */
const TOKEN_SWEEP_LIMIT = 100

/** 閉じ直す処理の DB の読み書き。今の鍵の形で始まらない値のある行だけを読む（null の列は数えない） */
function tokenSweepDb(admin: SupabaseClient): SweepDb {
  return {
    async stale(table, key, columns, prefix, limit) {
      let query = admin
        .from(table)
        .select([...key, ...columns].join(','))
        .or(columns.map((c) => `${c}.not.like.${prefix}*`).join(','))
      for (const k of key) query = query.order(k)
      const { data, error } = await query.limit(limit)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as Record<string, string | null>[]
    },
    async update(table, match, patch) {
      let query = admin.from(table).update(patch)
      for (const [k, v] of Object.entries(match)) query = query.eq(k, v ?? '')
      const { error } = await query
      if (error) throw new Error(error.message)
    },
  }
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
    const mismatch = await admin.from('reminder_runs').update(runKeyMismatchPatch(stats)).eq('id', 1)
    if (mismatch.error) console.error('[daily-reminders] save key mismatch count failed', mismatch.error)
    if (stats.keyMismatch > 0) {
      console.warn('[daily-reminders] removed subscriptions made with another VAPID key (403)', stats.keyMismatch)
    }
  }

  // 1 回に返るのは 1000 行まで。主キーの順に、前のページの最後のキーより後ろを読み切る（読み終えてから送るので、途中で消しても行はずれない）
  let subs: Sub[]
  try {
    subs = await fetchAllAfter(
      async (after: string | null, limit) => {
        let query = admin
          .from('push_subscriptions')
          .select('*')
          .or(
            'plan_time.not.is.null,wrap_up_time.not.is.null,event_reminder_minutes.not.is.null,due_reminders.is.true,record_prompts.is.true,timer_started_at.not.is.null',
          )
        if (after !== null) query = query.gt('endpoint', after)
        const { data, error } = await query.order('endpoint').limit(limit)
        if (error) throw new Error(error.message)
        return (data ?? []) as Sub[]
      },
      (s) => s.endpoint,
    )
  } catch (err) {
    console.error('[daily-reminders] load subscriptions failed', err)
    await finishRun({ checked: 0, sent: 0, removed: 0, keyMismatch: 0, failed: 1 })
    return new Response(err instanceof Error ? err.message : 'load failed', { status: 500 })
  }

  /**
   * いつか / チェックリストのリスト（予定・締切・その日の数字に入れない）を、要る人の分だけまとめて読む（1 人ずつ読まない）。
   * 100 人ずつ `in` に並べ、(user_id, id) の順に前のページの続きから読む
   */
  const loadExcludedLists = async (userIds: readonly string[]): Promise<Map<string, Set<string>>> => {
    const byUser = new Map<string, Set<string>>()
    for (const group of chunks(userIds, LIST_USERS_PER_QUERY)) {
      const rows = await fetchAllAfter(
        async (after: readonly [string, string] | null, limit) => {
          let query = admin.from('lists').select('user_id,id').in('user_id', group).in('kind', ['someday', 'checklist'])
          if (after) query = query.or(afterPairFilter('user_id', 'id', after))
          const { data, error } = await query.order('user_id').order('id').limit(limit)
          if (error) throw new Error(error.message)
          return (data ?? []) as { user_id: string; id: string }[]
        },
        (l) => [l.user_id, l.id] as const,
      )
      for (const l of rows) {
        const set = byUser.get(l.user_id)
        if (set) set.add(l.id)
        else byUser.set(l.user_id, new Set([l.id]))
      }
    }
    return byUser
  }

  /**
   * 引き落とし・期限の日（#454）を、追加機能をオンにしている人の分だけまとめて読む（1 人ずつ読まない）。100 人ずつ `in` に並べる
   */
  const loadDues = async (userIds: readonly string[]): Promise<Map<string, DueItem[]>> => {
    const byUser = new Map<string, DueItem[]>()
    for (const group of chunks(userIds, LIST_USERS_PER_QUERY)) {
      const { data, error } = await admin.from('user_addons').select('user_id,addons').in('user_id', group)
      if (error) throw new Error(error.message)
      for (const row of (data ?? []) as { user_id: string; addons: { enabled?: { dues?: unknown }; dues?: unknown } | null }[]) {
        if (row.addons?.enabled?.dues !== true) continue
        const dues = normalizeDues(row.addons.dues)
        if (dues.length > 0) byUser.set(row.user_id, dues)
      }
    }
    return byUser
  }

  /**
   * 通知に使う未完了のタスク（ルート・予定/締切のあるもの）。いつか / チェックリストのリストは除く。
   * 条件は部分索引 `tasks_reminder_open_idx`（migration 026）と同じ形にする（completed / is_time_log は `is false`。
   * 形が違うと索引を使えず、完了・削除・記録の行も含めて 1 人分を全部なめる）。
   * 1 回に返るのは 1000 行まで。id の順に、前のページの最後の id より後ろを読み切る
   */
  const openTasks = async (userId: string, excluded: ReadonlySet<string>): Promise<ReminderTask[]> => {
    // 読めなかったら送らない（空のまとめを送って last_plan_sent を進めない。次の回にやり直す）
    const rows = await fetchAllAfter(
      async (after: string | null, limit) => {
        let query = admin
          .from('tasks')
          .select('id,title,list_id,scheduled_date,due_date,due_time,start_time,end_time,end_date,reminders')
          .eq('user_id', userId)
          .is('completed', false)
          .is('is_time_log', false)
          .is('parent_id', null)
          .is('deleted_at', null)
          .is('archived_at', null)
          .or('scheduled_date.not.is.null,due_date.not.is.null')
        if (after !== null) query = query.gt('id', after)
        const { data, error } = await query.order('id').limit(limit)
        if (error) throw new Error(error.message)
        return (data ?? []) as ReminderTask[]
      },
      (t) => t.id,
    )
    return rows.filter((t) => !excluded.has(t.list_id))
  }

  /**
   * その日の数字（予定 N 件中 M 件・予定外・記録）。夜のまとめは今日、朝のまとめは昨日（#278）。
   * アプリの今日の計画の見出し・週のふりかえりと同じ数え方（`wrapUp.ts` → `_shared/dayResult.ts`）。
   * 習慣の判定にゴミ箱の記録も使うので、消した・アーカイブした行も読む（数えるときに外す）
   */
  const dayDigest = async (userId: string, date: string, timeZone: string, excluded: ReadonlySet<string>): Promise<WrapUpDigest> => {
    const columns =
      'id,list_id,title,parent_id,is_time_log,is_sleep,is_event,completed,scheduled_date,due_date,start_time,end_time,end_date,source_task_id,habit_id,moved_plans,deleted_at,archived_at'
    /** `day`: その日のあたりの行（`wrapUpRowFilter`）、`moved`: その日から移した予定のある行 */
    const readRows = (which: 'day' | 'moved') =>
      fetchAllAfter(
        async (after: string | null, limit) => {
          let query = admin.from('tasks').select(columns).eq('user_id', userId)
          query = which === 'day' ? query.or(wrapUpRowFilter(date)) : query.contains('moved_plans', [{ date }])
          if (after !== null) query = query.gt('id', after)
          const { data, error } = await query.order('id').limit(limit)
          if (error) throw new Error(error.message)
          return (data ?? []) as unknown as WrapUpRow[]
        },
        (t) => t.id,
      )
    const [rows, moved, habits] = await Promise.all([
      readRows('day'),
      // その日から別の日へ移した予定（やらなかった予定として数える）
      readRows('moved'),
      fetchAllAfter(
        async (after: string | null, limit) => {
          let query = admin
            .from('habits')
            .select(
              'id,title,time_mode,start_time,end_time,frequency,completed_dates,time_overrides,weekday_times,rest_dates,goal_minutes,past_rules,kind,archived_at,deleted_at',
            )
            .eq('user_id', userId)
            .is('deleted_at', null)
            .is('archived_at', null)
          if (after !== null) query = query.gt('id', after)
          const { data, error } = await query.order('id').limit(limit)
          if (error) throw new Error(error.message)
          return (data ?? []) as WrapUpHabitRow[]
        },
        (h) => h.id,
      ),
    ])
    const seen = new Set(rows.map((r) => r.id))
    return wrapUpDigest([...rows, ...moved.filter((r) => !seen.has(r.id))], habits, date, localNow(timeZone, now), excluded)
  }

  let sent = 0
  let removed = 0
  let keyMismatch = 0
  let failed = 0

  const removeSub = async (endpoint: string) => {
    const { error } = await admin.from('push_subscriptions').delete().eq('endpoint', endpoint)
    if (error) throw new Error(error.message)
    removed++
  }

  const needsTasks = (sub: Sub) => Boolean(sub.plan_time || sub.event_reminder_minutes != null || sub.due_reminders || sub.record_prompts)

  /** 夜のまとめの時刻に入っているか（記録の数は見ない。数字を読むかどうかを決める） */
  const wrapUpWindow = (sub: Sub) => {
    const local = localNow(sub.timezone, now)
    return dailyDue(sub.wrap_up_time, sub.last_wrap_up_sent, local.date, local.minutes)
  }

  /** 1 つの端末へ、今送る通知を組み立てて並べて送り、送った印を 1 回で書く */
  /**
   * もう記録のある予定（`予定の id|日`）。その予定から始めた記録（`source_task_id`、その日の）と、今その予定を計っているタイマー（#419）。
   * 読めなければ空（記録の確認は今までどおり送る）
   */
  const recordedPlans = async (userId: string, ids: string[], dates: string[]): Promise<Set<string>> => {
    const out = new Set<string>()
    try {
      const [logs, timer] = await Promise.all([
        admin
          .from('tasks')
          .select('source_task_id,due_date')
          .eq('user_id', userId)
          .is('is_time_log', true)
          .is('deleted_at', null)
          .in('source_task_id', ids)
          .in('due_date', dates),
        admin.from('user_active_timer').select('task_id,started_at').eq('user_id', userId).maybeSingle(),
      ])
      if (logs.error) throw new Error(logs.error.message)
      if (timer.error) throw new Error(timer.error.message)
      for (const r of (logs.data ?? []) as { source_task_id: string; due_date: string }[]) out.add(`${r.source_task_id}|${r.due_date}`)
      const running = timer.data as { task_id: string | null; started_at: string | null } | null
      if (running?.task_id && running.started_at) for (const d of dates) out.add(`${running.task_id}|${d}`)
    } catch (err) {
      console.error('[daily-reminders] load recorded plans failed', err)
    }
    return out
  }

  const processSub = async (sub: Sub, tasks: ReminderTask[], digestOf: (sub: Sub, date: string) => Promise<WrapUpDigest | null>) => {
    const local = localNow(sub.timezone, now)
    const msg: Msg = sub.lang === 'en' ? MESSAGES.en : MESSAGES.ja
    const nowWall = (dayWallMs(local.date) ?? 0) + local.minutes * 60_000
    const sentKeys = [...(sub.reminder_sent?.keys ?? [])]
    const sentSet = new Set(sentKeys)
    const jobs: { payload: Payload; keys?: string[]; patch?: Record<string, unknown> }[] = []

    if (dailyDue(sub.plan_time, sub.last_plan_sent, local.date, local.minutes)) {
      // 昨日の数字（#278）。読めなければ昨日の行だけを出さずに送る（今日の予定・締切は止めない）
      const yesterday = await digestOf(sub, previousDay(local.date))
      jobs.push({
        payload: morningPayload(msg, morningDigest(tasks, local.date), yesterday),
        patch: { last_plan_sent: local.date },
      })
    }

    // 引き落とし・期限の日（#454）: 朝のまとめの時刻（使っていなければ締切の通知がオンの人に 8:00）に、知らせ始める日と当日のものを 1 通で
    const dueDates = duesByUser?.get(sub.user_id)
    const duesTime = sub.plan_time ?? (sub.due_reminders ? DUES_DEFAULT_TIME : null)
    const duesKey = duesSentKey(local.date)
    if (dueDates && dailyDue(duesTime, sentSet.has(duesKey) ? local.date : null, local.date, local.minutes)) {
      const items = duesToNotify(dueDates, local.date)
      if (items.length > 0) jobs.push({ payload: duesPayload(msg, items), keys: [duesKey] })
    }

    if (wrapUpWindow(sub)) {
      // 読めなかったら夜のまとめだけを送らない（印を残さないので次の回にやり直す）
      const d = await digestOf(sub, local.date)
      if (d && wrapUpDue(sub.wrap_up_time, sub.last_wrap_up_sent, local.date, local.minutes, d.loggedMinutes)) {
        jobs.push({ payload: wrapUpPayload(msg, d), patch: { last_wrap_up_sent: local.date } })
      }
    }

    let fired = remindersInWindow(
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
    // もう記録のある予定には、終わったあとの記録の確認を出さない（#419）
    const prompts = fired.filter((r) => r.kind === 'record')
    if (prompts.length > 0) {
      const recorded = await recordedPlans(
        sub.user_id,
        [...new Set(prompts.map((r) => r.taskId))],
        [...new Set(prompts.map((r) => r.date))],
      )
      fired = dropRecordedPrompts(fired, (taskId, date) => recorded.has(`${taskId}|${date}`))
    }
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

    if (sub.timer_started_at && staleTimerDue(sub.timer_started_at, now.getTime(), sub.timer_notified_for)) {
      jobs.push({
        payload: timerPayload(msg, sub.timer_title ?? '', sub.timer_started_at),
        patch: { timer_notified_for: sub.timer_started_at },
      })
    }
    // 「あと何分」の時間（#290）。この回の間隔（5 分）だけ遅れて届くことがある。タブを開いていた端末が先に知らせたら、
    // その端末が全部の購読に送った印（timer_end_notified_for）を付けるので、ここでは送らない（`src/lib/timerEndAlert.ts`）
    if (sub.timer_started_at && timerEndDue(sub.timer_ends_at, now.getTime(), sub.timer_end_notified_for)) {
      jobs.push({
        payload: timerEndPayload(msg, sub.timer_title ?? '', sub.timer_started_at),
        patch: { timer_end_notified_for: sub.timer_ends_at },
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
    // 購読が失効した・受け付けられない（`isGoneStatus`）なら消す。アプリを開けば端末が付け直す
    if (outcome.gone) {
      await removeSub(sub.endpoint)
      if (outcome.keyMismatch) keyMismatch++
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
    const userId = valid[0].user_id
    const wantsDigest = valid.some(wrapUpWindow)
    if ((valid.some(needsTasks) || wantsDigest) && !excludedByUser) throw new Error('lists not loaded')
    const excluded = excludedByUser?.get(userId) ?? new Set<string>()
    const tasks = valid.some(needsTasks) ? await openTasks(userId, excluded) : []
    // その日の数字（夜のまとめは今日、朝のまとめは昨日）は、日とタイムゾーン（端末）の組ごとに 1 回だけ読む。
    // 読めなかったら null（その数字を使う部分だけを出さない。ほかの通知は送る）
    const digests = new Map<string, Promise<WrapUpDigest | null>>()
    const digestOf = (sub: Sub, date: string): Promise<WrapUpDigest | null> => {
      const key = `${date}|${sub.timezone}`
      if (!digests.has(key)) {
        digests.set(
          key,
          dayDigest(userId, date, sub.timezone, excluded).catch((err) => {
            failed++
            console.error('[daily-reminders] load day numbers failed', date, err)
            return null
          }),
        )
      }
      return digests.get(key)!
    }
    const results = await Promise.allSettled(valid.map((sub) => processSub(sub, tasks, digestOf)))
    for (const r of results) {
      if (r.status === 'rejected') {
        failed++
        console.error('[daily-reminders] subscription failed', r.reason)
      }
    }
  }

  // いつか / チェックリストのリストは、予定・締切・夜のまとめの数字を使う人の分だけ、回の初めにまとめて読む。
  // 読めなければその人たちの分は送らずに失敗に数える（last_ok_at を進めないので、次の回にやり直す）
  let excludedByUser: Map<string, Set<string>> | null = null
  try {
    excludedByUser = await loadExcludedLists([...new Set(subs.filter((s) => needsTasks(s) || wrapUpWindow(s)).map((s) => s.user_id))])
  } catch (err) {
    console.error('[daily-reminders] load lists failed', err)
  }

  // 引き落とし・期限の日は、朝のまとめか締切の通知を使う人の分だけ読む。読めなければ期限の通知だけ送らない（ほかの通知は送る。
  // 失敗に数えるので last_ok_at が進まず、次の回の 60 分の間に送り直す。送った印があれば二重には送らない）
  let duesByUser: Map<string, DueItem[]> | null = null
  try {
    duesByUser = await loadDues([...new Set(subs.filter((s) => s.plan_time || s.due_reminders).map((s) => s.user_id))])
  } catch (err) {
    failed++
    console.error('[daily-reminders] load dues failed', err)
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

  await finishRun({ checked: subs.length, sent, removed, keyMismatch, failed })

  // 連携のトークンの閉じ直し。通知の回の成否には数えない（失敗はログだけ。次の回にまた試す）
  let resealed = 0
  try {
    const sweep = await resealStaleTokens(tokenSweepDb(admin), keyRing(), TOKEN_SWEEP_LIMIT)
    resealed = sweep.resealed
    if (sweep.unreadable > 0) console.warn('[daily-reminders] token sweep: unreadable values', sweep.unreadable)
  } catch (err) {
    console.error('[daily-reminders] token sweep failed', err instanceof Error ? err.message : err)
  }

  // 失敗があれば 500（cron の実行の記録で気づけるように）。中身は同じ
  return new Response(JSON.stringify({ checked: subs.length, sent, removed, keyMismatch, failed, resealed }), {
    status: runStatus(failed),
    headers: { 'Content-Type': 'application/json' },
  })
})
