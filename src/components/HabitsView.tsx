import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { useNavShortcut } from '../lib/shortcuts'
import { isHabitActive } from '../types/habit'
import { habitWeekDates } from '../lib/habitSchedule'
import { buildHabitRecordIndex } from '../lib/habitTiming'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { buttonClass } from './ui/buttonClass'
import { EmptyState } from './ui/EmptyState'
import { DayNav } from './ui/DayNav'
import { RepeatIcon } from './icons'
import { HabitContextMenu } from './HabitContextMenu'
import { PAGE_TITLE_CLASS } from './ui/headingClass'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { HabitComposer } from './habits/HabitComposer'
import { HabitWeekTable } from './habits/HabitWeekTable'
import { HabitDetailSheet } from './habits/HabitDetailSheet'
import { ArchivedHabits } from './habits/ArchivedHabits'
import { useHabitMenu } from './habits/useHabitMenu'
import { EMPTY_HABIT_FORM, useHabitForm } from './habits/habitFormState'
import { useAppTodayKey } from '../hooks/useAppClock'
import { useDateFormat } from '../hooks/useDateFormat'
import { usePresence } from '../hooks/usePresence'

/**
 * 習慣の画面: 追加（`HabitComposer`）→ 見ている週の表（`HabitWeekTable`）→ アーカイブ。
 * 表の名前を押すと右から詳細（`HabitDetailSheet`: 連続・達成率・月のカレンダー・編集）
 */
export function HabitsView() {
  const { t } = useTranslation()
  const df = useDateFormat()
  const allHabits = useTaskStore((s) => s.habits)
  // アーカイブした習慣は表に入れず、下の「アーカイブ」にだけ出す
  const habits = useMemo(() => allHabits.filter(isHabitActive), [allHabits])
  const archivedHabits = useMemo(() => allHabits.filter((h) => !isHabitActive(h)), [allHabits])
  const tasks = useTaskStore((s) => s.tasks)
  const habitRecords = useMemo(() => buildHabitRecordIndex(tasks), [tasks])
  const selectedCalendarDateKey = useTaskStore((s) => s.selectedCalendarDateKey)
  const setSelectedCalendarDateKey = useTaskStore((s) => s.setSelectedCalendarDateKey)
  const todayKey = useAppTodayKey()

  // 追加フォームの中身は閉じても残す（閉じたときは名前だけ消す）
  const [newForm, patchNewForm] = useHabitForm(EMPTY_HABIT_FORM)
  const [showComposer, setShowComposer] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const { habitMenu, closeHabitMenu, menuProps } = useHabitMenu()

  /** 詳細を開いている習慣。`edit` は編集から開く。`seq` は開き直すたびに増やし、中身を作り直す */
  const [detail, setDetail] = useState<{ habitId: string; edit: boolean; seq: number } | null>(null)
  const openDetail = useCallback((habitId: string, edit = false) => {
    setDetail((prev) => ({ habitId, edit, seq: (prev?.seq ?? 0) + 1 }))
  }, [])
  const closeDetail = useCallback(() => setDetail(null), [])
  // 消した・アーカイブした習慣の詳細は閉じる。閉じたあとも右へ引っ込む動きのあいだは残す
  const detailHabit = detail ? (habits.find((h) => h.id === detail.habitId) ?? null) : null
  const sheetValue = useMemo(() => (detail && detailHabit ? { ...detail, habit: detailHabit } : null), [detail, detailHabit])
  const sheet = usePresence(sheetValue)

  const closeComposer = useCallback(() => {
    patchNewForm({ title: '' })
    setShowComposer(false)
  }, [patchNewForm])

  const focusDate = useMemo(() => fromDateKey(selectedCalendarDateKey), [selectedCalendarDateKey])
  const weekDates = useMemo(() => habitWeekDates(focusDate), [focusDate])
  const atThisWeek = weekDates.some((d) => toDateKey(d) === todayKey)

  const shiftWeek = useCallback(
    (delta: number) => {
      setSelectedCalendarDateKey(toDateKey(addDays(focusDate, delta * 7)))
    },
    [focusDate, setSelectedCalendarDateKey],
  )
  const goToday = useCallback(() => {
    setSelectedCalendarDateKey(todayKey)
  }, [setSelectedCalendarDateKey, todayKey])
  useNavShortcut({ today: goToday, prev: () => shiftWeek(-1), next: () => shiftWeek(1) })

  return (
    <div className={PAGE_SCROLL_CLASS}>
      <div className="px-4 pt-4 pb-3 md:px-6 md:pt-8 md:pb-4">
        <div className="flex items-end justify-between gap-3">
          <h1 className={PAGE_TITLE_CLASS}>{t('habits.title')}</h1>
          <button
            type="button"
            onClick={() => {
              if (showComposer) closeComposer()
              else setShowComposer(true)
            }}
            className={showComposer ? buttonClass({ variant: 'secondary', size: 'sm' }) : buttonClass({ variant: 'primary', size: 'sm' })}
          >
            {showComposer ? t('common.close') : t('habits.addHabitCta')}
          </button>
        </div>
      </div>

      <div className="space-y-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-8">
        {showComposer ? <HabitComposer form={newForm} onChange={patchNewForm} onClose={closeComposer} /> : null}

        {habits.length === 0 ? (
          <EmptyState icon={<RepeatIcon strokeWidth={1} />} title={t('habits.empty', { add: t('habits.addHabitCta') })} />
        ) : (
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{df.weekRange(focusDate)}</h2>
              <DayNav
                onToday={goToday}
                onPrev={() => shiftWeek(-1)}
                onNext={() => shiftWeek(1)}
                prevLabel={t('habits.prevWeekAria')}
                nextLabel={t('habits.nextWeekAria')}
                atToday={atThisWeek}
                shortcuts
              />
            </div>
            <HabitWeekTable
              habits={habits}
              weekDates={weekDates}
              todayKey={todayKey}
              habitRecords={habitRecords}
              menuProps={menuProps}
              onOpen={(h) => openDetail(h.id)}
            />
          </section>
        )}

        {archivedHabits.length > 0 && (
          <ArchivedHabits habits={archivedHabits} open={showArchived} onToggle={() => setShowArchived((v) => !v)} menuProps={menuProps} />
        )}
      </div>
      {habitMenu && (
        <HabitContextMenu
          x={habitMenu.x}
          y={habitMenu.y}
          habitId={habitMenu.habitId}
          onClose={closeHabitMenu}
          onEdit={() => openDetail(habitMenu.habitId, true)}
        />
      )}
      {sheet.shown && (
        <HabitDetailSheet
          key={sheet.shown.seq}
          habit={sheet.shown.habit}
          habitRecords={habitRecords}
          todayKey={todayKey}
          closing={sheet.closing}
          startEditing={sheet.shown.edit}
          onClose={closeDetail}
        />
      )}
    </div>
  )
}
