import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useTaskListSelection } from './useTaskListSelection'
import { useTaskStore } from '../store/taskStore'
import { closeTaskMenu, useOverlays } from '../lib/overlays'
import { openTimeSlotForTask } from '../lib/timeSlotTarget'
import { TimeSlotMenu } from '../components/TimeSlotMenu'

/** 先の日（空きは朝 9 時から探す） */
const DAY = '2099-01-05'

const task = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)!

/** To-Do 一覧と同じく、行の箱と「時間を決める」の置き場だけを描く */
function Harness({ ids }: { ids: string[] }) {
  const { listboxProps, makeSelection } = useTaskListSelection({
    rowIds: ids,
    openDetail: vi.fn(),
    toggleRow: vi.fn(),
    removeRows: vi.fn(),
    completeRows: vi.fn(),
    openMenu: vi.fn(),
    pickTimeRow: (id) => openTimeSlotForTask(id, DAY),
    resetOn: [],
  })
  const menu = useOverlays((s) => s.menu)
  return (
    <>
      <input aria-label="memo" />
      <div {...listboxProps} aria-label="tasks">
        {ids.map((id) => {
          const sel = makeSelection(id)
          return (
            <div key={id} id={sel.optionId} role="option" aria-selected={sel.selected} data-task-row={id}>
              {task(id).title}
            </div>
          )
        })}
      </div>
      {menu?.kind === 'timeSlot' && (
        <TimeSlotMenu x={menu.x} y={menu.y} taskId={menu.taskId} dateKey={menu.dateKey} onClose={closeTaskMenu} />
      )}
    </>
  )
}

async function setup() {
  const s = useTaskStore.getState()
  const a = s.addTask('A')!
  const b = s.addTask('B')!
  closeTaskMenu()
  const user = userEvent.setup()
  render(<Harness ids={[a, b]} />)
  // 最初の resetOn の解除（queueMicrotask）を先に済ませる
  await act(async () => {})
  return { a, b, user }
}

describe('S で選んだ行の「時間を決める」', () => {
  it('↓ で枠を置いた行に S で開き、最初の空き候補にフォーカス。↓ で次の候補、Enter でその時間に置いて行へ戻る', async () => {
    const { a, user } = await setup()
    await user.keyboard('{ArrowDown}s')
    const dialog = await screen.findByRole('dialog', { name: 'Set a time' })
    expect(dialog).toHaveTextContent('A')
    expect(screen.getByRole('button', { name: '09:00 – 10:00' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: '10:00 – 11:00' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(task(a)).toMatchObject({ scheduledDate: DAY, startTime: '10:00', endTime: '11:00' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('listbox', { name: 'tasks' })).toHaveFocus()
  })

  it('←→・数字で長さを変えると、同じ位置の候補にフォーカスが残る', async () => {
    const { a, user } = await setup()
    await user.keyboard('{ArrowDown}s')
    await screen.findByRole('dialog')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: '09:00 – 11:00' })).toHaveFocus()
    await user.keyboard('1')
    expect(screen.getByRole('button', { name: '09:00 – 09:30' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(task(a)).toMatchObject({ startTime: '09:00', endTime: '09:30' })
  })

  it('Esc で閉じて、元の一覧（枠の行）へフォーカスが戻る。何も置かない', async () => {
    const { b, user } = await setup()
    await user.keyboard('{ArrowDown}{ArrowDown}s')
    expect(await screen.findByRole('dialog')).toHaveTextContent('B')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    const box = screen.getByRole('listbox', { name: 'tasks' })
    expect(box).toHaveFocus()
    expect(box).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'B' }).id)
    expect(task(b).startTime).toBeFalsy()
  })

  it('入力中・日本語の変換中・枠が無いとき・時間が決まっている行では開かない', async () => {
    const { a, user } = await setup()
    // 枠が無い
    await user.keyboard('s')
    expect(screen.queryByRole('dialog')).toBeNull()
    // 入力中
    await user.keyboard('{ArrowDown}')
    await user.click(screen.getByRole('textbox', { name: 'memo' }))
    await user.keyboard('s')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'memo' })).toHaveValue('s')
    // 変換中
    act(() => screen.getByRole('listbox', { name: 'tasks' }).focus())
    fireEvent.keyDown(window, { key: 's', isComposing: true })
    expect(screen.queryByRole('dialog')).toBeNull()
    // 時間が決まっている
    act(() => useTaskStore.getState().updateTask(a, { scheduledDate: DAY, startTime: '08:00', endTime: '08:30' }))
    await user.keyboard('{ArrowUp}s')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
