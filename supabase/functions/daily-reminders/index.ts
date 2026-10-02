// Sends the daily "plan your day" / "wrap up" Web Push reminders.
// Invoked by pg_cron every 5 minutes (see README). Not callable by clients: requires CRON_SECRET.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:... or https://...), CRON_SECRET
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by the platform)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import webpush from 'npm:web-push@3.6.7'
import { isWithinTick, minutesOfClock, selectDueToNotify } from './schedule.ts'

/** 指定時刻からこの分数を過ぎたら、その日は送らない（cron が止まっていた後に朝の通知を夜に出さない） */
const GRACE_MINUTES = 60

type Sub = {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
  timezone: string
  lang: string
  plan_time: string | null
  wrap_up_time: string | null
  last_plan_sent: string | null
  last_wrap_up_sent: string | null
  /** 005 で追加。null はオフ */
  event_reminder_minutes?: number | null
  event_notified?: { date?: string; ids?: string[] } | null
  /** 011 で追加。締切の通知を push でも送るか */
  due_reminders?: boolean | null
  due_notified?: { date?: string; ids?: string[] } | null
}

type PlannedRow = { id: string; title: string; start_time: string; end_time: string | null; list_id: string }

const MESSAGES = {
  ja: {
    planTitle: '今日を計画しましょう',
    planBody: 'やることを 3 つ選んで、タイムラインに置いてみましょう。',
    wrapUpTitle: '1 日を締めましょう',
    wrapUpRemaining: (n: number) => `残り ${n} 件。明日に回すものを決めて、今日はおしまいにしましょう。`,
    wrapUpClear: '今日の分はすべて完了です。おつかれさまでした。',
    dueTitle: '今日が締切です',
    dueOne: (title: string, time: string | null) => (time ? `${title}（${time} まで）` : title),
    joinTitles: (titles: string[]) => titles.join('、'),
  },
  en: {
    planTitle: 'Plan your day',
    planBody: 'Pick three things and place them on your timeline.',
    wrapUpTitle: 'Wrap up your day',
    wrapUpRemaining: (n: number) => `${n} left. Decide what moves to tomorrow and call it a day.`,
    wrapUpClear: 'Everything for today is done. Nice work.',
    dueTitle: 'Due today',
    dueOne: (title: string, time: string | null) => (time ? `${title} (by ${time})` : title),
    joinTitles: (titles: string[]) => titles.join(', '),
  },
} as const

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
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

function isDue(time: string | null, lastSent: string | null, local: { date: string; minutes: number }): boolean {
  if (!time || lastSent === local.date) return false
  const [h, m] = time.split(':').map(Number)
  const diff = local.minutes - (h * 60 + m)
  return diff >= 0 && diff < GRACE_MINUTES
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
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

  const { data, error } = await admin
    .from('push_subscriptions')
    .select('*')
    .or('plan_time.not.is.null,wrap_up_time.not.is.null,event_reminder_minutes.not.is.null,due_reminders.is.true')
  if (error) return new Response(error.message, { status: 500 })

  const now = new Date()
  const remainingCache = new Map<string, number>()
  const remainingFor = async (userId: string, date: string): Promise<number> => {
    const key = `${userId}:${date}`
    const hit = remainingCache.get(key)
    if (hit !== undefined) return hit
    // 「今日の計画」と同じ基準: 予定日（無ければ期限日）がその日の、未完了のルートタスク。
    // いつか / チェックリストのリストは数えない（004 未適用なら kind 列が無いので除外なし）
    const { data: unplanned } = await admin
      .from('lists')
      .select('id')
      .eq('user_id', userId)
      .in('kind', ['someday', 'checklist'])
    const excluded = (unplanned ?? []).map((l: { id: string }) => l.id)
    let query = admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('completed', false)
      .eq('is_time_log', false)
      .is('parent_id', null)
      .is('deleted_at', null)
      .is('archived_at', null)
      .or(`scheduled_date.eq.${date},and(scheduled_date.is.null,due_date.eq.${date})`)
    if (excluded.length > 0) query = query.not('list_id', 'in', `(${excluded.map((id) => `"${id}"`).join(',')})`)
    const { count } = await query
    const n = count ?? 0
    remainingCache.set(key, n)
    return n
  }

  // いつか / チェックリストのリスト（予定の通知・残り件数から外す）
  const excludedCache = new Map<string, string[]>()
  const excludedLists = async (userId: string): Promise<string[]> => {
    const hit = excludedCache.get(userId)
    if (hit) return hit
    const { data: unplanned } = await admin
      .from('lists')
      .select('id')
      .eq('user_id', userId)
      .in('kind', ['someday', 'checklist'])
    const ids = (unplanned ?? []).map((l: { id: string }) => l.id)
    excludedCache.set(userId, ids)
    return ids
  }

  /** 開始 N 分前の時刻が、この cron の 5 分の幅に入った今日の予定 */
  const dueEvents = async (sub: Sub, local: { date: string; minutes: number }): Promise<PlannedRow[]> => {
    const before = sub.event_reminder_minutes
    if (!before) return []
    const { data: rows } = await admin
      .from('tasks')
      .select('id,title,start_time,end_time,list_id,scheduled_date,due_date')
      .eq('user_id', sub.user_id)
      .eq('completed', false)
      .eq('is_time_log', false)
      .is('parent_id', null)
      .is('deleted_at', null)
      .is('archived_at', null)
      .not('start_time', 'is', null)
      .or(`scheduled_date.eq.${local.date},and(scheduled_date.is.null,due_date.eq.${local.date})`)
    const excluded = new Set(await excludedLists(sub.user_id))
    const notified = new Set(sub.event_notified?.date === local.date ? sub.event_notified?.ids ?? [] : [])
    return ((rows ?? []) as PlannedRow[]).filter((r) => {
      if (excluded.has(r.list_id) || notified.has(r.id)) return false
      const start = minutesOfClock(r.start_time)
      if (start == null) return false
      return isWithinTick(start - before, local.minutes)
    })
  }

  /**
   * 今日が締切のタスクのうち、通知する時刻がこの cron の 5 分の幅に入ったもの。
   *
   * 締切時刻（due_time）があればその時刻、無ければ朝の計画の時刻
   * （未設定なら 9:00）にまとめて 1 通。アプリを開いた瞬間に 1 件ずつ出していた
   * 従来のローカル通知と違い、締切の時間に届く。
   */
  const dueTasks = async (
    sub: Sub,
    local: { date: string; minutes: number },
  ): Promise<{ id: string; title: string; due_time: string | null }[]> => {
    if (!sub.due_reminders) return []
    const { data: rows } = await admin
      .from('tasks')
      .select('id,title,due_time,list_id')
      .eq('user_id', sub.user_id)
      .eq('completed', false)
      .eq('is_time_log', false)
      .is('parent_id', null)
      .is('deleted_at', null)
      .is('archived_at', null)
      .eq('due_date', local.date)
    return selectDueToNotify(
      (rows ?? []) as { id: string; title: string; due_time: string | null; list_id: string }[],
      {
        nowMinutes: local.minutes,
        excludedListIds: new Set(await excludedLists(sub.user_id)),
        notifiedIds: new Set(sub.due_notified?.date === local.date ? sub.due_notified?.ids ?? [] : []),
        // 締切時刻の無いものは朝の計画の時刻にまとめる（二重に気づかせない）
        planTime: sub.plan_time,
      },
    ).map(({ id, title, due_time }) => ({ id, title, due_time }))
  }

  let sent = 0
  let removed = 0
  for (const sub of (data ?? []) as Sub[]) {
    const local = localNow(sub.timezone, now)
    const msg = sub.lang === 'en' ? MESSAGES.en : MESSAGES.ja
    const jobs: {
      column: 'last_plan_sent' | 'last_wrap_up_sent' | null
      eventId?: string
      /** この通知でまとめて知らせた締切タスク（通知済みとして控える） */
      dueIds?: string[]
      payload: Record<string, string>
    }[] = []

    if (isDue(sub.plan_time, sub.last_plan_sent, local)) {
      jobs.push({
        column: 'last_plan_sent',
        payload: { title: msg.planTitle, body: msg.planBody, tag: 'chronograma-plan', url: '/?view=planner' },
      })
    }
    if (isDue(sub.wrap_up_time, sub.last_wrap_up_sent, local)) {
      const n = await remainingFor(sub.user_id, local.date)
      jobs.push({
        column: 'last_wrap_up_sent',
        payload: {
          title: msg.wrapUpTitle,
          body: n > 0 ? msg.wrapUpRemaining(n) : msg.wrapUpClear,
          tag: 'chronograma-wrap-up',
          url: '/?view=planner',
        },
      })
    }

    const events = await dueEvents(sub, local)
    for (const ev of events) {
      jobs.push({
        column: null,
        eventId: ev.id,
        payload: {
          title: ev.title,
          body: ev.end_time ? `${ev.start_time.slice(0, 5)} – ${ev.end_time.slice(0, 5)}` : ev.start_time.slice(0, 5),
          tag: `chronograma-event-${ev.id}`,
          url: '/?view=planner',
        },
      })
    }

    // 同じ時刻に重なった締切は 1 通にまとめる（1 件ずつ出すと通知が洪水になる）
    const due = await dueTasks(sub, local)
    if (due.length > 0) {
      const first = due[0]
      const time = first.due_time ? first.due_time.slice(0, 5) : null
      jobs.push({
        column: null,
        dueIds: due.map((d) => d.id),
        payload: {
          title: msg.dueTitle,
          body:
            due.length === 1
              ? msg.dueOne(first.title, time)
              : msg.joinTitles(due.map((d) => d.title)),
          tag: 'chronograma-due',
          url: '/?view=planner',
        },
      })
    }

    const notifiedToday = sub.event_notified?.date === local.date ? [...(sub.event_notified?.ids ?? [])] : []
    const dueNotifiedToday = sub.due_notified?.date === local.date ? [...(sub.due_notified?.ids ?? [])] : []
    for (const job of jobs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(job.payload),
          { TTL: 60 * 60 },
        )
        sent++
        if (job.column) {
          await admin.from('push_subscriptions').update({ [job.column]: local.date }).eq('endpoint', sub.endpoint)
        } else if (job.eventId) {
          notifiedToday.push(job.eventId)
          await admin
            .from('push_subscriptions')
            .update({ event_notified: { date: local.date, ids: notifiedToday } })
            .eq('endpoint', sub.endpoint)
        } else if (job.dueIds) {
          dueNotifiedToday.push(...job.dueIds)
          await admin
            .from('push_subscriptions')
            .update({ due_notified: { date: local.date, ids: dueNotifiedToday } })
            .eq('endpoint', sub.endpoint)
        }
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 購読が失効（アプリ削除・権限取り消し）したら消す
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          removed++
          break
        }
        console.error('[daily-reminders] send failed', status, err)
      }
    }
  }

  return new Response(JSON.stringify({ checked: data?.length ?? 0, sent, removed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
