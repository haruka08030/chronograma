import { fireEvent, render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { makeTask } from '../../store/taskHelpers'
import { INBOX_LIST_ID } from '../../store/storeConstants'
import { EventPopover } from './EventPopover'

beforeAll(() => {
  // jsdom には無い（時刻の候補の一覧が使う）
  Element.prototype.scrollIntoView = () => {}
})

const anchor = { top: 100, left: 100, right: 200, bottom: 140 }

describe('EventPopover: Alt+↑↓ / Alt+Shift+↑↓', () => {
  function open() {
    useTaskStore.setState({
      tasks: [
        {
          ...makeTask({ title: '読書', listId: INBOX_LIST_ID, scheduledDate: '2026-10-07', startTime: '10:00', endTime: '11:00' }, 0),
          id: 'p',
        },
      ],
    })
    return render(<EventPopover taskId="p" anchor={anchor} onClose={() => {}} onOpenDetail={() => {}} />)
  }
  const plan = () => useTaskStore.getState().tasks.find((x) => x.id === 'p')!

  it('カードを開いたまま 15 分ずつ動かし、終わりを伸び縮みできる', async () => {
    const view = open()
    const card = await view.findByRole('dialog')
    fireEvent.keyDown(card, { key: 'ArrowDown', altKey: true })
    expect(plan()).toMatchObject({ startTime: '10:15', endTime: '11:15' })
    fireEvent.keyDown(card, { key: 'ArrowUp', altKey: true, shiftKey: true })
    expect(plan()).toMatchObject({ startTime: '10:15', endTime: '11:00' })
  })

  it('時刻の欄に入力中は動かさない', async () => {
    const view = open()
    await view.findByRole('dialog')
    const input = document.querySelector('input')!
    input.focus()
    fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true })
    expect(plan()).toMatchObject({ startTime: '10:00', endTime: '11:00' })
  })
})

describe('EventPopover: ⋮（#402）', () => {
  it('⋮ を押すと右クリックと同じメニューを出してカードを閉じる。メニューの「複製」で写したものの詳細を開く', async () => {
    const { useOverlays } = await import('../../lib/overlays')
    const { TaskEventMenu } = await import('./EventContextMenu')
    useTaskStore.setState({
      tasks: [
        {
          ...makeTask({ title: 'バイト', listId: INBOX_LIST_ID, scheduledDate: '2026-10-07', startTime: '17:00', endTime: '22:00' }, 0),
          id: 'b',
        },
      ],
    })
    let closed = false
    const view = render(<EventPopover taskId="b" anchor={anchor} onClose={() => (closed = true)} onOpenDetail={() => {}} />)
    fireEvent.click(await view.findByRole('button', { name: 'More options' }))
    expect(useOverlays.getState().menu).toMatchObject({ kind: 'event', taskId: 'b' })
    expect(closed).toBe(true)
    view.unmount()

    let opened = ''
    const menu = render(<TaskEventMenu x={0} y={0} taskId="b" onClose={() => {}} onOpenDetail={(id) => (opened = id)} />)
    fireEvent.click(await menu.findByRole('menuitem', { name: 'Duplicate' }))
    const copy = useTaskStore.getState().tasks.find((t) => t.id === opened)!
    expect(copy).toMatchObject({ title: 'バイト', scheduledDate: '2026-10-07', startTime: '17:00' })
    expect(opened).not.toBe('b')
  })
})
