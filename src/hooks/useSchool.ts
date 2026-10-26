import { useMemo } from 'react'
import { useTaskStore } from '../store/taskStore'
import { schoolOf, type School } from '../lib/schoolTerms'

/** 学校の学期と授業（#622）。まだ決めていなければ今までの時間割から */
export function useSchool(): School {
  const saved = useTaskStore((s) => s.addons.school)
  const timetable = useTaskStore((s) => s.timetable)
  const absenceCourses = useTaskStore((s) => s.addons.absenceCourses)
  return useMemo(() => schoolOf(saved, timetable, absenceCourses), [saved, timetable, absenceCourses])
}
