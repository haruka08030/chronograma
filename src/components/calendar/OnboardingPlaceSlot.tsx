import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { useShowsOnboarding } from '../../hooks/useShowsOnboarding'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { getDayPlan } from '../../lib/dayPlan'
import { unplannedListIds } from '../../lib/listKind'
import { onboardingSteps } from '../../lib/onboarding'
import { busySpans, findFreeSlots } from '../../lib/freeSlots'
import { minutesToTime } from '../../lib/clockTime'
import { fromDateKey } from '../../lib/dateKey'
import { isAppToday, zonedNow } from '../../lib/timeZone'
import { toastTitle } from '../../lib/undoWindow'
import { HOUR_HEIGHT } from '../../lib/timeGrid'

/**
 * はじめの案内の間（PC の今日の計画のタイムライン）: 時間の決まっていない To-Do しかないとき、今より後の最初の空き時間に
 * 点線の枠「ここに置く」を出す。押すとそこに置く（長さは見積もり、無ければ既定の予定の長さ）。ステップ ② を説明でなく 1 回押して済ませる
 */
export function OnboardingPlaceSlot({ dateKey, splitLanes }: { dateKey: string; splitLanes: boolean }) {
  const { t } = useTranslation()
  const showsOnboarding = useShowsOnboarding(isAppToday(fromDateKey(dateKey)))
  const isDesktop = useIsDesktop()
  const tasks = useTaskStore((s) => s.tasks)
  const events = useTaskStore((s) => s.calendarEvents)
  const lists = useTaskStore((s) => s.lists)
  const timerRunning = useTaskStore((s) => s.activeTimer !== null)
  const defaultBlockMinutes = useTaskStore((s) => s.defaultBlockMinutes)
  const updateTask = useTaskStore((s) => s.updateTask)

  const slot = useMemo(() => {
    if (!showsOnboarding || !isDesktop || onboardingSteps(tasks, timerRunning).placed) return null
    const task = getDayPlan(tasks, dateKey, unplannedListIds(lists)).open.find((x) => !(x.startTime && x.endTime))
    if (!task) return null
    const duration = task.estimateMinutes ?? defaultBlockMinutes
    const now = zonedNow()
    const [start] = findFreeSlots(busySpans(tasks, events, dateKey), { from: now.getHours() * 60 + now.getMinutes(), duration, count: 1 })
    return start === undefined ? null : { task, start, end: Math.min(start + duration, 24 * 60) }
  }, [showsOnboarding, isDesktop, tasks, timerRunning, events, lists, dateKey, defaultBlockMinutes])

  if (!slot) return null
  const startTime = minutesToTime(slot.start)
  const endTime = minutesToTime(slot.end)
  const label = t('onboarding.placeHere', { title: slot.task.title, start: startTime, end: endTime })
  return (
    <button
      type="button"
      data-onboarding-place
      className="absolute z-10 flex animate-fade-in items-start overflow-hidden rounded-[5px] border border-dashed border-accent-400 bg-accent-500/5
        px-1.5 pt-0.5 text-left text-[11px] leading-tight text-accent-700 transition-colors hover:bg-accent-500/10
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:text-accent-300"
      // 予定の列（記録の列と分かれていれば左半分）
      style={{
        left: 2,
        width: splitLanes ? 'calc(50% - 4px)' : undefined,
        right: splitLanes ? undefined : 2,
        top: (slot.start / 60) * HOUR_HEIGHT + 1,
        height: ((slot.end - slot.start) / 60) * HOUR_HEIGHT - 2,
      }}
      aria-label={label}
      title={label}
      // 列の「押して作る」を始めない
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() =>
        updateTask(
          slot.task.id,
          { scheduledDate: dateKey, startTime, endTime },
          t('undo.timeSet', { title: toastTitle(slot.task.title), time: `${startTime}–${endTime}` }),
        )
      }
    >
      <span className="min-w-0 truncate">
        <span className="font-medium">{t('onboarding.placeHereShort')}</span>
        <span className="tabular-nums">
          {' '}
          {startTime}–{endTime}
        </span>
      </span>
    </button>
  )
}
