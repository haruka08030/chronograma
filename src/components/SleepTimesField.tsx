import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDuration } from '../lib/timeGrid'
import { useTaskStore } from '../store/taskStore'
import { defaultSleepTimes, sleepMinutes } from '../lib/sleep'
import type { Task } from '../types/task'
import { TimeInput } from './TimeInput'
import { useNow } from '../hooks/useAppClock'
import { CheckIcon, CloseIcon, MoonSolidIcon } from './icons'
import { FIELD_FOCUS_RING } from './ui/fieldClass'
import { isCancelEscape, isSubmitEnter } from '../lib/keyboard'
import { tip } from '../lib/tooltip'
import { toDateKey } from '../lib/dateKey'
import { minutesOfDay, minutesToTime, timeToMinutes } from '../lib/clockTime'
import { ERROR_TEXT } from './ui/textClass'

/** 5 分単位に切り捨てた hh:mm */
const floorTo5 = (min: number) => {
  const m = min - (min % 5)
  return minutesToTime(m)
}

export const SleepMoonIcon = () => <MoonSolidIcon className="h-3.5 w-3.5 shrink-0 text-sleep" />

/**
 * 寝た時刻と起きた時刻の間に置く、睡眠の色の短い帯（「睡眠」「〜」の文字の代わり）。
 * `open` は寝ている途中（右端を点線にして、まだ続いていることを見せる）
 */
export function SleepBar({ open = false }: { open?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center" aria-hidden>
      <span
        className={`gc-plan h-1.5 w-7 ${open ? 'rounded-l-full border-r-0' : 'rounded-full'}`}
        style={{ '--c': 'var(--color-sleep)' } as CSSProperties}
      />
      {open && <span className="h-1.5 w-4 rounded-r-full border border-l-0 border-dashed border-sleep/60" />}
    </span>
  )
}

/** 睡眠の行のアイコンだけのボタン（寝る ▶・起きた ☀・保存 ✓）。枠でボタンと分かる形にする */
export const SLEEP_ICON_BUTTON =
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-sleep transition-colors hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:bg-zinc-800'

interface SleepTimesFieldProps {
  /** 起きた日（この日の朝に起きた睡眠を入れる・直す） */
  dateKey: string
  /** その夜の記録（無ければ埋める） */
  record: Task | null
  /** 欄の見出し（読み上げだけにするなら sr-only で包んで渡す） */
  label: ReactNode
  /** 見出しの頭に月のアイコンを付けるか（統計の睡眠のカードの中では付けない） */
  icon?: boolean
  /** 保存したあと */
  onSaved: () => void
  /** やめる（×・Esc）。渡さなければ × を出さない */
  onCancel?: () => void
  /** 寝た時刻の下書き（睡眠のタイマーで寝た時刻が分かっているとき）。記録・前回の時刻より先に使う */
  bedTime?: string
  /** やめるの × の名前（既定は「キャンセル」） */
  cancelLabel?: string
}

/**
 * 1 晩の睡眠の「寝た–起きた」の入力欄。今日の計画の睡眠の行（SleepRow）と統計の睡眠の図で共有する。
 * 開いた瞬間の値（記録があればその時刻、無ければ前回の睡眠の時刻）を下書きにする。
 * 開き直すたびに下書きを作り直したいので、呼ぶ側は `key` を夜と記録ごとに変えて出し入れする。
 */
export function SleepTimesField({ dateKey, record, label, onSaved, onCancel, bedTime, cancelLabel, icon = true }: SleepTimesFieldProps) {
  const { t } = useTranslation()
  const logSleep = useTaskStore((s) => s.logSleep)
  const now = useNow()
  const todayKey = toDateKey(now)
  const nowMin = minutesOfDay(now)
  const isToday = dateKey === todayKey

  const [draft] = useState(() => {
    const init =
      record?.startTime && record.endTime
        ? { bed: record.startTime, wake: record.endTime }
        : defaultSleepTimes(useTaskStore.getState().tasks)
    // いつもの起床時刻より早く開いたら、今を起きた時刻の候補にする（未来の時刻で叱らない）
    const wake = !record && isToday && timeToMinutes(init.wake) > nowMin ? floorTo5(nowMin) : init.wake
    return { bed: bedTime ?? init.bed, wake }
  })
  const [bed, setBed] = useState(draft.bed)
  const [wake, setWake] = useState(draft.wake)

  const inFuture = isToday && Boolean(wake) && timeToMinutes(wake) > nowMin
  const canSave = Boolean(bed && wake && bed !== wake && !inFuture)
  const save = () => {
    if (!canSave) return
    logSleep(dateKey, bed, wake)
    onSaved()
  }
  // 行に溶け込む小さな欄なので fieldClass は使わないが、フォーカスは他の入力欄と同じリングで見せる
  const inputClass = `w-[3.75rem] rounded-md bg-zinc-50 px-1.5 py-1 text-xs tabular-nums text-zinc-900 outline-none dark:bg-zinc-800 dark:text-zinc-100 ${FIELD_FOCUS_RING}`

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- 中の入力欄の Enter・Esc をまとめて受ける
    <div
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400"
      onKeyDown={(e) => {
        if (isSubmitEnter(e)) save()
        if (isCancelEscape(e) && onCancel) onCancel()
      }}
    >
      <span className="inline-flex items-center gap-1.5">
        {icon && <SleepMoonIcon />}
        {label}
      </span>
      <span className="inline-flex items-center gap-1.5" role="group">
        <span className="sr-only">{t('sleep.bedAria')}</span>
        <TimeInput value={bed} onChange={setBed} className={inputClass} />
        <SleepBar />
        <span className="sr-only">{t('sleep.wakeAria')}</span>
        <TimeInput value={wake} onChange={setWake} durationFrom={bed || undefined} overnight className={inputClass} />
      </span>
      {inFuture ? (
        <span className={ERROR_TEXT}>{t('sleep.noFuture')}</span>
      ) : (
        bed &&
        wake &&
        bed !== wake && <span className="tabular-nums text-zinc-400 dark:text-zinc-500">{formatDuration(sleepMinutes(bed, wake))}</span>
      )}
      <span className="ml-auto inline-flex items-center gap-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            {...tip(cancelLabel ?? t('common.cancel'), { name: true })}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <CloseIcon className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
        <button type="button" onClick={save} disabled={!canSave} {...tip(t('sleep.save'), { name: true })} className={SLEEP_ICON_BUTTON}>
          <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </span>
    </div>
  )
}
