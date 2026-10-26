import { useMemo } from 'react'
import { useTaskStore } from '../store/taskStore'
import { termCourses, type Term, type TermCourse } from '../lib/schoolTerms'
import { lmsCourses } from '../lib/courseLinks'
import { useSchool } from './useSchool'

/** 学期の授業の一覧（時間割・追加した授業・Canvas・Moodle の科目をまとめたもの、#622） */
export function useTermCourses(term: Term | null): TermCourse[] {
  const tasks = useTaskStore((s) => s.tasks)
  const periods = useTaskStore((s) => s.timetable.periods)
  const links = useTaskStore((s) => s.courseLinks)
  const school = useSchool()
  return useMemo(
    () => (term ? termCourses(tasks, periods, school, term, links, lmsCourses(tasks)) : []),
    [tasks, periods, school, term, links],
  )
}
