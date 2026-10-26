import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore, selectLiveHabits } from '../../store/taskStore'
import { anchoredCardStyle, isAnchoredSheet, type AnchorRect } from './anchoredCard'
import { useDismiss } from '../../hooks/useDismiss'
import { useHotkey } from '../../hooks/useHotkey'
import { useExitGhost } from '../../hooks/useExitGhost'
import { useNow } from '../../hooks/useAppClock'
import { anchoredCardClass } from '../ui/surface'
import { iconButtonClass } from '../ui/iconButtonClass'
import { CloseIcon, PencilIcon } from '../icons'
import { tip } from '../../lib/tooltip'
import { useDateFormat } from '../../hooks/useDateFormat'
import { SHORTCUTS } from '../../lib/shortcuts'
import { META_TEXT, SUBTLE_TEXT } from '../ui/textClass'
import { colorVars, logLabelFromTask } from '../../lib/logCategoryColors'
import { buildHabitRecordIndex, habitAsOf, habitDayStatus, habitTimesOn, plannedRecordTimes } from '../../lib/habitTiming'
import { habitSlotId, isPointHabitOn } from '../../lib/habitSlots'
import { logLimitAt, placeHabitSlot } from '../../lib/timelineBlockEdit'
import { timeToMinutes } from '../../lib/timeGrid'
import { isLogTask } from '../../types/task'
import { requestHabitEdit } from '../../lib/habitEditRequest'
import { CardActions } from './CardActions'
import { HabitTimeEditor } from './HabitTimeEditor'
import { buttonClass } from '../ui/buttonClass'
import { useAppTodayKey } from '../../hooks/useAppClock'

const WIDTH = 300

/**
 * タイムラインの習慣の枠を押したときの小さなカード（予定のカードと同じ形）。
 * 始まった枠は ✓（予定どおり達成・取り消し）、終わる前は ▶ 記録を開始、習慣の段のチップは「時間に置く」、今日以降は「時間を変える」でその場で時間を直す（`HabitTimeEditor`）、✎ で開いている画面のまま編集（`HabitEditHost`）。キー: Esc 閉じる / e 編集
 */
export function HabitSlotPopover({
  habitId,
  dateKey,
  anchor,
  onClose,
}: {
  habitId: string
  dateKey: string
  anchor: AnchorRect
  onClose: () => void
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const habit = useTaskStore((s) => selectLiveHabits(s).find((h) => h.id === habitId) ?? null)
  const tasks = useTaskStore((s) => s.tasks)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const now = useNow()
  const todayKey = useAppTodayKey()
  const [editingTime, setEditingTime] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const exitRef = useExitGhost(ref)
  const layer = useDismiss({ open: true, onClose, inside: [ref], swallow: isAnchoredSheet })
  const edit = () => {
    onClose()
    requestHabitEdit(habitId)
  }
  useHotkey(SHORTCUTS.edit.hotkeys, edit, { scope: layer })
  useEffect(() => {
    ref.current?.focus()
  }, [])

  const times = habit ? plannedRecordTimes(habit, dateKey) : null
  // 時間を決めていない習慣は習慣の段のチップ（時刻なし）から開く
  const untimed = !!habit && habitAsOf(habit, dateKey).timeMode === 'none'
  if (!habit || (!times && !untimed)) return null
  const done = habitDayStatus(habit, dateKey, buildHabitRecordIndex(tasks.filter(isLogTask))) !== 'missed'
  // タイムラインの ✓ と同じ: 始まった枠だけ予定どおり達成にできる（今より先の記録は作らない）。▶ は終わるまで。
  // 時間なしは今日と過ぎた日に ✓、▶ は今日だけ
  const limit = logLimitAt(now)(dateKey)
  const started = !times ? limit === null || limit > 0 : limit === null || timeToMinutes(times.startTime) < limit
  // 0:00 終わり・日をまたぐ枠（睡眠の 23:00–7:00 など）は、始まった日のうちには終わらない
  const ended = !times
    ? limit === null
    : limit === null || (timeToMinutes(times.endTime) > timeToMinutes(times.startTime) && timeToMinutes(times.endTime) <= limit)
  const { style, sheet } = anchoredCardStyle(anchor, WIDTH, 170)
  const start = () => {
    const { timeLogTagPresets, logCategoryColors, startTimer } = useTaskStore.getState()
    const label = logLabelFromTask(habit, timeLogTagPresets, logCategoryColors)
    startTimer(habit.title, label.tags, null, label.color)
    onClose()
  }

  return (
    <div ref={exitRef} role="dialog" aria-label={habit.title} tabIndex={-1} className={anchoredCardClass(sheet)} style={style}>
      <div className="flex justify-end gap-0.5 px-2 pt-2">
        <button
          type="button"
          onClick={edit}
          className={iconButtonClass()}
          aria-label={t('eventCard.edit')}
          {...tip(t('eventCard.edit'), 'e')}
        >
          <PencilIcon className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className={iconButtonClass()}
          aria-label={t('common.close')}
          {...tip(t('common.close'), 'Esc')}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-[20px_1fr] gap-x-3 gap-y-1 px-5 pb-4">
        <span className="gc-dot mt-1.5 h-3.5 w-3.5 rounded-full" style={colorVars(habit.color)} aria-hidden />
        <div className="min-w-0">
          <p className="break-words text-lg leading-snug text-zinc-900 dark:text-zinc-100">{habit.title}</p>
          <p className={`mt-0.5 ${SUBTLE_TEXT}`}>
            {df.monthDayWeekdayLong(dateKey)}
            {times && ` · ${isPointHabitOn(habit, dateKey) ? times.startTime : `${times.startTime} – ${times.endTime}`}`}
          </p>
          {/* 時間はその場で直す（終わった日は変えない） */}
          {editingTime ? (
            <HabitTimeEditor habit={habit} dateKey={dateKey} onDone={() => setEditingTime(false)} />
          ) : (
            <>
              {habitTimesOn(habit, dateKey) && dateKey >= todayKey ? (
                <button
                  type="button"
                  onClick={() => setEditingTime(true)}
                  className={buttonClass({ variant: 'link', size: 'xs' }, '-ml-2.5 mt-1')}
                >
                  {t('weekCalendar.habitChangeTime')}
                </button>
              ) : null}
              <CardActions
                complete={
                  done || started
                    ? {
                        label: done
                          ? t('weekCalendar.habitUndo')
                          : untimed
                            ? t('weekCalendar.habitMarkDone')
                            : t('weekCalendar.habitDoneAsPlanned'),
                        onClick: () => {
                          toggleHabitDate(habit.id, dateKey)
                          onClose()
                        },
                      }
                    : undefined
                }
                onStart={done || ended ? undefined : start}
                // 習慣の段のチップ（時刻だけの習慣）は、その日だけ枠にできる（指ではドラッグできないので）
                place={
                  !done && isPointHabitOn(habit, dateKey)
                    ? {
                        label: t('weekCalendar.habitPlace'),
                        onClick: () => {
                          placeHabitSlot(habitSlotId(habit.id, dateKey))
                          onClose()
                        },
                      }
                    : undefined
                }
              />
            </>
          )}
        </div>
        <span />
        <p className={META_TEXT}>{t('habits.title')}</p>
      </div>
    </div>
  )
}
