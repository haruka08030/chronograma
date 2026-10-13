import { useMemo, useState } from 'react'
import { formatDuration } from '../lib/timeGrid'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { sleepEndingOn, sleepMinutes } from '../lib/sleep'
import { useNow } from '../hooks/useAppClock'
import { tip } from '../lib/tooltip'
import { toDateKey } from '../lib/dateKey'
import { SleepMoonIcon, SleepTimesField } from './SleepTimesField'

/** 今日の睡眠を聞き始める時刻。夜更かし中に「起きた時刻」を聞かない */
const PROMPT_FROM_MIN = 5 * 60

/**
 * 今日画面の「睡眠」の 1 行。その日の朝に起きた睡眠を「何時に寝て、何時に起きたか」で入れる。
 * まだ無ければ前回の時刻を入れた入力欄（同じならワンタップで記録）、あれば時刻と長さだけを薄く出す。
 * 今日の分は朝 5 時を過ぎてから「睡眠を記録しますか？」と聞く。
 * 入力欄は統計の睡眠の図と同じ部品（SleepTimesField）。
 */
export function SleepRow({ dateKey }: { dateKey: string }) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)

  const record = useMemo(() => sleepEndingOn(tasks, dateKey), [tasks, dateKey])
  const [editing, setEditing] = useState(false)
  const now = useNow()

  const todayKey = toDateKey(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  if (dateKey > todayKey) return null
  const isToday = dateKey === todayKey
  if (isToday && !record && nowMin < PROMPT_FROM_MIN) return null

  if (record && !editing && record.startTime && record.endTime) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        {...tip(t('sleep.edit'))}
        className="-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <SleepMoonIcon />
        <span>{t('sleep.title')}</span>
        <span className="tabular-nums">
          {record.startTime}–{record.endTime}
        </span>
        <span className="tabular-nums text-zinc-400 dark:text-zinc-500">
          {formatDuration(sleepMinutes(record.startTime, record.endTime))}
        </span>
      </button>
    )
  }

  return (
    <SleepTimesField
      // 開き直すたびに下書き（記録の時刻か前回の時刻）を作り直す
      key={`${dateKey}|${record?.id ?? ''}`}
      dateKey={dateKey}
      record={record}
      label={!record && isToday ? t('sleep.prompt') : t('sleep.title')}
      onSaved={() => setEditing(false)}
      onCancel={record ? () => setEditing(false) : undefined}
    />
  )
}
