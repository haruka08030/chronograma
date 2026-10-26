import { schoolOf, type School } from '../lib/schoolTerms'
import type { TaskState } from './storeTypes'

/** 今の学校（#622）。まだ決めていなければ今までの時間割から（`schoolOf`） */
export const schoolOfState = (s: Pick<TaskState, 'addons' | 'timetable'>): School =>
  schoolOf(s.addons.school, s.timetable, s.addons.absenceCourses)
