import { useEffect } from 'react'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { useAuth } from '../contexts/AuthContext'
import { checkLocalReminders } from '../lib/localReminders'
import { isWebPushActive, syncWebPush } from '../lib/webPush'
import { unplannedListIds } from '../lib/listKind'
import { subscribeAppClock } from '../lib/appClock'

/**
 * 通知（朝のまとめ・予定の前・締切の前・予定のあとの記録の確認・タイマーの止め忘れ）。
 * ログイン中は Web Push（閉じていても届く）に購読し、使えない環境ではタブを開いている間だけ出す
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
}
