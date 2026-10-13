import { describe, expect, it } from 'vitest'
import { makeTask } from '../store/taskHelpers'
import { INBOX_ID } from '../store/storeConstants'
import type { Task } from '../types/task'
import {
  COURSE_LINK_MAX,
  courseAssignments,
  courseKey,
  eventCourse,
  lmsCourses,
  normalizeCourseLinks,
  planCourseLinkSync,
  withCourseLink,
} from './courseLinks'

const assignment = (id: string, course: string, patch: Partial<Task> = {}): Task => ({
  ...makeTask({ title: `課題 ${id}`, listId: INBOX_ID, tags: [course] }, 0),
  id: `canvas-school.instructure.com-assignment-${id}`,
  ...patch,
})

describe('courseKey', () => {
  it('全角半角・大文字小文字・空白の違いだけを同じに数える', () => {
    expect(courseKey('  ＣＳＥ－１０１  ')).toBe(courseKey('cse-101'))
    expect(courseKey('英語  Ⅱ')).toBe(courseKey('英語 II'))
    expect(courseKey('英語')).not.toBe(courseKey('英語 II'))
  })
})

describe('eventCourse', () => {
  const courses = ['CSE-101', '経済学入門', 'LIT-80']

  it('名前が科目のタグと同じならつながる（部分一致ではつながない）', () => {
    expect(eventCourse({ title: '経済学入門' }, [], courses)).toEqual({ course: '経済学入門', chosen: false })
    expect(eventCourse({ title: 'cse-101' }, [], courses)).toEqual({ course: 'CSE-101', chosen: false })
    expect(eventCourse({ title: '経済学入門 2限' }, [], courses)).toEqual({ course: null, chosen: false })
    expect(eventCourse({ title: 'CSE' }, [], courses)).toEqual({ course: null, chosen: false })
  })

  it('予定のラベル名が科目と同じでもつながる', () => {
    expect(eventCourse({ title: 'プログラミング', labelName: 'CSE-101' }, [], courses)).toEqual({ course: 'CSE-101', chosen: false })
  })

  it('選んだつながりが名前の一致より先（「つながない」も覚える）', () => {
    const links = withCourseLink(withCourseLink([], 'プログラミング基礎', 'CSE-101'), 'LIT-80', '')
    expect(eventCourse({ title: 'プログラミング基礎' }, links, courses)).toEqual({ course: 'CSE-101', chosen: true })
    expect(eventCourse({ title: 'LIT-80' }, links, courses)).toEqual({ course: null, chosen: true })
  })
})

describe('withCourseLink / normalizeCourseLinks', () => {
  it('同じ名前のつながりは置き換え、新しいものが先頭', () => {
    let links = withCourseLink([], 'プログラミング基礎', 'CSE-101')
    links = withCourseLink(links, '英語', 'ENG-1')
    links = withCourseLink(links, ' プログラミング基礎 ', 'CSE-102')
    expect(links).toEqual([
      { title: 'プログラミング基礎', course: 'CSE-102' },
      { title: '英語', course: 'ENG-1' },
    ])
  })

  it('壊れた行・空の名前・重なる名前は外し、数は上限まで', () => {
    const raw = [
      { title: 'A', course: 'x' },
      { title: 'a', course: 'y' },
      { title: '  ', course: 'z' },
      { title: 'B' },
      null,
      ...Array.from({ length: COURSE_LINK_MAX + 5 }, (_, i) => ({ title: `T${i}`, course: '' })),
    ]
    const out = normalizeCourseLinks(raw)
    expect(out[0]).toEqual({ title: 'A', course: 'x' })
    expect(out.some((l) => l.course === 'y' || l.course === 'z')).toBe(false)
    expect(out).toHaveLength(COURSE_LINK_MAX)
    expect(normalizeCourseLinks('nope')).toEqual([])
  })
})

describe('lmsCourses / courseAssignments', () => {
  const tasks: Task[] = [
    assignment('3', 'CSE-101', { dueDate: '2026-10-12', dueTime: '09:00' }),
    assignment('1', 'CSE-101', { dueDate: '2026-10-10', dueTime: null }),
    assignment('2', 'CSE-101', { dueDate: '2026-10-10', dueTime: '23:59' }),
    assignment('4', 'CSE-101', { dueDate: null }),
    assignment('5', 'CSE-101', { dueDate: '2026-10-01', completed: true }),
    assignment('6', 'CSE-101', { dueDate: '2026-10-01', deletedAt: '2026-10-02T00:00:00Z' }),
    assignment('7', 'LIT-80', { dueDate: '2026-10-09' }),
    // 自分で作った To-Do は同じタグでも課題に数えない
    { ...makeTask({ title: '自分のメモ', listId: INBOX_ID, tags: ['CSE-101'], dueDate: '2026-10-05' }, 0), id: 'mine' },
  ]

  it('科目は取り込んだ課題の最初のタグ', () => {
    expect(lmsCourses(tasks)).toEqual(['CSE-101', 'LIT-80'])
  })

  it('未完了の課題を締切順に（時刻なしはその日の終わり、締切なしは最後）', () => {
    expect(courseAssignments(tasks, 'cse-101').map((t) => t.id.split('-').pop())).toEqual(['2', '1', '3', '4'])
  })
})

describe('planCourseLinkSync', () => {
  const a = { title: '英語', course: 'ENG-1' }
  const b = { title: 'バイト', course: '' }

  it('サーバーに行が無ければ送る', () => {
    expect(planCourseLinkSync({ links: [a], updatedAt: '2026-10-01T00:00:00Z' }, null)).toEqual({
      push: { links: [a], updatedAt: '2026-10-01T00:00:00Z', base: null },
    })
  })

  it('初めて合わせる端末は両方を残す（同じ名前はサーバーの値）', () => {
    const plan = planCourseLinkSync(
      { links: [{ title: '英語', course: 'ENG-2' }, b], updatedAt: '2026-10-01T00:00:00Z', syncedAt: null },
      { links: [a], updatedAt: '2026-10-02T00:00:00Z' },
      '2026-10-03T00:00:00Z',
    )
    expect(plan.apply?.links).toEqual([a, b])
    expect(plan.push).toEqual({ links: [a, b], updatedAt: '2026-10-03T00:00:00Z', base: '2026-10-02T00:00:00Z' })
  })

  it('手元を変えていなければサーバーに合わせる', () => {
    const plan = planCourseLinkSync(
      { links: [a], updatedAt: '2026-10-01T00:00:00Z', syncedAt: '2026-10-01T00:00:00Z' },
      { links: [b], updatedAt: '2026-10-02T00:00:00Z' },
    )
    expect(plan).toEqual({ apply: { links: [b], updatedAt: '2026-10-02T00:00:00Z' } })
  })
})
