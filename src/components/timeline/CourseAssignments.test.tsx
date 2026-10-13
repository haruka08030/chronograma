import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { makeTask } from '../../store/taskHelpers'
import { INBOX_ID } from '../../store/storeConstants'
import type { Task } from '../../types/task'
import { EventPopover } from './EventPopover'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

const anchor = { top: 100, left: 100, right: 200, bottom: 140 }

const assignment = (id: string, course: string, dueDate: string | null, dueTime: string | null = null): Task => ({
  ...makeTask({ title: `レポート ${id}`, listId: INBOX_ID, tags: [course], dueDate, dueTime }, 0),
  id: `canvas-school.instructure.com-assignment-${id}`,
})

const lecture = (title: string): Task => ({
  ...makeTask({ title, listId: INBOX_ID, scheduledDate: '2026-10-07', startTime: '10:40', endTime: '12:10', kind: 'event' }, 0),
  id: 'lecture',
})

const picker = () => screen.getByRole('combobox', { name: /^Course linked/ })

function open(tasks: Task[], onOpenDetail = vi.fn()) {
  useTaskStore.setState({ tasks, courseLinks: [] })
  render(<EventPopover taskId="lecture" anchor={anchor} onClose={() => {}} onOpenDetail={onOpenDetail} />)
  return onOpenDetail
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-07T01:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('授業の予定のカードの課題（#309）', () => {
  const tasks = [
    lecture('CSE-101'),
    assignment('1', 'CSE-101', '2026-10-20'),
    assignment('2', 'CSE-101', '2026-10-09', '23:59'),
    assignment('3', 'CSE-101', '2026-10-12'),
    assignment('4', 'CSE-101', '2026-10-30'),
    assignment('5', 'LIT-80', '2026-10-08'),
  ]

  it('名前が科目と同じ授業は、未完了の課題を締切順に 3 件まで出し、押すと開く', () => {
    const onOpen = open(tasks)
    const section = screen.getByRole('region', { name: 'Assignments for this course' })
    const rows = within(section).getAllByRole('button')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('レポート 2'),
      expect.stringContaining('レポート 3'),
      expect.stringContaining('レポート 1'),
    ])
    expect(within(section).getByText('1 more')).toBeTruthy()
    fireEvent.click(rows[0]!)
    expect(onOpen).toHaveBeenCalledWith('canvas-school.instructure.com-assignment-2')
  })

  it('名前が違う授業は科目を選ぶ欄だけ。選ぶと覚えて課題が出る', () => {
    open([...tasks.slice(1), lecture('プログラミング基礎')])
    expect(screen.queryByRole('region', { name: 'Assignments for this course' })).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'Course linked to “プログラミング基礎”' }), { target: { value: 'LIT-80' } })
    expect(useTaskStore.getState().courseLinks).toEqual([{ title: 'プログラミング基礎', course: 'LIT-80' }])
    const section = screen.getByRole('region', { name: 'Assignments for this course' })
    expect(
      within(section)
        .getAllByRole('button')
        .map((r) => r.textContent),
    ).toEqual([expect.stringContaining('レポート 5')])
  })

  it('「つながない」を選んだ授業には何も出さない', () => {
    open(tasks)
    fireEvent.change(picker(), { target: { value: ' none' } })
    expect(useTaskStore.getState().courseLinks).toEqual([{ title: 'CSE-101', course: '' }])
    expect(screen.queryByRole('combobox', { name: /^Course linked/ })).toBeNull()
  })

  it('課題がみな済んでいれば何も出さない', () => {
    open([lecture('LIT-80'), { ...assignment('5', 'LIT-80', '2026-10-08'), completed: true }, assignment('1', 'CSE-101', null)])
    expect(screen.queryByRole('region', { name: 'Assignments for this course' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: /^Course linked/ })).toBeNull()
  })

  it('LMS の課題が無ければ選ぶ欄も出さない', () => {
    open([lecture('CSE-101')])
    expect(screen.queryByRole('combobox', { name: /^Course linked/ })).toBeNull()
  })
})
