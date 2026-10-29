import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { isAnchoredSheet, useAnchoredCard, type AnchorRect } from './anchoredCard'
import { useDismiss } from '../../hooks/useDismiss'
import { useExitGhost } from '../../hooks/useExitGhost'
import { useNow } from '../../hooks/useAppClock'
import { anchoredCardClass } from '../ui/surface'
import { iconButtonClass } from '../ui/iconButtonClass'
import { buttonClass } from '../ui/buttonClass'
import { CloseIcon, TrashIcon } from '../icons'
import { shortcutTip, tip } from '../../lib/tooltip'
import { useDateFormat } from '../../hooks/useDateFormat'
import { META_TEXT, SUBTLE_TEXT } from '../ui/textClass'
import { sleepPlanOn } from '../../lib/sleepSchedule'
import { sleepEndingOn, sleepMinutes } from '../../lib/sleep'
import { logLimitAt } from '../../lib/timelineBlockEdit'
import { formatDuration, timeToMinutes } from '../../lib/timeGrid'
import { shortDate } from '../../lib/moveToast'
import { TimeInput } from '../TimeInput'
import { fieldClass } from '../ui/fieldClass'
import { SleepBar, SleepMoonIcon } from '../SleepTimesField'
import { CardActions } from './CardActions'

const WIDTH = 300

/**
 * タイムラインの睡眠の予定の枠を押したときの小さなカード（#660。予定・習慣の枠のカードと同じ形）。
 * その朝（起きる日）の寝る ━ 起きるをその日だけ直せ、🗑 でその日は予定なし、その日だけ変えた日は「いつもの時間に戻す」。
 * 起きる時刻を過ぎたら ✓ 予定どおり記録（その朝の睡眠があれば取り消し）。枠のドラッグと同じく、曜日の予定は変えない
 */
export function SleepSlotPopover({ wakeDate, anchor, onClose }: { wakeDate: string; anchor: AnchorRect; onClose: () => void }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const schedule = useTaskStore((s) => s.addons.sleepSchedule)
  const days = useTaskStore((s) => s.addons.sleepDays)
  const record = useTaskStore((s) => sleepEndingOn(s.tasks, wakeDate))
  const setSleepPlanDay = useTaskStore((s) => s.setSleepPlanDay)
  const logSleep = useTaskStore((s) => s.logSleep)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const now = useNow()
  const ref = useRef<HTMLDivElement>(null)
  const exitRef = useExitGhost(ref)
  useDismiss({ open: true, onClose, inside: [ref], swallow: isAnchoredSheet })
  useEffect(() => {
    ref.current?.focus()
  }, [])
  const { style, sheet } = useAnchoredCard(ref, anchor, WIDTH)

  const plan = sleepPlanOn(schedule ?? {}, wakeDate, days)
  if (!plan) return null
  const usual = sleepPlanOn(schedule ?? {}, wakeDate)
  const changed = !!days && wakeDate in days
  const date = shortDate(wakeDate)
  const setTimes = (bed: string, wake: string) => {
    if (bed === wake) return
    setSleepPlanDay(wakeDate, { bed, wake }, { key: 'undo.sleepDayTime', params: { date, time: `${bed}–${wake}` } })
  }
  // タイムラインの ✓ と同じ: 起きる時刻を過ぎてから（寝ている間に先の時刻まで睡眠にしない）
  const limit = logLimitAt(now)(wakeDate)
  const woke = limit === null || (limit > 0 && timeToMinutes(plan.wake) <= limit)
  const inputClass = `w-[4.5rem] ${fieldClass({ size: 'sm' })}`

  return (
    <div ref={exitRef} role="dialog" aria-label={t('sleep.title')} tabIndex={-1} className={anchoredCardClass(sheet)} style={style}>
      <div className="flex justify-end gap-0.5 px-2 pt-2">
        <button
          type="button"
          onClick={() => {
            setSleepPlanDay(wakeDate, null, { key: 'undo.sleepDayRemoved', params: { date } })
            onClose()
          }}
          className={iconButtonClass()}
          aria-label={t('sleepSlot.remove')}
          {...tip(t('sleepSlot.remove'))}
        >
          <TrashIcon className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className={iconButtonClass()}
          aria-label={t('common.close')}
          {...shortcutTip(t('common.close'), 'close')}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-[20px_1fr] gap-x-3 gap-y-1 px-5 pb-4">
        <span className="mt-1.5">
          <SleepMoonIcon />
        </span>
        <div className="min-w-0">
          <p className="text-lg leading-snug text-zinc-900 dark:text-zinc-100">{t('sleep.title')}</p>
          <p className={`mt-0.5 ${SUBTLE_TEXT}`}>{t('sleepPage.morningOf', { day: df.monthDayWeekdayLong(wakeDate) })}</p>
          <div role="group" aria-label={t('sleepSlot.times')} className="mt-2 flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
            <span className="sr-only">{t('sleep.bedAria')}</span>
            <TimeInput value={plan.bed} onChange={(v) => v && setTimes(v, plan.wake)} className={inputClass} />
            <SleepBar />
            <span className="sr-only">{t('sleep.wakeAria')}</span>
            <TimeInput
              value={plan.wake}
              onChange={(v) => v && setTimes(plan.bed, v)}
              durationFrom={plan.bed}
              overnight
              className={inputClass}
            />
            <span className="text-zinc-400 dark:text-zinc-500">{formatDuration(sleepMinutes(plan.bed, plan.wake))}</span>
          </div>
          {changed && usual && (
            <button
              type="button"
              onClick={() => setSleepPlanDay(wakeDate, undefined, { key: 'undo.sleepDayUsual', params: { date } })}
              className={buttonClass({ variant: 'link', size: 'xs' }, '-ml-2.5 mt-1')}
            >
              {t('sleepSlot.backToUsual', { time: `${usual.bed}–${usual.wake}` })}
            </button>
          )}
          <CardActions
            complete={
              record || woke
                ? {
                    label: record ? t('weekCalendar.sleepUndo') : t('weekCalendar.sleepAsPlanned'),
                    onClick: () => {
                      if (record) deleteTasks([record.id], { key: 'undo.sleepDeleted', params: { day: df.shortDateWeekday(wakeDate) } })
                      else logSleep(wakeDate, plan.bed, plan.wake)
                      onClose()
                    },
                  }
                : undefined
            }
          />
        </div>
        <span />
        <p className={META_TEXT}>{t('sleepPage.scheduleTitle')}</p>
      </div>
    </div>
  )
}
