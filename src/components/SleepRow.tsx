import { useMemo, useState } from 'react'
import { formatDuration } from '../lib/timeGrid'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { sleepEndingOn, sleepMinutes } from '../lib/sleep'
import { isBedtime, SLEEP_TIMER_MAX_MS, type SleepTimer } from '../lib/sleepTimer'
import { useNow } from '../hooks/useAppClock'
import { tip } from '../lib/tooltip'
import { toDateKey } from '../lib/dateKey'
import { clockOf } from '../lib/clockTime'
import { toAppWall } from '../lib/timeZone'
import { CloseIcon, PencilIcon, PlayIcon, SunIcon } from './icons'
import type { Task } from '../types/task'
import { SLEEP_ICON_BUTTON, SleepBar, SleepMoonIcon, SleepTimesField } from './SleepTimesField'
import { minutesOfDay } from '../lib/clockTime'

/** 今日の睡眠を聞き始める時刻。夜更かし中に「起きた時刻」を聞かない */
const PROMPT_FROM_MIN = 5 * 60

/**
 * 今日画面の「睡眠」の 1 行。その日の朝に起きた睡眠を「何時に寝て、何時に起きたか」で入れる。
 * 文字で説明せず形で見せる（#575）: 行頭の月・寝た時刻・睡眠の色の帯・起きた時刻・長さ。操作はアイコンのボタン（名前はホバーと読み上げ）。
 * まだ無ければ前回の時刻を入れた入力欄（同じなら ✓ のワンタップで記録）、あれば時刻と長さだけを薄く出す。
 * 今日の分は朝 5 時を過ぎてから聞く。
 * 今日の夜（20 時〜朝 5 時）は寝る（▶）を出し、押すと睡眠のタイマー（#519）。寝ている間は起きた（☀）で睡眠にする。
 * 寝ている間もその朝の記録の行は上に残す。記録の行は ✎ で直せると見せ、まだ記録の無い朝の欄は前回の時刻を下書きとして薄く出す（#627）。
 * 入力欄は統計の睡眠の図と同じ部品（SleepTimesField）。月のアイコンは行頭の 1 つだけ。
 */
export function SleepRow({ dateKey }: { dateKey: string }) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const sleepTimer = useTaskStore((s) => s.sleepTimer)
  const goToBed = useTaskStore((s) => s.goToBed)

  const record = useMemo(() => sleepEndingOn(tasks, dateKey), [tasks, dateKey])
  const [editing, setEditing] = useState(false)
  const now = useNow()

  const todayKey = toDateKey(now)
  const nowMin = minutesOfDay(now)
  if (dateKey > todayKey) return null
  const isToday = dateKey === todayKey

  const bedButton = isToday && isBedtime(nowMin) && (
    <button type="button" onClick={goToBed} {...tip(t('sleep.goToBed'), { name: true })} className={SLEEP_ICON_BUTTON}>
      <PlayIcon className="ml-px h-3 w-3" />
    </button>
  )

  // 夜更かし中でまだ今日の記録が無い: 月と寝る（▶）だけ
  if (isToday && !record && nowMin < PROMPT_FROM_MIN)
    return bedButton ? (
      <div className="flex items-center gap-1.5">
        <SleepMoonIcon />
        {bedButton}
      </div>
    ) : null

  // 寝ている間も、その朝の記録は上の行に残す（今夜の行で置き換えると、記録を上書きしたように見える）
  if (isToday && sleepTimer)
    return (
      <div className="flex flex-col gap-1">
        {record?.startTime && record.endTime && <RecordedSleep record={record} onEdit={() => setEditing(true)} />}
        {editing && record ? (
          <SleepTimesField
            key={record.id}
            dateKey={dateKey}
            record={record}
            label={<span className="sr-only">{t('sleep.title')}</span>}
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        ) : null}
        <SleepingRow timer={sleepTimer} dateKey={dateKey} />
      </div>
    )

  if (record && !editing && record.startTime && record.endTime) {
    return (
      <div className="flex items-center gap-2">
        <RecordedSleep record={record} onEdit={() => setEditing(true)} />
        {bedButton}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <SleepTimesField
        // 開き直すたびに下書き（記録の時刻か前回の時刻）を作り直す
        key={`${dateKey}|${record?.id ?? ''}`}
        dateKey={dateKey}
        record={record}
        label={<span className="sr-only">{!record && isToday ? t('sleep.prompt') : t('sleep.title')}</span>}
        onSaved={() => setEditing(false)}
        onCancel={record ? () => setEditing(false) : undefined}
      />
      {bedButton}
    </div>
  )
}

/**
 * 記録した睡眠の 1 行（☾ 23:30 ━ 07:00 7時間30分 ✎）。行ごと押すと時刻を直せる。
 * ホバーの無いスマホでも直せると分かるよう、行の終わりに薄い ✎ を置く
 */
function RecordedSleep({ record, onEdit }: { record: Task; onEdit: () => void }) {
  const { t } = useTranslation()
  const duration = formatDuration(sleepMinutes(record.startTime!, record.endTime!))
  return (
    <button
      type="button"
      onClick={onEdit}
      {...tip(t('sleep.edit'))}
      aria-label={`${t('sleep.edit')} ${record.startTime}–${record.endTime} ${duration}`}
      className="-mx-1.5 flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-xs tabular-nums text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      <SleepMoonIcon />
      <span>{record.startTime}</span>
      <SleepBar />
      <span>{record.endTime}</span>
      <span className="text-zinc-400 dark:text-zinc-500">{duration}</span>
      <PencilIcon className="ml-0.5 h-3 w-3 text-zinc-300 dark:text-zinc-600" strokeWidth={2} />
    </button>
  )
}

/**
 * 睡眠のタイマーが動いている間の行。☾ 寝た時刻 ▬╌ 経った時間 と、起きた（☀）・×（取り消し）。
 * 長く寝たまま（止め忘れ）なら今を起きた時刻にせず、寝た時刻を入れた入力欄で起きた時刻を聞く
 */
function SleepingRow({ timer, dateKey }: { timer: SleepTimer; dateKey: string }) {
  const { t } = useTranslation()
  const wakeUp = useTaskStore((s) => s.wakeUp)
  const cancelSleep = useTaskStore((s) => s.cancelSleep)
  const showMoveBanner = useTaskStore((s) => s.showMoveBanner)
  const bedTime = clockOf(toAppWall(timer.startedAt))
  // useNow で毎分描き直す。アプリの壁時計の Date は瞬間の差に使わない
  useNow()
  const elapsedMs = Date.now() - Date.parse(timer.startedAt)
  const elapsedMin = Math.floor(elapsedMs / 60000)

  if (elapsedMs > SLEEP_TIMER_MAX_MS) {
    return (
      <SleepTimesField
        key={timer.startedAt}
        dateKey={dateKey}
        record={sleepEndingOn(useTaskStore.getState().tasks, dateKey)}
        bedTime={bedTime}
        label={<span className="sr-only">{t('sleep.askWake', { time: bedTime })}</span>}
        onSaved={() => cancelSleep()}
        onCancel={() => cancelSleep(true)}
        cancelLabel={t('sleep.cancelTimer')}
      />
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
      <SleepMoonIcon />
      <span className="sr-only">{t('sleep.sleeping', { time: bedTime })}</span>
      <span aria-hidden>{bedTime}</span>
      <SleepBar open />
      {/* 経った時間（寝た直後の「0分」は出さない） */}
      {elapsedMin >= 1 && <span className="text-zinc-400 dark:text-zinc-500">{formatDuration(elapsedMin)}</span>}
      {/* 起きた（☀）と取り消し（×）は寝ている間の操作の組。離して置くと × が「行を閉じる」「記録を消す」に読める */}
      <span className="ml-1 inline-flex items-center">
        <button
          type="button"
          onClick={() => {
            if (wakeUp() === 'short') showMoveBanner({ key: 'sleep.timerShort' })
          }}
          {...tip(t('sleep.wakeUp'), { name: true })}
          className={SLEEP_ICON_BUTTON}
        >
          <SunIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => cancelSleep(true)}
          {...tip(t('sleep.cancelTimer'), { name: true })}
          className="rounded-md p-2 text-zinc-400 hover:bg-zinc-100 md:p-1 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <CloseIcon className="h-3 w-3" strokeWidth={2.5} />
        </button>
      </span>
    </div>
  )
}
