import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { requestPermission } from '../../lib/notifications'
import { buttonClass } from '../ui/buttonClass'
import { useOnboardingNudge } from '../../hooks/useOnboardingNudge'
import { DayMoodPicker } from './DayMood'

const textButton = buttonClass({ variant: 'link', size: 'xs' })

/**
 * 今日の計画の下: その日の気分の記号（締めの時刻から）と、通知をすすめる 1 行。
 * 残りを明日へ・ラベルなしの記録・記録の無い時間は、ここでは並べない（次の日の「やり残し」、記録の帯の凡例の「ラベルなし」、
 * タイムラインの「＋ 記録なし」で同じことができる）。夜のまとめの通知から開いたとき（`focusKey` が 1 以上）はここまでスクロールする
 */
export function PlannerWrapUp({
  showMood = false,
  dateKey,
  focusKey = 0,
  totalCount,
}: {
  /** 気分の記号の行を出すか（今日の締めの時刻から） */
  showMood?: boolean
  /** 見ている日（気分を付ける日） */
  dateKey: string
  /** 夜のまとめの通知から開いた回数（増えるたびにここまでスクロールする） */
  focusKey?: number
  totalCount: number
}) {
  const { t } = useTranslation()
  const reminderPromptDismissed = useTaskStore((s) => s.reminderPromptDismissed)
  const enableRecommendedNotifications = useTaskStore((s) => s.enableRecommendedNotifications)
  const anyNotification = useTaskStore(
    (s) =>
      Boolean(s.dailyReminders.planTime || s.dailyReminders.wrapUpTime) ||
      s.eventReminderMinutes != null ||
      s.notificationsEnabled ||
      s.recordPrompts,
  )
  const dismissReminderPrompt = useTaskStore((s) => s.dismissReminderPrompt)
  const onboardingNudge = useOnboardingNudge()
  const showReminderPrompt =
    totalCount > 0 &&
    // 案内のあとのカード（ログイン・通知など）を出している間は出さない（一度に 1 つだけ聞く）
    onboardingNudge == null &&
    !reminderPromptDismissed &&
    !anyNotification &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission !== 'denied'

  const footerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (focusKey > 0) footerRef.current?.scrollIntoView?.({ block: 'end' })
  }, [focusKey])

  const enableReminders = async () => {
    const granted = await requestPermission()
    if (granted) enableRecommendedNotifications()
    dismissReminderPrompt()
  }

  return (
    <footer ref={footerRef} data-wrap-up className="mt-auto space-y-2 px-6 pb-6 pt-8 text-sm">
      {showMood && <DayMoodPicker dateKey={dateKey} />}
      {showReminderPrompt && (
        <p className="text-zinc-400 dark:text-zinc-500">
          {t('planner.reminderPromptShort')}{' '}
          <button type="button" onClick={() => void enableReminders()} className={`whitespace-nowrap ${textButton}`}>
            {t('planner.reminderPromptEnable')}
          </button>
          <button
            type="button"
            onClick={dismissReminderPrompt}
            className="whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            {t('planner.reminderPromptLater')}
          </button>
        </p>
      )}
    </footer>
  )
}
