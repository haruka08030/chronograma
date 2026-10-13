import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n/config'
import type { Task } from '../../types/task'
import { useTaskStore } from '../../store/taskStore'
import { unplannedListIds } from '../../lib/listKind'
import { recordLabelKey } from '../../lib/logCategoryColors'
import { recordLabelKeyText } from '../../lib/todoColorLabels'
import { appTodayKey } from '../../lib/timeZone'
import { downloadTextFile } from '../../lib/downloadFile'
import {
  buildRecordsCsv,
  buildRecordsIcs,
  collectExportRows,
  exportPeriodRange,
  type ExportMatch,
  type ExportRowKind,
  type RecordExportPeriod,
} from '../../lib/recordExport'
import { SettingsRow, Switch } from './SettingsPrimitives'
import { Segmented } from '../ui/Segmented'
import { buttonClass } from '../ui/buttonClass'
import { META_TEXT } from '../ui/textClass'

const MATCH_KEY: Record<ExportMatch, string> = {
  matched: 'matched',
  'time-drift': 'timeDrift',
  'actual-only': 'actualOnly',
}

const HEADER_KEYS = ['kind', 'date', 'start', 'end', 'endDate', 'minutes', 'label', 'title', 'tags', 'plan'] as const

/**
 * 設定「データ」の「記録を書き出す」（#281）。期間を選んで、記録を CSV（表計算）か ICS（ほかのカレンダー）に。
 * 手元のデータから作る。期間に書き出すものが無ければボタンを押せなくし、件数で 0 件と分かるようにする
 */
export function RecordExportSettings() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const habits = useTaskStore((s) => s.habits)
  const lists = useTaskStore((s) => s.lists)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const [period, setPeriod] = useState<RecordExportPeriod>('month')
  const [includePlans, setIncludePlans] = useState(false)

  const today = appTodayKey()
  const rows = useMemo(
    () =>
      collectExportRows(tasks, habits, {
        range: exportPeriodRange(period, today),
        includePlans,
        excludedListIds: unplannedListIds(lists),
      }),
    [tasks, habits, lists, period, today, includePlans],
  )
  const logCount = rows.filter((r) => r.kind === 'log').length
  const sleepCount = rows.filter((r) => r.kind === 'sleep').length
  const planCount = rows.length - logCount - sleepCount

  /** ラベル名 → 名前の無い色は色の名前。ラベルなしは空（「ラベルなし」と書かない） */
  const labelOf = (task: Task) => {
    const key = recordLabelKey(task, presets, colors)
    return key ? recordLabelKeyText(key, presets, colors, (k) => i18n.t(k)) : ''
  }
  const fileName = (ext: string) => `chronograma-records-${appTodayKey()}.${ext}`

  const exportCsv = () => {
    const csv = buildRecordsCsv({
      rows,
      labelOf,
      texts: {
        headers: HEADER_KEYS.map((k) => i18n.t(`recordExport.headers.${k}`)),
        kind: (kind: ExportRowKind) => i18n.t(`recordExport.kind.${kind}`),
        match: (match) => i18n.t(`recordExport.match.${MATCH_KEY[match]}`),
      },
    })
    downloadTextFile(csv, fileName('csv'), 'text/csv;charset=utf-8')
  }

  const exportIcs = () => {
    const ics = buildRecordsIcs({
      rows,
      labelOf,
      untitled: i18n.t('recordExport.untitled'),
      calendarName: i18n.t('recordExport.calendarName'),
      now: Date.now(),
    })
    downloadTextFile(ics, fileName('ics'), 'text/calendar;charset=utf-8')
  }

  const counts = [
    t('recordExport.countLogs', { count: logCount }),
    ...(sleepCount > 0 ? [t('recordExport.countSleep', { count: sleepCount })] : []),
    ...(planCount > 0 ? [t('recordExport.countPlans', { count: planCount })] : []),
  ].join(t('recordExport.countSeparator'))

  return (
    <>
      {/* 説明は幅いっぱいに読めるよう、期間の切り替えは次の行に置く（スマホで説明が細く折れない） */}
      <SettingsRow label={t('recordExport.title')} help={t('recordExport.help')} />
      <SettingsRow label={t('recordExport.period')}>
        <Segmented
          ariaLabel={t('recordExport.period')}
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'week', label: t('recordExport.periodWeek') },
            { value: 'month', label: t('recordExport.periodMonth') },
            { value: 'lastMonth', label: t('recordExport.periodLastMonth') },
            { value: 'all', label: t('recordExport.periodAll') },
          ]}
        />
      </SettingsRow>
      <SettingsRow label={t('recordExport.includePlans')} help={t('recordExport.includePlansHelp')}>
        <Switch checked={includePlans} onChange={setIncludePlans} label={t('recordExport.includePlans')} />
      </SettingsRow>
      <SettingsRow label={<span className={`tabular-nums ${META_TEXT}`}>{counts}</span>}>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className={buttonClass({ variant: 'secondary', size: 'md' })}
        >
          {t('recordExport.csv')}
        </button>
        <button type="button" onClick={exportIcs} disabled={logCount === 0} className={buttonClass({ variant: 'secondary', size: 'md' })}>
          {t('recordExport.ics')}
        </button>
      </SettingsRow>
    </>
  )
}
