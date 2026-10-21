import { describe, expect, it } from 'vitest'
import { courseAttendance, normalizeAbsenceCourses, renamedAbsenceCourse, withAbsenceCourse, withoutAbsenceCourse } from './absenceCourses'
import { attendanceText, attendanceTone } from './timetable'

describe('授業の欠席の一覧（#503）', () => {
  it('空・同じ名前（全角・大文字小文字・空白の違い）を外し、名前は前後の空白を落とす', () => {
    expect(normalizeAbsenceCourses([' 統計学 ', '統計学', 'ＡＢＣ', 'abc', '', 3, null])).toEqual(['統計学', 'ＡＢＣ'])
    expect(normalizeAbsenceCourses('統計学')).toEqual([])
  })

  it('足す・外す・名前を直す（位置は保つ）', () => {
    const list = withAbsenceCourse(withAbsenceCourse([], '統計学'), '英語')
    expect(withAbsenceCourse(list, ' 統計学')).toEqual(['統計学', '英語'])
    expect(renamedAbsenceCourse(list, '統計学', '統計学 I')).toEqual(['統計学 I', '英語'])
    expect(withoutAbsenceCourse(list, '英語')).toEqual(['統計学'])
  })

  it('休める回数を決めていなければ回数だけ、決めていれば残りの色も出す', () => {
    const t = (key: string, o?: Record<string, unknown>) => `${key}:${JSON.stringify(o ?? {})}`
    const unset = courseAttendance({ absences: { 統計学: ['2026-10-01'] }, absenceLimits: {} }, '統計学')
    expect(unset).toEqual({ absent: 1, limit: null, remaining: null })
    expect(attendanceText(unset, t)).toBe('timetable.attendanceCount:{"count":1}')
    expect(attendanceTone(unset)).toBe('future')
    const last = courseAttendance({ absences: { 統計学: ['2026-10-01'] }, absenceLimits: { 統計学: 2 } }, '統計学')
    expect(last).toEqual({ absent: 1, limit: 2, remaining: 1 })
    expect(attendanceTone(last)).toBe('today')
  })
})
