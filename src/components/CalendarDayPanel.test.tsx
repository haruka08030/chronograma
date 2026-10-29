import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import { useOverlays } from '../lib/overlays'
import { CalendarDayPanel } from './CalendarDayPanel'
import { appTodayKey } from '../lib/timeZone'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { addDays } from 'date-fns'

// 今日より先の日（過ぎた日は記録から開く）。test:tz の FAKE_NOW が効いた後の今日から数えるので beforeEach で決める
const day = (n: number) => toDateKey(addDays(fromDateKey(appTodayKey()), n))
let DAY = ''

describe('CalendarDayPanel: ほかの表示と同じく押すとカード・種類ごとのメニュー（#641）', () => {
  beforeEach(() => {
    DAY = day(5)
    useOverlays.setState({ detailTaskId: null, menu: null })
    useTaskStore.setState({
      tasks: [
        { ...makeTask({ title: 'レポート', listId: INBOX_LIST_ID, scheduledDate: DAY }, 0), id: 'r1' },
        {
          ...makeTask({ title: 'バイト', listId: INBOX_LIST_ID, scheduledDate: DAY, startTime: '17:00', endTime: '22:00' }, 1),
          id: 'e1',
          kind: 'event',
        },
        { ...makeTask({ title: 'ES', listId: INBOX_LIST_ID, scheduledDate: day(3), dueDate: DAY }, 2), id: 'es' },
      ],
    })
    useTaskStore.getState().setCalendarEvents([])
  })

  it('To-Do の行を押すと詳細ではなくカード', async () => {
    render(<CalendarDayPanel selectedDateKey={DAY} />)
    fireEvent.click(screen.getByText('レポート'))
    expect(await screen.findByRole('dialog', { name: 'レポート' }, { timeout: 5000 })).toBeInTheDocument()
    expect(useOverlays.getState().detailTaskId).toBeNull()
  }, 20000)

  it('右クリックは予定なら予定のメニュー、To-Do なら To-Do のメニュー', () => {
    render(<CalendarDayPanel selectedDateKey={DAY} />)
    fireEvent.contextMenu(screen.getByText('バイト'))
    expect(useOverlays.getState().menu).toMatchObject({ kind: 'event', taskId: 'e1' })
    fireEvent.contextMenu(screen.getByText('レポート'))
    expect(useOverlays.getState().menu).toMatchObject({ kind: 'task', taskIds: ['r1'] })
  })

  it('締切の日の印を出し、押すとカード', async () => {
    render(<CalendarDayPanel selectedDateKey={DAY} />)
    fireEvent.click(screen.getByRole('button', { name: '“ES” is due' }))
    expect(await screen.findByRole('dialog', { name: 'ES' }, { timeout: 5000 })).toBeInTheDocument()
  }, 20000)
})
