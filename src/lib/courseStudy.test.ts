import { describe, expect, it } from 'vitest'
import { makeTask } from '../store/taskHelpers'
import { INBOX_ID } from '../store/storeConstants'
import type { Task } from '../types/task'
import { emptyTerm } from './schoolTerms'
import { courseStudyTime, titleIsCourse } from './courseStudy'

const term = emptyTerm('t1', { termStart: '2026-10-01', termEnd: '2027-01-31' })
const course = { title: '統計学', lms: 'STAT-101' }

const log = (id: string, title: string, date: string, start: string, end: string, extra: Partial<Task> = {}): Task => ({
  ...makeTask({ title, listId: INBOX_ID, dueDate: date, startTime: start, endTime: end, kind: 'log' }, 0),
  id,
  ...extra,
})
const assignment: Task = { ...makeTask({ title: '第 5 回 レポート', listId: INBOX_ID, tags: ['STAT-101'] }, 0), id: 'a1' }
const lecture: Task = {
  ...makeTask({ title: '統計学', listId: INBOX_ID, scheduledDate: '2026-10-06', startTime: '09:00', endTime: '10:30', kind: 'event' }, 0),
  id: 'e1',
}

describe('授業ごとの勉強時間（#672）', () => {
  it('課題から ▶ で始めた記録・授業の予定の記録・授業名で始まる記録に分けて、学期の間だけ数える', () => {
    const tasks = [
      assignment,
      lecture,
      log('l1', 'レポートを書く', '2026-10-07', '20:00', '21:30', { sourceTaskId: 'a1' }),
      log('l2', '統計学', '2026-10-06', '09:00', '10:30'),
      log('l3', '統計学 復習', '2026-10-08', '18:00', '18:45'),
      // 部分一致はしない・学期の前は数えない・なんとなく・削除は入れない
      log('x1', '統計学演習', '2026-10-08', '19:00', '20:00'),
      log('x2', '統計学', '2026-09-20', '10:00', '11:00'),
      log('x3', '統計学', '2026-10-09', '10:00', '11:00', { vague: true }),
      log('x4', '統計学', '2026-10-09', '12:00', '13:00', { deletedAt: '2026-10-10T00:00:00Z' }),
    ]
    const s = courseStudyTime(tasks, term, course, '2026-10-14')
    expect(s.byKind).toEqual({ assignment: 90, class: 90, self: 45 })
    expect(s.total).toBe(225)
    // 9/28 の週から今週（10/12 の週）まで
    expect(s.weeks).toEqual([
      { start: '2026-09-28', minutes: 0 },
      { start: '2026-10-05', minutes: 225 },
      { start: '2026-10-12', minutes: 0 },
    ])
  })

  it('予定と重ならない同じ名前の記録は自習。科目につながっていなければ課題に数えない', () => {
    const tasks = [
      assignment,
      log('l1', '統計学', '2026-10-10', '14:00', '15:00'),
      log('l2', 'レポート', '2026-10-10', '16:00', '17:00', { sourceTaskId: 'a1' }),
    ]
    expect(courseStudyTime(tasks, term, { title: '統計学', lms: null }, '2026-10-14').byKind).toEqual({ assignment: 0, class: 0, self: 60 })
  })

  it('授業名と同じか、授業名＋空白で始まる題名だけ（全角半角・大文字小文字は同じに数える）', () => {
    expect(titleIsCourse('統計学', '統計学')).toBe(true)
    expect(titleIsCourse('統計学　予習', '統計学')).toBe(true)
    expect(titleIsCourse('ＥＣＯＮ review', 'econ')).toBe(true)
    expect(titleIsCourse('統計学演習', '統計学')).toBe(false)
    expect(titleIsCourse('数理統計学', '統計学')).toBe(false)
  })
})
