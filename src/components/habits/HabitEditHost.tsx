import { useMemo } from 'react'
import { useTaskStore, selectLiveHabits } from '../../store/taskStore'
import { isHabitActive } from '../../types/habit'
import { buildHabitRecordIndex } from '../../lib/habitTiming'
import { closeHabitEdit, useHabitEditTarget } from '../../lib/habitEditRequest'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { usePresence } from '../../hooks/usePresence'
import { HabitDetailSheet } from './HabitDetailSheet'

/** タイムラインの習慣のカード・メニューの「編集」を、開いている画面のまま右の詳細（編集から）で開く */
export function HabitEditHost() {
  const req = useHabitEditTarget()
  const habit = useTaskStore((s) => (req ? (selectLiveHabits(s).find((h) => h.id === req.habitId && isHabitActive(h)) ?? null) : null))
  const tasks = useTaskStore((s) => s.tasks)
  const habitRecords = useMemo(() => buildHabitRecordIndex(tasks), [tasks])
  const todayKey = useAppTodayKey()
  // 消した・アーカイブした習慣は閉じる。閉じたあとも右へ引っ込む動きのあいだは残す
  const value = useMemo(() => (req && habit ? { seq: req.seq, dateKey: req.dateKey, habit } : null), [req, habit])
  const sheet = usePresence(value)
  if (!sheet.shown) return null
  return (
    <HabitDetailSheet
      key={sheet.shown.seq}
      habit={sheet.shown.habit}
      habitRecords={habitRecords}
      todayKey={todayKey}
      closing={sheet.closing}
      startEditing
      dateKey={sheet.shown.dateKey}
      onClose={closeHabitEdit}
    />
  )
}
