import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { useBulkTaskActions } from './useBulkTaskActions'
import { appToday } from '../lib/timeZone'
import { toDateKey } from '../lib/dateKey'
import { taskPlacementDate } from '../lib/taskTimeRange'

/**
 * 「今日やる ⇄ 明日へ回す」（右クリックメニューの先頭・Shift+T・今日の計画の行で共通）。
 * 全部が今日に置いてあれば明日へ、そうでなければ今日へ。時刻と締切はそのまま（予定日だけ動かす）
 */
export function useTodayToggle() {
  const { t } = useTranslation()
  const bulk = useBulkTaskActions()
  return useCallback(
    (ids: string[]): { toTomorrow: boolean; label: string; run: () => void } => {
      const { tasks } = useTaskStore.getState()
      const today = appToday()
      const todayKey = toDateKey(today)
      const toTomorrow = ids.length > 0 && ids.every((id) => {
        const task = tasks.find((x) => x.id === id)
        return task ? taskPlacementDate(task) === todayKey : false
      })
      const key = toTomorrow ? toDateKey(addDays(today, 1)) : todayKey
      return {
        toTomorrow,
        label: toTomorrow ? t('taskMenu.toTomorrow') : t('taskMenu.doToday'),
        run: () => bulk.setScheduled(ids, key, toTomorrow ? t('dueDatePicker.tomorrow') : t('dueDatePicker.today')),
      }
    },
    [t, bulk],
  )
}
