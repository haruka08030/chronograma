import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { makeTask } from '../../store/taskHelpers'
import { INBOX_LIST_ID } from '../../store/storeConstants'
import { appTodayKey } from '../../lib/timeZone'
import type { Task } from '../../types/task'
import { CategoryManager } from './CategoryManager'

let order = 0
function log(id: string, startTime: string, endTime: string, over: Partial<Task> = {}): Task {
  return {
    ...makeTask({ title: id, listId: INBOX_LIST_ID }, order++),
    id,
    kind: 'log',
    dueDate: appTodayKey(),
    startTime,
    endTime,
    completed: true,
    ...over,
  }
}

beforeEach(() => {
  useTaskStore.setState({ timeLogTagPresets: ['勉強'], tasks: [] })
})

describe('設定のラベル: 直近 30 日でラベルなし（#390）', () => {
  it('ラベル名も色も無い記録の時間（睡眠は除く）。押すと行で並べ、色の一覧で付けられる', () => {
    useTaskStore.setState({
      tasks: [
        log('読書', '09:00', '10:00'),
        log('色だけ', '10:00', '11:00', { color: '#ff0000' }),
        log('睡眠', '00:00', '06:00', { kind: 'sleep' }),
        log('英語', '13:00', '14:00', { category: '勉強', tags: ['勉強'] }),
      ],
    })
    render(<CategoryManager />)
    const toggle = screen.getByRole('button', { name: /Without a label in the last 30 days: 1h/ })
    act(() => toggle.click())
    const list = document.querySelector('[data-untagged-logs]') as HTMLElement
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    act(() => within(list).getByRole('button', { name: 'Color and label' }).click())
    act(() =>
      within(list)
        .getByRole('radio', { name: /^勉強（/ })
        .click(),
    )
    expect(useTaskStore.getState().tasks.find((x) => x.id === '読書')).toMatchObject({ category: '勉強' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  })
})
