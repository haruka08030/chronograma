import { useMemo, useState } from 'react'
import { formatDuration } from '../lib/timeGrid'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { defaultSleepTimes, sleepEndingOn, sleepMinutes } from '../lib/sleep'
import { TimeInput } from './TimeInput'
import { useNowMinuteTick } from '../hooks/useNowMinuteTick'
import { CloseIcon, MoonSolidIcon } from './icons'
import { buttonClass } from './ui/buttonClass'
import { FIELD_FOCUS_RING } from './ui/fieldClass'
import { isCancelEscape, isSubmitEnter } from '../lib/keyboard'
import { tip } from '../lib/tooltip'
import { toDateKey } from '../lib/dateKey'
import { minutesToTime, timeToMinutes } from '../lib/clockTime'
import { ERROR_TEXT } from './ui/textClass'

/** 今日の睡眠を聞き始める時刻。夜更かし中に「起きた時刻」を聞かない */
const PROMPT_FROM_MIN = 5 * 60

/** 5 分単位に切り捨てた hh:mm */
const floorTo5 = (min: number) => {
  const m = min - (min % 5)
  return minutesToTime(m)
}

const MoonIcon = () => <MoonSolidIcon className="h-3.5 w-3.5 shrink-0 text-sleep" />

/**
 * 今日画面の「睡眠」の 1 行。その日の朝に起きた睡眠を「何時に寝て、何時に起きたか」で入れる。
 * まだ無ければ前回の時刻を入れた入力欄（同じならワンタップで記録）、あれば時刻と長さだけを薄く出す。
 * 今日の分は朝 5 時を過ぎてから「睡眠を記録しますか？」と聞く。
 */
export function SleepRow({ dateKey }: { dateKey: string }) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const logSleep = useTaskStore((s) => s.logSleep)

  const record = useMemo(() => sleepEndingOn(tasks, dateKey), [tasks, dateKey])
  const [editing, setEditing] = useState(false)
  const [bed, setBed] = useState('')
  const [wake, setWake] = useState('')
  const [draftFor, setDraftFor] = useState<string | null>(null)
  const now = useNowMinuteTick()

  const todayKey = toDateKey(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  if (dateKey > todayKey) return null
  const isToday = dateKey === todayKey
  if (isToday && !record && nowMin < PROMPT_FROM_MIN) return null

  const open = !record || editing
  // 入力欄を開いた瞬間の値（記録があればその時刻、無ければ前回の睡眠の時刻）を下書きにする
  const draftKey = `${dateKey}|${record?.id ?? ''}|${open}`
  if (open && draftFor !== draftKey) {
    const init = record?.startTime && record.endTime ? { bed: record.startTime, wake: record.endTime } : defaultSleepTimes(tasks)
    setBed(init.bed)
    // いつもの起床時刻より早く開いたら、今を起きた時刻の候補にする（未来の時刻で叱らない）
    setWake(!record && isToday && timeToMinutes(init.wake) > nowMin ? floorTo5(nowMin) : init.wake)
    setDraftFor(draftKey)
  }

  if (!open && record?.startTime && record.endTime) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        {...tip(t('sleep.edit'))}
        className="-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <MoonIcon />
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

  const inFuture = isToday && Boolean(wake) && timeToMinutes(wake) > nowMin
  const canSave = Boolean(bed && wake && bed !== wake && !inFuture)
  const save = () => {
    if (!canSave) return
    logSleep(dateKey, bed, wake)
    setEditing(false)
  }
  // 行に溶け込む小さな欄なので fieldClass は使わないが、フォーカスは他の入力欄と同じリングで見せる
  const inputClass = `w-[3.75rem] rounded-md bg-zinc-50 px-1.5 py-1 text-xs tabular-nums text-zinc-900 outline-none dark:bg-zinc-800 dark:text-zinc-100 ${FIELD_FOCUS_RING}`

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- 中の入力欄の Enter・Esc をまとめて受ける
    <div
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400"
      onKeyDown={(e) => {
        if (isSubmitEnter(e)) save()
        if (isCancelEscape(e) && record) setEditing(false)
      }}
    >
      <span className="inline-flex items-center gap-1.5">
        <MoonIcon />
        {!record && isToday ? t('sleep.prompt') : t('sleep.title')}
      </span>
      <span className="inline-flex items-center gap-1" role="group">
        <span className="sr-only">{t('sleep.bedAria')}</span>
        <TimeInput value={bed} onChange={setBed} className={inputClass} />
        <span aria-hidden>–</span>
        <span className="sr-only">{t('sleep.wakeAria')}</span>
        <TimeInput value={wake} onChange={setWake} className={inputClass} />
      </span>
      {inFuture ? (
        <span className={ERROR_TEXT}>{t('sleep.noFuture')}</span>
      ) : (
        bed &&
        wake &&
        bed !== wake && <span className="tabular-nums text-zinc-400 dark:text-zinc-500">{formatDuration(sleepMinutes(bed, wake))}</span>
      )}
      <span className="ml-auto inline-flex items-center gap-0.5">
        {record && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            {...tip(t('common.cancel'), { name: true })}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <CloseIcon className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
        <button type="button" onClick={save} disabled={!canSave} className={buttonClass({ variant: 'link', size: 'xs' })}>
          {t('sleep.save')}
        </button>
      </span>
    </div>
  )
}
