import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addMonths, isSameMonth, startOfMonth } from 'date-fns'
import { useTaskStore } from '../../store/taskStore'
import { isHabitRestOn, isRoutine, type Habit } from '../../types/habit'
import {
  HABIT_RATE_WEEKS,
  habitLongestStreak,
  habitRecentRate,
  habitStreak,
  isHabitCountedOnDate,
  type HabitStreak,
} from '../../lib/habitStats'
import { isHabitDueOnDate } from '../../lib/habitSchedule'
import { habitDayStatus, habitTimesOn, type HabitRecordIndex } from '../../lib/habitTiming'
import { HABIT_DONE_FILL, HABIT_OFF_TIME_FILL } from '../../lib/habitMark'
import { colorVars } from '../../lib/logCategoryColors'
import { TODAY_TEXT } from '../../lib/dayMarker'
import { fromDateKey, toDateKey } from '../../lib/dateKey'
import { useDateFormat } from '../../hooks/useDateFormat'
import { SideSheet } from '../ui/SideSheet'
import { DayNav } from '../ui/DayNav'
import { buttonClass } from '../ui/buttonClass'
import { CARD_TITLE_CLASS } from '../ui/headingClass'
import { ArchiveIcon, CheckIcon, PencilIcon, TrashIcon } from '../icons'
import { HabitFormFields } from './HabitFormFields'
import { HabitTimeEditor } from '../timeline/HabitTimeEditor'
import { canSubmitHabitForm, habitFormFrom, habitFromForm, useHabitFormDraft } from './habitFormState'
import { useHabitGoalText } from './useHabitGoalText'
import { useWeekStartsOn } from '../../hooks/useWeekStartsOn'
import { monthGridDays, weekdayLabelsFrom } from '../../lib/weekStart'
import { ROUTINE_DRIFT_DAYS, averageRoutineDrift, routineDriftDays } from '../../lib/routineDrift'

/**
 * 習慣の詳細（右から出るシート）: 連続・最長・直近 4 週の達成率、月のカレンダー（押すと達成を付ける / 外す）、編集・アーカイブ・削除。
 * ルーティンは連続・達成率・月のカレンダーの代わりに、いつもの時間からのずれ（`RoutineDrift`）。
 * 編集を押すとシートの中身がフォームに入れ替わる
 */
export function HabitDetailSheet({
  habit,
  habitRecords,
  todayKey,
  closing,
  startEditing = false,
  dateKey = null,
  onClose,
}: {
  habit: Habit
  habitRecords: HabitRecordIndex
  todayKey: string
  closing: boolean
  /** 編集から開く（右クリックのメニューの「編集」） */
  startEditing?: boolean
  /** タイムラインで押した日。編集の上に、その日の時間を直す欄を出す（#621） */
  dateKey?: string | null
  onClose: () => void
}) {
  const [editing, setEditing] = useState(startEditing)
  return (
    <SideSheet
      label={habit.title}
      closing={closing}
      onClose={onClose}
      returnFocus={() => document.querySelector<HTMLElement>(`[data-habit-row="${CSS.escape(habit.id)}"] button`)}
    >
      {editing ? (
        <HabitDetailEdit habit={habit} dateKey={dateKey} todayKey={todayKey} onDone={() => setEditing(false)} />
      ) : (
        <HabitDetailView habit={habit} habitRecords={habitRecords} todayKey={todayKey} onEdit={() => setEditing(true)} onClose={onClose} />
      )}
    </SideSheet>
  )
}

function HabitDetailView({
  habit: h,
  habitRecords,
  todayKey,
  onEdit,
  onClose,
}: {
  habit: Habit
  habitRecords: HabitRecordIndex
  todayKey: string
  onEdit: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const archiveHabit = useTaskStore((s) => s.archiveHabit)
  const deleteHabit = useTaskStore((s) => s.deleteHabit)
  const goalText = useHabitGoalText(h)
  const streak = habitStreak(h, habitRecords)
  const longest = habitLongestStreak(h, habitRecords)
  const rate = habitRecentRate(h, habitRecords)
  const streakText = (s: HabitStreak) => t(s.unit === 'week' ? 'habits.streakCountWeek' : 'habits.streakCountDay', { count: s.count })

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start gap-3">
        <span className="gc-dot mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full" style={colorVars(h.color)} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{h.title}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{goalText}</p>
        </div>
      </div>

      {isRoutine(h) ? (
        <RoutineDrift habit={h} habitRecords={habitRecords} todayKey={todayKey} />
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <Stat label={t('habits.statStreak')} value={streakText(streak)} />
            <Stat label={t('habits.statLongest')} value={streakText(longest)} />
            <Stat label={t('habits.statRate', { weeks: HABIT_RATE_WEEKS })} value={rate === null ? '—' : `${rate}%`} />
          </dl>

          <HabitMonth habit={h} habitRecords={habitRecords} todayKey={todayKey} />
        </>
      )}

      <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button type="button" onClick={onEdit} className={buttonClass({ variant: 'secondary', size: 'md' })}>
          <PencilIcon className="h-4 w-4" strokeWidth={1.75} />
          {t('common.edit')}
        </button>
        <button
          type="button"
          onClick={() => {
            archiveHabit(h.id)
            onClose()
          }}
          className={buttonClass({ variant: 'secondary', size: 'md' })}
        >
          <ArchiveIcon className="h-4 w-4" />
          {t('habits.archive')}
        </button>
        {/* 削除は確認なしでゴミ箱へ。「元に戻す」・ゴミ箱から戻せる（右クリックのメニューと同じ） */}
        <button
          type="button"
          onClick={() => {
            deleteHabit(h.id)
            onClose()
          }}
          className={buttonClass({ variant: 'ghost', size: 'md' }, 'ml-auto text-red-600 dark:text-red-400')}
        >
          <TrashIcon className="h-4 w-4" />
          {t('common.delete')}
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
      <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  )
}

/**
 * ルーティンのいつもの時間からのずれ: 直近 4 週の平均と、記録した日ごとの始めた時刻とずれ（新しい日から 7 日分）。
 * 記録が 1 日も無ければ一言だけ
 */
function RoutineDrift({ habit, habitRecords, todayKey }: { habit: Habit; habitRecords: HabitRecordIndex; todayKey: string }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const days = useMemo(() => routineDriftDays(habit, habitRecords, todayKey), [habit, habitRecords, todayKey])
  const average = averageRoutineDrift(days)
  const driftText = (min: number) =>
    min === 0 ? t('habits.driftOnTime') : t(min > 0 ? 'habits.driftLate' : 'habits.driftEarly', { count: Math.abs(min) })
  if (average === null) return <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('habits.driftNone')}</p>
  return (
    <section className="space-y-3">
      <dl className="grid grid-cols-2 gap-2">
        <Stat label={t('habits.driftAverage', { weeks: ROUTINE_DRIFT_DAYS / 7 })} value={driftText(average)} />
        <Stat label={t('habits.driftDays')} value={t('habits.streakCountDay', { count: days.length })} />
      </dl>
      <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
        {days.slice(0, 7).map((d) => (
          <li key={d.dateKey} className="flex items-center justify-between gap-3 py-1.5 tabular-nums">
            <span className="text-zinc-500 dark:text-zinc-400">{df.monthDayWeekday(fromDateKey(d.dateKey))}</span>
            <span className="text-zinc-700 dark:text-zinc-300">
              {d.startTime}
              <span className="ml-3 inline-block min-w-[4.5rem] text-right text-zinc-500 dark:text-zinc-400">{driftText(d.minutes)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 月のカレンダー。やった日は習慣の色の丸、予定の日は濃い数字、予定の無い日・休みの日・作る前・先の日は薄い数字。今日までの日は押すと付け外しできる */
function HabitMonth({ habit: h, habitRecords, todayKey }: { habit: Habit; habitRecords: HabitRecordIndex; todayKey: string }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  // 月のカレンダーなので、並びは設定の週の開始日から（カレンダー・日付ピッカーと同じ）。「週に◯回」の週は月曜はじまりのまま
  const weekStartsOn = useWeekStartsOn()
  const weekdayLabels = weekdayLabelsFrom(t('habits.weekdays', { returnObjects: true }) as string[], weekStartsOn)
  const [month, setMonth] = useState(() => startOfMonth(fromDateKey(todayKey)))
  const atThisMonth = isSameMonth(month, fromDateKey(todayKey))
  const days = useMemo(() => monthGridDays(month, weekStartsOn), [month, weekStartsOn])

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className={CARD_TITLE_CLASS}>{df.yearMonth(month)}</h3>
        <DayNav
          onToday={() => setMonth(startOfMonth(fromDateKey(todayKey)))}
          onPrev={() => setMonth((m) => addMonths(m, -1))}
          onNext={() => setMonth((m) => addMonths(m, 1))}
          prevLabel={t('habits.prevMonthAria')}
          nextLabel={t('habits.nextMonthAria')}
          atToday={atThisMonth}
          nextDisabled={atThisMonth}
        />
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
        {weekdayLabels.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((d) => {
          const key = toDateKey(d)
          if (!isSameMonth(d, month)) return <span key={key} />
          const status = habitDayStatus(h, key, habitRecords)
          const isDone = status === 'done'
          const isOffTime = status === 'offTime'
          const isFuture = key > todayKey
          const isDue = !isFuture && isHabitDueOnDate(h, d, habitRecords) && isHabitCountedOnDate(h, d, habitRecords)
          const label =
            isDone || isOffTime
              ? t('habits.cellDoneAria', { date: df.monthDayWeekday(d) })
              : isHabitRestOn(h, key)
                ? t('habits.restDayAria', { date: df.monthDayWeekday(d) })
                : df.monthDayWeekday(d)
          return (
            <button
              key={key}
              type="button"
              disabled={isFuture}
              onClick={() => toggleHabitDate(h.id, key)}
              aria-label={label}
              aria-pressed={isDone || isOffTime}
              className="group/cell flex h-10 items-center justify-center disabled:cursor-default"
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-full text-sm tabular-nums transition-colors ${
                  isDone
                    ? HABIT_DONE_FILL
                    : isOffTime
                      ? HABIT_OFF_TIME_FILL
                      : `group-enabled/cell:group-hover/cell:bg-zinc-100 dark:group-enabled/cell:group-hover/cell:bg-zinc-800 ${
                          key === todayKey ? TODAY_TEXT : isDue ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-300 dark:text-zinc-600'
                        }`
                }`}
                style={colorVars(h.color)}
              >
                {isOffTime ? <CheckIcon className="h-4 w-4" strokeWidth={2.5} /> : d.getDate()}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/**
 * 編集（シートの中身を入れ替える）。中身は開いたときの習慣の値から始める。
 * シートを閉じる・Esc で戻っても書きかけは残し、次に編集を開いたら続きから（習慣ごと、`useDialogDraft`）。保存・キャンセルで捨てる
 */
function HabitDetailEdit({
  habit,
  dateKey,
  todayKey,
  onDone,
}: {
  habit: Habit
  dateKey: string | null
  todayKey: string
  onDone: () => void
}) {
  const { t } = useTranslation()
  const updateHabit = useTaskStore((s) => s.updateHabit)
  const [form, patch, discardDraft] = useHabitFormDraft(`habit-edit:${habit.id}`, () => habitFormFrom(habit))
  const disabled = !canSubmitHabitForm(form)
  const save = () => {
    if (!canSubmitHabitForm(form)) return
    updateHabit(habit.id, habitFromForm(form))
    discardDraft()
    onDone()
  }
  const cancel = () => {
    discardDraft()
    onDone()
  }
  return (
    <div className="space-y-4 p-6">
      <h2 className={CARD_TITLE_CLASS}>{t('habits.editTitle')}</h2>
      {/* タイムラインから開いたら、その日の時間を直す欄（この日だけ / これ以降の◯曜日。終わった日は変えない） */}
      {dateKey && dateKey >= todayKey && habitTimesOn(habit, dateKey) ? <HabitDayTime habit={habit} dateKey={dateKey} /> : null}
      <HabitFormFields
        form={form}
        onChange={patch}
        name="edit-habit"
        placeholder={t('habits.nameShort')}
        onSubmit={() => {
          if (!disabled) save()
        }}
        onEscape={onDone}
      />
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={save} disabled={disabled} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {t('common.save')}
        </button>
        <button type="button" onClick={cancel} className={buttonClass({ variant: 'secondary', size: 'md' })}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

/** タイムラインで押した日の時間と「時間を変える」。押すとその場で直す欄を開き、保存・キャンセルで閉じる（#621） */
function HabitDayTime({ habit, dateKey }: { habit: Habit; dateKey: string }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const [open, setOpen] = useState(false)
  const times = habitTimesOn(habit, dateKey)
  if (!times) return null
  return (
    <section className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-700">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{t('habits.dayTime', { date: df.monthDayWeekday(dateKey) })}</p>
      {open ? (
        <HabitTimeEditor habit={habit} dateKey={dateKey} onDone={() => setOpen(false)} />
      ) : (
        <div className="mt-1 flex items-center gap-3">
          <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
            {times.endTime ? `${times.startTime} – ${times.endTime}` : times.startTime}
          </span>
          <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: 'link', size: 'xs' })}>
            {t('weekCalendar.habitChangeTime')}
          </button>
        </div>
      )}
    </section>
  )
}
