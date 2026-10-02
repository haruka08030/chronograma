import { describe, expect, it } from 'vitest'
import { parseCanvasFeed } from './ical.ts'

const BASE = 'https://canvas.ucsc.edu'

// Canvas の書き出しに近い形（CRLF・75 文字での折り返し・エスケープ）
const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'METHOD:PUBLISH',
  'BEGIN:VEVENT',
  'DTSTART;TZID=UTC:20261006T065900',
  'DTEND;TZID=UTC:20261006T065900',
  'SUMMARY:Lab 2: Linked Lists\\, Stacks [CSE-101-01]',
  'UID:event-assignment-501',
  'URL;VALUE=URI:https://canvas.ucsc.edu/calendar?include_contexts=course_77&mon',
  ' th=10&year=2026#assignment_501',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261010',
  'SUMMARY:Reading response [LIT-80]',
  'UID:event-assignment-502',
  'URL:https://canvas.ucsc.edu/calendar?include_contexts=course_88&month=10#assignment_502',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261012T170000Z',
  'SUMMARY:Midterm (Section B) [CSE-101-01]',
  'UID:event-assignment-override-9001',
  'URL:https://canvas.ucsc.edu/calendar?include_contexts=course_77#assignment_503',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261007T180000Z',
  'DTEND:20261007T193000Z',
  'SUMMARY:Lecture [CSE-101-01]',
  'UID:event-calendar-event-42',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20260901T065900Z',
  'SUMMARY:Old homework [CSE-101-01]',
  'UID:event-assignment-400',
  'URL:https://canvas.ucsc.edu/calendar?include_contexts=course_77#assignment_400',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('parseCanvasFeed', () => {
  const items = parseCanvasFeed(FEED, BASE, '2026-10-01', '2027-01-30')

  it('reads assignments only, inside the window', () => {
    expect(items.map((i) => i.id)).toEqual(['501', '502', '503'])
  })

  it('splits the course code off the title and links to the assignment', () => {
    expect(items[0]).toMatchObject({
      type: 'assignment',
      title: 'Lab 2: Linked Lists, Stacks',
      courseId: '77',
      courseName: 'CSE-101-01',
      url: 'https://canvas.ucsc.edu/courses/77/assignments/501',
      dueAt: '2026-10-06T06:59:00Z',
      done: false,
    })
  })

  it('keeps all-day deadlines as a date', () => {
    expect(items[1]).toMatchObject({ dueAt: null, dueDate: '2026-10-10', courseId: '88' })
  })

  it('uses the assignment id from the URL for per-student overrides', () => {
    expect(items[2]).toMatchObject({ id: '503', title: 'Midterm (Section B)', dueAt: '2026-10-12T17:00:00Z' })
  })
})
