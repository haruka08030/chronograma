import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { makeTask } from '../../store/taskHelpers'
import { INBOX_LIST_ID } from '../../store/storeConstants'
import { appTodayKey } from '../../lib/timeZone'
import { toDateKey, fromDateKey } from '../../lib/dateKey'
import { addDays } from 'date-fns'
import i18n from '../../i18n/config'
import { QuickCreatePopover } from './QuickCreatePopover'

const anchor = { top: 100, left: 100, right: 200, bottom: 140 }
const today = appTodayKey()
const tomorrow = toDateKey(addDays(fromDateKey(today), 1))

function open(estimateMinutes: number) {
  useTaskStore.setState({
    tasks: [{ ...makeTask({ title: 'レポート', listId: INBOX_LIST_ID, dueDate: tomorrow, estimateMinutes }, 0), id: 'r' }],
  })
  const onClose = vi.fn()
  const view = render(
    <QuickCreatePopover
      anchor={anchor}
      dateKey={today}
      startTime="10:40"
      endTime="11:40"
      onTimesChange={() => {}}
      onClose={onClose}
      onCreated={() => {}}
    />,
  )
  return { view, onClose }
}

describe('QuickCreatePopover: 枠に入る To-Do を置く', () => {
  beforeEach(() => localStorage.clear())

  it('60 分の枠に、見積もり 45 分・締切 明日の To-Do を置く 1 行が出て、押すと 45 分の予定になる', () => {
    const { view, onClose } = open(45)
    const row = view.getByRole('button', { name: /レポート.*45m.*due tomorrow/i })
    fireEvent.click(row)
    expect(useTaskStore.getState().tasks.find((x) => x.id === 'r')).toMatchObject({
      scheduledDate: today,
      startTime: '10:40',
      endTime: '11:25',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('見積もりが枠より長ければ何も出さない', () => {
    const { view } = open(90)
    expect(view.queryByRole('button', { name: /レポート/ })).toBeNull()
  })

  it('タイトルを書き始めたら消える', () => {
    const { view } = open(45)
    fireEvent.change(view.getByPlaceholderText(i18n.t('quickCreate.titlePlaceholder')), { target: { value: '新しい' } })
    expect(view.queryByRole('button', { name: /レポート/ })).toBeNull()
  })
})
