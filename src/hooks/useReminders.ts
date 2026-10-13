import { useEffect } from 'react'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { useAuth } from '../contexts/AuthContext'
import { checkLocalReminders } from '../lib/localReminders'
import { isWebPushActive, syncWebPush } from '../lib/webPush'
import { unplannedListIds } from '../lib/listKind'
import { subscribeAppClock } from '../lib/appClock'
import { openTaskFromNotification, openWrapUpFromNotification } from '../lib/notificationLaunch'
import { checkTimerEnd } from '../lib/timerEndAlert'
import { loadSupabase } from '../lib/supabase'
import { reportFailure } from '../lib/errorReport'

/** 「あと何分」の終わりまでの待ちの上限（setTimeout は 2^31 ms を超えるとすぐ呼ばれる。長い待ちは途中で見直す） */
const MAX_TIMER_END_WAIT_MS = 60 * 60_000

/**
 * 通知（朝のまとめ・予定の前・締切の前・予定のあとの記録の確認・夜の締め・タイマーの止め忘れ）。
 * ログイン中は Web Push（閉じていても届く）に購読し、使えない環境ではタブを開いている間だけ出す。
 * 「あと何分」の時間（#290）は、Web Push があってもタブを開いていればちょうどの時刻にタブで知らせる（`timerEndAlert.ts`）
 */
export function useReminders() {
  const notificationsEnabled = useTaskStore((s) => s.notificationsEnabled)
  const dailyReminders = useTaskStore((s) => s.dailyReminders)
  const eventReminderMinutes = useTaskStore((s) => s.eventReminderMinutes)
  const recordPrompts = useTaskStore((s) => s.recordPrompts)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const hasTaskReminders = useTaskStore((s) => s.tasks.some((t) => (t.reminders?.length ?? 0) > 0 && !t.completed))
  const appTimeZoneSetting = useTaskStore((s) => s.appTimeZone)
  const { user } = useAuth()
  const userId = user?.id ?? null
  useEffect(() => {
    void syncWebPush({
      userId,
      reminders: dailyReminders,
      eventReminderMinutes,
      dueReminders: notificationsEnabled,
      recordPrompts,
      hasTaskReminders,
      activeTimer,
      lang: i18n.resolvedLanguage ?? 'ja',
    })
  }, [userId, dailyReminders, eventReminderMinutes, notificationsEnabled, recordPrompts, hasTaskReminders, activeTimer, appTimeZoneSetting])
  useEffect(() => {
    const tick = () => {
      if (isWebPushActive()) return
      const state = useTaskStore.getState()
      checkLocalReminders({
        tasks: state.tasks,
        excludedListIds: unplannedListIds(state.lists),
        daily: state.dailyReminders,
        settings: {
          eventReminderMinutes: state.eventReminderMinutes,
          dueReminders: state.notificationsEnabled,
          recordPrompts: state.recordPrompts,
        },
        activeTimer: state.activeTimer,
        onOpen: () => useTaskStore.getState().selectView('planner'),
        onRecord: (taskId) => useTaskStore.getState().openRecordPrompt(taskId),
        onOpenTask: (taskId, date) => openTaskFromNotification(taskId, date),
        onWrapUp: () => openWrapUpFromNotification(),
      })
    }
    tick()
    const id = setInterval(tick, 30_000)
    // 表に戻ったとき・分の境目にも見る（日をまたいだ朝のまとめを次の 30 秒まで待たせない）
    const unsubscribe = subscribeAppClock(tick)
    return () => {
      clearInterval(id)
      unsubscribe()
    }
  }, [])

  // 「あと何分」の時間（#290）。終わりの時刻にちょうど見る（30 秒ごとの見回りでは最大 30 秒遅れる）。表に戻ったときも見る
  const timerEndsAt = activeTimer?.endsAt ?? null
  useEffect(() => {
    if (!timerEndsAt) return
    const check = () =>
      checkTimerEnd(useTaskStore.getState().activeTimer, {
        onOpen: () => useTaskStore.getState().selectView('planner'),
        markNotified: userId ? (endsAt) => markTimerEndNotified(userId, endsAt) : undefined,
      })
    let id: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      clearTimeout(id)
      const wait = Date.parse(timerEndsAt) - Date.now()
      if (wait <= 0) {
        check()
        return
      }
      id = setTimeout(arm, Math.min(wait + 50, MAX_TIMER_END_WAIT_MS))
    }
    arm()
    const unsubscribe = subscribeAppClock(arm)
    return () => {
      clearTimeout(id)
      unsubscribe()
    }
  }, [timerEndsAt, userId])
}

/** タブで知らせた終わりの時刻を、その人の全部の購読に付ける（`daily-reminders` が同じ知らせを遅れて送らない） */
async function markTimerEndNotified(userId: string, endsAt: string): Promise<void> {
  const supabase = await loadSupabase()
  if (!supabase) return
  const { error } = await supabase.from('push_subscriptions').update({ timer_end_notified_for: endsAt }).eq('user_id', userId)
  if (error) reportFailure('push', 'timer-end', error.message)
}
