import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDuration } from '../lib/timeGrid'
import { useTaskStore } from '../store/taskStore'
import { sleepPlanOn } from '../lib/sleepSchedule'
import { defaultSleepTimes, napsEndingOn, sleepEndingOn, sleepMinutes } from '../lib/sleep'
import type { Task } from '../types/task'
import { TimeInput } from './TimeInput'
import { useNow } from '../hooks/useAppClock'
import { CheckIcon, CloseIcon, MoonSolidIcon, PlusIcon, SunriseIcon, TrashIcon } from './icons'
import { useDateFormat } from '../hooks/useDateFormat'
import { FIELD_FOCUS_RING } from './ui/fieldClass'
import { isCancelEscape, isSubmitEnter } from '../lib/keyboard'
import { tip } from '../lib/tooltip'
import { toDateKey } from '../lib/dateKey'
import { minutesOfDay, minutesToTime, timeToMinutes } from '../lib/clockTime'
import { ERROR_TEXT } from './ui/textClass'
import { chipClass } from './ui/chipClass'

export const SleepMoonIcon = () => <MoonSolidIcon className="h-3.5 w-3.5 shrink-0 text-sleep" />
/** 起きた時刻の印（日の出。☀ は「今日」に使うので使わない）。統計・睡眠のページで ☾ と組にする */
export const SleepWakeIcon = () => <SunriseIcon className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />

/**
 * 寝た時刻と起きた時刻の間に置く、睡眠の色の細い線（「睡眠」「〜」の文字の代わり）。
 * 中抜きの帯にすると空のバーや入力欄に見えるので、塗りの線 1 本にする（#624）。
 * `open` は寝ている途中（続きを点線にして、まだ続いていることを見せる）
 */
export function SleepBar({ open = false }: { open?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center" aria-hidden>
      <span className={`h-0.5 bg-sleep ${open ? 'w-4 rounded-l-full' : 'w-7 rounded-full'}`} />
      {open && <span className="w-3 border-t-2 border-dotted border-sleep/60" />}
    </span>
  )
}

/**
 * 睡眠の行のアイコンだけのボタン（寝る ▶・起きた（日の出）・保存 ✓）。枠でボタンと分かる形にする。
 * 見える丸は 24px で 12px の行になじませ、スマホの押せる範囲だけ 32px にする（丸は ::before で描く）
 */
export const SLEEP_ICON_BUTTON =
  'relative isolate inline-flex h-8 w-8 shrink-0 items-center justify-center text-sleep before:absolute before:inset-1 before:-z-10 before:rounded-full before:border before:border-zinc-200 before:transition-colors hover:before:bg-zinc-100 disabled:opacity-40 disabled:hover:before:bg-transparent md:h-6 md:w-6 md:before:inset-0 dark:before:border-zinc-700 dark:hover:before:bg-zinc-800'

/** 保存（✓）。欄でいちばん押してほしいボタンなので、睡眠の色の薄い塗りとくっきりした縁にする */
const SLEEP_SAVE_BUTTON = `${SLEEP_ICON_BUTTON} before:!border-sleep before:bg-sleep/10 hover:before:!bg-sleep/20 dark:before:bg-sleep/20 dark:hover:before:!bg-sleep/30`

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
  /** 昼寝の欄（#645）。まだ記録の無い欄の下書きを、前回の夜の時刻ではなく今までの 1 時間（過ぎた日は 13:00–14:00）にする */
  nap?: boolean
}

/** 昼寝の下書き: 今日は今（5 分に切り捨て）までの 1 時間、過ぎた日は 13:00–14:00 */
function napDraft(isToday: boolean, nowMin: number) {
  if (!isToday) return { bed: '13:00', wake: '14:00' }
  const wake = nowMin - (nowMin % 5)
  return { bed: minutesToTime((wake - 60 + 24 * 60) % (24 * 60)), wake: minutesToTime(wake) }
}

/**
 * 1 晩の睡眠の「寝た–起きた」の入力欄。今日の計画の睡眠の行（SleepRow）と統計の睡眠の図で共有する。
 * 記録があればその時刻で開く。記録の無い夜は空欄で開き（徹夜した夜などに、寝ていない時刻を出さない #649）、
 * 前回の睡眠の時刻（いつもの時刻を決めていればそれ）は候補を開いたときの最初の位置にだけ使う。
 * 開き直すたびに下書きを作り直したいので、呼ぶ側は `key` を夜と記録ごとに変えて出し入れする。
 * 記録のある夜は 🗑 で消せる（確認なしでゴミ箱へ、「元に戻す」付き。消したら `onSaved`）
 */
export function SleepTimesField({
  dateKey,
  record,
  label,
  onSaved,
  onCancel,
  bedTime,
  cancelLabel,
  icon = true,
  nap = false,
}: SleepTimesFieldProps) {
  const { t } = useTranslation()
  const logSleep = useTaskStore((s) => s.logSleep)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const df = useDateFormat()
  const now = useNow()
  const todayKey = toDateKey(now)
  const nowMin = minutesOfDay(now)
  const isToday = dateKey === todayKey

  const [draft] = useState(() => {
    const init =
      record?.startTime && record.endTime
        ? { bed: record.startTime, wake: record.endTime }
        : nap
          ? napDraft(isToday, nowMin)
          : { bed: '', wake: '' }
    return { bed: bedTime ?? init.bed, wake: init.wake }
  })
  const [bed, setBed] = useState(draft.bed)
  const [wake, setWake] = useState(draft.wake)
  // 空欄の候補を開いたときの最初の位置
  const [usual] = useState(() => {
    const s = useTaskStore.getState()
    return defaultSleepTimes(s.tasks, sleepPlanOn(s.addons.sleepSchedule ?? {}, dateKey))
  })
  const inFuture = isToday && Boolean(wake) && timeToMinutes(wake) > nowMin
  const canSave = Boolean(bed && wake && bed !== wake && !inFuture)
  const save = () => {
    if (!canSave) return
    logSleep(dateKey, bed, wake, record?.id)
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
        <TimeInput value={bed} onChange={setBed} pickerDefault={usual.bed} className={inputClass} />
        <SleepBar />
        <span className="sr-only">{t('sleep.wakeAria')}</span>
        <TimeInput
          value={wake}
          onChange={setWake}
          pickerDefault={usual.wake}
          durationFrom={bed || undefined}
          overnight
          className={inputClass}
        />
      </span>
      {inFuture ? (
        <span className={ERROR_TEXT}>{t('sleep.noFuture')}</span>
      ) : (
        bed &&
        wake &&
        bed !== wake && <span className="tabular-nums text-zinc-400 dark:text-zinc-500">{formatDuration(sleepMinutes(bed, wake))}</span>
      )}
      <span className="ml-auto inline-flex items-center gap-1">
        {record && (
          <button
            type="button"
            onClick={() => {
              deleteTasks([record.id], { key: 'undo.sleepDeleted', params: { day: df.shortDateWeekday(dateKey) } })
              onSaved()
            }}
            {...tip(t('sleep.delete'), { name: true })}
            className="rounded-md p-2 text-zinc-400 hover:bg-zinc-100 md:p-1 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <TrashIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            {...tip(cancelLabel ?? t('common.cancel'), { name: true })}
            className="rounded-md p-2 text-zinc-400 hover:bg-zinc-100 md:p-1 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <CloseIcon className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
        <button type="button" onClick={save} disabled={!canSave} {...tip(t('sleep.save'), { name: true })} className={SLEEP_SAVE_BUTTON}>
          <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </span>
    </div>
  )
}

/** 「＋昼寝 3時間」（#645）。夜の睡眠の長さのすぐ右に、薄い文字で分けて出す。昼寝が無ければ何も出さない */
export function NapPlus({ minutes, className = '' }: { minutes: number; className?: string }) {
  const { t } = useTranslation()
  if (minutes <= 0) return null
  return (
    <span className={`whitespace-nowrap tabular-nums text-zinc-400 dark:text-zinc-500 ${className}`}>
      {t('sleep.napPlus', { time: formatDuration(minutes) })}
    </span>
  )
}

/**
 * 1 日の睡眠を直す欄（#645）。夜の睡眠の欄の下に、その日の昼寝の欄を 1 つずつと「昼寝を追加」。
 * 今日の計画の睡眠の行・睡眠のページの一覧・14 日の図で共有する。どれかを保存・削除したら `onDone`
 */
export function SleepDayEditor({
  dateKey,
  label,
  onDone,
  icon = true,
}: {
  dateKey: string
  label: ReactNode
  onDone: () => void
  /** 夜の睡眠の欄の頭の ☾（見出しに ☾ を入れて渡すなら false） */
  icon?: boolean
}) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const night = useMemo(() => sleepEndingOn(tasks, dateKey), [tasks, dateKey])
  const naps = useMemo(() => napsEndingOn(tasks, dateKey), [tasks, dateKey])
  const [adding, setAdding] = useState(false)
  const napLabel = <span className="w-[3.25rem] text-zinc-400 dark:text-zinc-500">{t('sleep.nap')}</span>
  return (
    <div className="flex flex-col gap-1.5">
      <SleepTimesField
        // 夜・記録が変わるたびに下書きを作り直す
        key={`${dateKey}|${night?.id ?? ''}`}
        dateKey={dateKey}
        record={night}
        label={label}
        icon={icon}
        onSaved={onDone}
        onCancel={onDone}
      />
      {naps.map((n) => (
        <SleepTimesField key={n.id} dateKey={dateKey} record={n} icon={false} nap label={napLabel} onSaved={onDone} />
      ))}
      {/* 夜の睡眠が無い日は、入れた睡眠がその日の睡眠になるので「昼寝を追加」は出さない */}
      {night &&
        (adding ? (
          <SleepTimesField
            key="new-nap"
            dateKey={dateKey}
            record={null}
            icon={false}
            nap
            label={napLabel}
            onSaved={onDone}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={chipClass({ variant: 'add', size: 'md' }, 'self-start')}>
            <PlusIcon className="h-3 w-3" strokeWidth={2.25} />
            {t('sleep.addNap')}
          </button>
        ))}
    </div>
  )
}
