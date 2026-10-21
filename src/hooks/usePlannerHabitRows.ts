import { useMemo } from 'react'
import { useTaskStore } from '../store/taskStore'
import type { Habit } from '../types/habit'
import { buildHabitRecordIndex, habitDayStatus, habitTimesOn } from '../lib/habitTiming'
import { isHabitWeekGoalMetOnDate } from '../lib/habitSchedule'
import { fromDateKey } from '../lib/dateKey'

export type HabitDayRow = {
  h: Habit
  status: ReturnType<typeof habitDayStatus>
  /** 週に◯回で、その週の回数をほかの日で満たした */
  weekMet: boolean
  /** その日の時間（時刻ひとつは開始だけ）。時間なしは null */
  time: string | null
}

/**
 * その日の習慣の行を、まだのもの（`open`）と済んだもの（`done`）に分ける。
 * 並びは時刻のある習慣を時刻順、その後に時間なし（習慣の順）。達成した習慣と、週に◯回をほかの日で満たした習慣は `done`
 * （今日の計画では一番下の「完了 N 件」に、終えた To-Do の後ろでまとめる）
 */
export function usePlannerHabitRows(dayHabits: Habit[], dateKey: string) {
  const tasks = useTaskStore((s) => s.tasks)
  const habitRecords = useMemo(() => buildHabitRecordIndex(tasks), [tasks])
  const { open, done } = useMemo(() => {
    const date = fromDateKey(dateKey)
    const rows: HabitDayRow[] = dayHabits.map((h) => {
      const times = habitTimesOn(h, dateKey)
      return {
        h,
        status: habitDayStatus(h, dateKey, habitRecords),
        weekMet: isHabitWeekGoalMetOnDate(h, date, habitRecords),
        time: times ? (times.endTime ? `${times.startTime}–${times.endTime}` : times.startTime) : null,
      }
    })
    const timed = rows.filter((r) => r.time !== null).sort((a, b) => a.time!.localeCompare(b.time!))
    const sorted = [...timed, ...rows.filter((r) => r.time === null)]
    const isDone = (r: HabitDayRow) => r.status !== 'missed' || r.weekMet
    return { open: sorted.filter((r) => !isDone(r)), done: sorted.filter(isDone) }
  }, [dayHabits, dateKey, habitRecords])
  return { open, done, habitRecords }
}
