import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { requestPermission } from '../../lib/notifications'
import { buttonClass } from '../ui/buttonClass'
import { useOnboardingNudge } from '../../hooks/useOnboardingNudge'

/** 1 日を締める操作。文に混ぜず、メッセージの下に並べる（スマホでも押しやすい高さ） */
const wrapUpButton = buttonClass({ variant: 'secondary', size: 'sm' }, 'min-h-9 md:min-h-8')
const textButton = buttonClass({ variant: 'link', size: 'xs' })

/**
 * 今日の計画の下: 「1 日を締める」（残りを明日へ・ラベルなしの記録に分類を付ける）と、通知をすすめる 1 行
 */
export function PlannerWrapUp({
  showWrapUp,
  open,
  untaggedLogs,
  totalCount,
  tomorrowKey,
  openDetail,
}: {
  showWrapUp: boolean
  open: Task[]
  untaggedLogs: Task[]
  totalCount: number
  tomorrowKey: string
  openDetail: (id: string) => void
}) {
  const { t } = useTranslation()
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  const reminderPromptDismissed = useTaskStore((s) => s.reminderPromptDismissed)
  const enableRecommendedNotifications = useTaskStore((s) => s.enableRecommendedNotifications)
  const anyNotification = useTaskStore(
    (s) => Boolean(s.dailyReminders.planTime) || s.eventReminderMinutes != null || s.notificationsEnabled || s.recordPrompts,
  )
  const dismissReminderPrompt = useTaskStore((s) => s.dismissReminderPrompt)
  const onboardingNudge = useOnboardingNudge()
  const showReminderPrompt =
    totalCount > 0 &&
    onboardingNudge !== 'recordPrompts' &&
    !reminderPromptDismissed &&
    !anyNotification &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission !== 'denied'

  const enableReminders = async () => {
    const granted = await requestPermission()
    if (granted) enableRecommendedNotifications()
    dismissReminderPrompt()
  }

  return (
    <footer className="mt-auto space-y-2 px-6 pb-6 pt-8 text-sm">
      {showWrapUp && (open.length > 0 || untaggedLogs.length > 0) && (
        <div className="space-y-2">
          {open.length > 0 && <p className="text-zinc-600 dark:text-zinc-300">{t('planner.wrapUpRemaining', { count: open.length })}</p>}
          <div className="flex flex-wrap gap-2">
            {open.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  rescheduleTasks(
                    open.map((x) => x.id),
                    tomorrowKey,
                  )
                }
                className={wrapUpButton}
              >
                {t('planner.moveRestToTomorrow')}
              </button>
            )}
            {untaggedLogs.length > 0 && (
              <button type="button" onClick={() => openDetail(untaggedLogs[0]!.id)} className={wrapUpButton}>
                {t('planner.categorizeLogs', { count: untaggedLogs.length })}
              </button>
            )}
          </div>
        </div>
      )}
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
