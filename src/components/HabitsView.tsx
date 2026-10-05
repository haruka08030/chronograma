import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, startOfWeek } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { useNavShortcut } from '../lib/shortcuts'
import { isHabitActive, type Habit } from '../types/habit'
import { isHabitScheduledOnDate } from '../lib/habitSchedule'
import { buildHabitRecordIndex } from '../lib/habitTiming'
import { appToday } from '../lib/timeZone'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { buttonClass } from './ui/buttonClass'
import { SectionLabel } from './ui/SectionLabel'
import { EmptyState } from './ui/EmptyState'
import { RepeatIcon } from './icons'
import { HabitContextMenu } from './HabitContextMenu'
import { PAGE_TITLE_CLASS } from './ui/headingClass'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { SUBTLE_TEXT } from './ui/textClass'
import { HabitsSummary } from './habits/HabitsSummary'
import { HabitComposer } from './habits/HabitComposer'
import { HabitWeekHeader } from './habits/HabitWeekHeader'
import { HabitCard } from './habits/HabitCard'
import { HabitEditCard } from './habits/HabitEditCard'
import { ArchivedHabits } from './habits/ArchivedHabits'
import { useHabitMenu } from './habits/useHabitMenu'
import { EMPTY_HABIT_FORM, useHabitForm } from './habits/habitFormState'

/**
 * 習慣の画面: 要約（`HabitsSummary`）→ 追加（`HabitComposer`）→ この日の習慣（週の見出し・カード）→ アーカイブ。
 * カードを押すとその場で編集カード（`HabitEditCard`）に入れ替わる
 */
export function HabitsView() {
  const { t } = useTranslation()
  const allHabits = useTaskStore((s) => s.habits)
  // アーカイブした習慣は一覧・要約に入れず、下の「アーカイブ」にだけ出す
  const habits = useMemo(() => allHabits.filter(isHabitActive), [allHabits])
  const archivedHabits = useMemo(() => allHabits.filter((h) => !isHabitActive(h)), [allHabits])
  const tasks = useTaskStore((s) => s.tasks)
  const habitRecords = useMemo(() => buildHabitRecordIndex(tasks), [tasks])
  const selectedCalendarDateKey = useTaskStore((s) => s.selectedCalendarDateKey)
  const setSelectedCalendarDateKey = useTaskStore((s) => s.setSelectedCalendarDateKey)

  // 追加フォームの中身は閉じても残す（閉じたときは名前だけ消す）
  const [newForm, patchNewForm] = useHabitForm(EMPTY_HABIT_FORM)
  const [showComposer, setShowComposer] = useState(false)
  /** 編集中の習慣。`seq` は編集を始め直すたびに増やし、編集カードを開いたときの値から作り直す */
  const [editing, setEditing] = useState<{ habitId: string; seq: number } | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const { habitMenu, closeHabitMenu, menuProps } = useHabitMenu()

  const cancelEdit = useCallback(() => {
    setEditing(null)
  }, [])

  const beginEdit = useCallback((h: Habit) => {
    setEditing((prev) => ({ habitId: h.id, seq: (prev?.seq ?? 0) + 1 }))
  }, [])

  const editingHabitId = editing?.habitId ?? null
  useEffect(() => {
    if (!editingHabitId || habits.some((h) => h.id === editingHabitId)) return
    queueMicrotask(() => {
      cancelEdit()
    })
  }, [habits, editingHabitId, cancelEdit])

  const closeComposer = useCallback(() => {
    patchNewForm({ title: '' })
    setShowComposer(false)
  }, [patchNewForm])

  const focusDate = useMemo(() => fromDateKey(selectedCalendarDateKey), [selectedCalendarDateKey])
  const weekDates = useMemo(() => {
    const start = startOfWeek(focusDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [focusDate])
  const todayKey = toDateKey(appToday())
  const habitWeekdayLabels = useMemo(() => t('habits.weekdays', { returnObjects: true }) as string[], [t])

  const habitsScheduledForFocus = useMemo(() => habits.filter((h) => isHabitScheduledOnDate(h, focusDate)), [habits, focusDate])
  const habitsOffFocus = useMemo(() => habits.filter((h) => !isHabitScheduledOnDate(h, focusDate)), [habits, focusDate])

  const shiftFocusDay = useCallback(
    (delta: number) => {
      setSelectedCalendarDateKey(toDateKey(addDays(focusDate, delta)))
    },
    [focusDate, setSelectedCalendarDateKey],
  )

  const goFocusToday = useCallback(() => {
    setSelectedCalendarDateKey(todayKey)
  }, [setSelectedCalendarDateKey, todayKey])
  useNavShortcut({ today: goFocusToday, prev: () => shiftFocusDay(-1), next: () => shiftFocusDay(1) })

  const renderHabitRow = (h: Habit, offDay: boolean) =>
    editing?.habitId === h.id ? (
      <HabitEditCard key={`${h.id}:${editing.seq}`} habit={h} offDay={offDay} onClose={cancelEdit} />
    ) : (
      <HabitCard
        key={h.id}
        h={h}
        offDay={offDay}
        weekDates={weekDates}
        habitRecords={habitRecords}
        todayKey={todayKey}
        focusKey={selectedCalendarDateKey}
        weekdayLabels={habitWeekdayLabels}
        menuProps={menuProps(h.id)}
        onEdit={() => beginEdit(h)}
      />
    )

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
        {habits.length > 0 && <HabitsSummary habits={habits} habitRecords={habitRecords} />}

        {showComposer ? <HabitComposer form={newForm} onChange={patchNewForm} onClose={closeComposer} /> : null}

        {habits.length > 0 ? (
          <HabitWeekHeader
            focusDate={focusDate}
            focusKey={selectedCalendarDateKey}
            todayKey={todayKey}
            weekDates={weekDates}
            weekdayLabels={habitWeekdayLabels}
            onToday={goFocusToday}
            onShift={shiftFocusDay}
          />
        ) : null}

        <ul className="space-y-3">
          {habits.length === 0 && (
            <li>
              <EmptyState icon={<RepeatIcon strokeWidth={1} />} title={t('habits.empty', { add: t('habits.addHabitCta') })} />
            </li>
          )}
          {habits.length > 0 && habitsScheduledForFocus.length === 0 && habitsOffFocus.length > 0 && (
            <p className={`py-2 ${SUBTLE_TEXT}`}>{t('habits.noneScheduledForDay')}</p>
          )}
          {habitsScheduledForFocus.map((h) => renderHabitRow(h, false))}
          {habitsOffFocus.length > 0 && habitsScheduledForFocus.length > 0 ? (
            <li className="list-none">
              <div className="pt-4 pb-1">
                <SectionLabel as="h3">{t('habits.offDaySectionTitle')}</SectionLabel>
              </div>
            </li>
          ) : null}
          {habitsOffFocus.map((h) => renderHabitRow(h, true))}
        </ul>

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
          onEdit={() => {
            const h = habits.find((x) => x.id === habitMenu.habitId)
            if (h) beginEdit(h)
          }}
        />
      )}
    </div>
  )
}
