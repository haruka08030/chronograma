import { useTranslation } from 'react-i18next'
import { addDays, nextMonday } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { useShallow } from 'zustand/react/shallow'
import { useBulkTaskActions } from './useBulkTaskActions'
import { useDateFormat } from './useDateFormat'
import { appToday } from '../lib/timeZone'
import { toDateKey } from '../lib/dateKey'
import { DatePickerBody } from '../components/DatePickerBody'
import { ClockIcon } from '../components/icons'
import type { ActionEntry, ActionLeaf } from '../components/ui/ActionMenu'

/**
 * メニューの「予定日 › 今日 / 明日 / 来週 / 日付… / 予定をはずす」（タスクの行と予定ブロックで共通）。
 * いつやるかを動かす。時刻はそのまま、締切（期限）は変えない。期限は別の項目
 */
export function useScheduleEntry(taskIds: string[], done: (fn: () => void) => () => void, iconClass: string): ActionEntry {
  const { t } = useTranslation()
  const df = useDateFormat()
  const bulk = useBulkTaskActions()
  const targets = useTaskStore(useShallow((s) => s.tasks.filter((x) => taskIds.includes(x.id))))
  const keys = new Set(targets.map((x) => x.scheduledDate ?? null))
  const shared = keys.size === 1 ? [...keys][0] : undefined
  const today = appToday()
  const leaves: ActionLeaf[] = [
    { label: t('dueDatePicker.today'), key: toDateKey(today) },
    { label: t('dueDatePicker.tomorrow'), key: toDateKey(addDays(today, 1)) },
    { label: t('taskMenu.nextWeek'), key: toDateKey(nextMonday(today)) },
  ]
    // 日曜は「明日」と「来週」が同じ月曜になるので 1 つにする
    .filter((o, i, arr) => arr.findIndex((x) => x.key === o.key) === i)
    .map((o): ActionLeaf => ({
    id: `scheduled-${o.key}`,
    label: o.label,
    hint: df.shortDateWeekday(o.key),
    checked: shared === o.key,
    run: done(() => bulk.setScheduled(taskIds, o.key, o.label)),
  }))
  if (targets.some((x) => x.scheduledDate)) {
    leaves.push({ id: 'scheduled-none', label: t('taskMenu.unschedule'), run: done(() => bulk.setScheduled(taskIds, null, '')) })
  }
  return {
    kind: 'sub',
    id: 'scheduled',
    label: t('taskMenu.scheduled'),
    icon: <ClockIcon className={iconClass} />,
    leaves,
    width: 'lg',
    extra: (close) => (
      <DatePickerBody
        footer={false}
        kind="scheduled"
        value={shared ?? null}
        onPick={(key) => {
          if (key) done(() => bulk.setScheduled(taskIds, key, df.shortDate(key)))()
          close()
        }}
      />
    ),
  }
}
