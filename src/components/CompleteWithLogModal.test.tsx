import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import { categoryHex } from '../lib/logCategoryColors'
import { isLogTask } from '../types/task'
import { RecordPromptHost } from './RecordPromptHost'
import { appTimeZone, instantFromWall } from '../lib/timeZone'
import { calendarDayKey } from '../lib/dayPlan'

/** 通知の「記録する」は記録パネルの「後から記録」と同じフォーム（#392） */
beforeEach(() => {
  useTaskStore.setState({ timeLogTagPresets: ['授業', 'バイト'], tasks: [], recordPromptTaskId: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('記録する（CompleteWithLogModal）', () => {
  it('時刻 1 行・日をまたぐときだけ「翌日まで」・ラベルのチップ（初期値は To-Do のラベル）で記録して完了にする', async () => {
    const hex = categoryHex('授業', useTaskStore.getState().logCategoryColors)
    const todo = {
      ...makeTask({ title: '夜の課題', listId: INBOX_LIST_ID, scheduledDate: '2026-10-01', startTime: '23:00', endTime: '01:00' }, 0),
      id: 'late',
      color: hex,
    }
    useTaskStore.setState({ tasks: [todo] })
    useTaskStore.getState().openRecordPrompt('late')
    render(<RecordPromptHost />)

    expect(await screen.findByRole('button', { name: 'Color and label' })).toHaveTextContent('授業')
    expect(screen.getByText('until next day')).toBeInTheDocument()
    // 日付の欄は出さない
    expect(screen.queryByRole('button', { name: /Start date|End date/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Color and label' }))
    fireEvent.click(screen.getByRole('radio', { name: /^バイト \(/ }))
    fireEvent.change(screen.getByRole('textbox', { name: /What did you do/ }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log and complete' }))

    const log = useTaskStore.getState().tasks.find(isLogTask)
    expect(log).toMatchObject({
      title: 'バイト',
      category: 'バイト',
      color: null,
      dueDate: '2026-10-01',
      endDate: '2026-10-02',
      startTime: '23:00',
      endTime: '01:00',
    })
    expect(useTaskStore.getState().tasks.find((x) => x.id === 'late')?.completed).toBe(true)
  })

  it('完了の時刻は記録の終わり（過ぎた日の予定は予定の日に残る）。終わりが先なら今', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = instantFromWall('2026-10-08', '15:30', appTimeZone())
    vi.setSystemTime(now)
    const plan = (id: string, date: string) => ({
      ...makeTask({ title: id, listId: INBOX_LIST_ID, scheduledDate: date, startTime: '15:00', endTime: '16:30' }, 0),
      id,
    })
    useTaskStore.setState({ tasks: [plan('yesterday', '2026-10-07'), plan('now', '2026-10-08')] })
    const view = render(<RecordPromptHost />)
    for (const id of ['yesterday', 'now']) {
      useTaskStore.getState().openRecordPrompt(id)
      view.rerender(<RecordPromptHost />)
      fireEvent.click(await screen.findByRole('button', { name: 'Log and complete' }))
    }
    const task = (id: string) => useTaskStore.getState().tasks.find((x) => x.id === id)!
    expect(task('yesterday').completedAt).toBe(new Date(instantFromWall('2026-10-07', '16:30', appTimeZone())).toISOString())
    expect(calendarDayKey(task('yesterday'))).toBe('2026-10-07')
    expect(task('now').completedAt).toBe(new Date(now).toISOString())
  })
})
