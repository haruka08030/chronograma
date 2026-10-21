import { useMemo } from 'react'
import { useTaskStore } from '../store/taskStore'
import { absentOnOf } from '../lib/timetable'
import type { AbsentOn } from '../lib/unrecordedGaps'

/** 予定（授業）のその回を欠席にしたか（時間割の欠席の印）。記録の無い時間で、欠席した回の時間を埋めない */
export function useAbsentOn(): AbsentOn {
  const timetable = useTaskStore((s) => s.timetable)
  return useMemo(() => absentOnOf(timetable), [timetable])
}
