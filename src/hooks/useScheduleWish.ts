import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { appTodayKey } from '../lib/timeZone'
import { fromDateKey } from '../lib/dateKey'

/**
 * いつか（Wish）の「予定する」: 未分類へ移してその日の予定にし、移った先を知らせる。
 * 行のカレンダーのボタンと右クリックのメニューで同じ動きにする
 */
export function useScheduleWish() {
  const { t } = useTranslation()
  return useCallback(
    (ids: string[], dateKey: string | null) => {
      if (!dateKey || ids.length === 0) return
      const { tasks, promoteToPlanned, showMoveBanner } = useTaskStore.getState()
      for (const id of ids) promoteToPlanned(id, dateKey)
      const title = ids.length === 1 ? tasks.find((x) => x.id === ids[0])?.title ?? '' : t('taskMenu.count', { count: ids.length })
      showMoveBanner(
        dateKey === appTodayKey()
          ? t('someday.movedToToday', { title })
          : t('someday.movedToDate', { title, date: format(fromDateKey(dateKey), t('someday.dateFormat')) }),
      )
    },
    [t],
  )
}
