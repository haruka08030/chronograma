import { act, fireEvent, render } from '@testing-library/react'
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
  it('⋮ を押すと右クリックと同じメニューをカードの上に重ねて出し、詳細が開いたらカードを閉じる。メニューの「複製」で写したものの詳細を開く', async () => {
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
    expect(closed).toBe(false)
    act(() => useOverlays.setState({ detailTaskId: 'b', menu: null }))
    expect(closed).toBe(true)
    view.unmount()
    act(() => useOverlays.setState({ detailTaskId: null }))

    let opened = ''
    const menu = render(<TaskEventMenu x={0} y={0} taskId="b" onClose={() => {}} onOpenDetail={(id) => (opened = id)} />)
    fireEvent.click(await menu.findByRole('menuitem', { name: 'Duplicate' }))
    const copy = useTaskStore.getState().tasks.find((t) => t.id === opened)!
    expect(copy).toMatchObject({ title: 'バイト', scheduledDate: '2026-10-07', startTime: '17:00' })
    expect(opened).not.toBe('b')
  })
})

describe('予定のメニュー: この名前は Google に送らない（#461）', () => {
  const seed = (kind: 'event' | 'todo', connected: boolean) =>
    useTaskStore.setState({
      googleConnected: connected,
      googleCanWrite: connected,
      tasks: [
        {
          ...makeTask({ title: '移動', listId: INBOX_LIST_ID, scheduledDate: '2026-10-07', startTime: '10:00', endTime: '10:10' }, 0),
          id: 'm',
          kind,
        },
      ],
    })

  it('Google に送っているときだけ出し、押すと名前ごとに切り替わる', async () => {
    const { TaskEventMenu } = await import('./EventContextMenu')
    seed('event', true)
    const view = render(<TaskEventMenu x={0} y={0} taskId="m" onClose={() => {}} onOpenDetail={() => {}} />)
    const item = view.getByRole('menuitem', { name: /Don't send this name to Google/ })
    fireEvent.click(item)
    expect(useTaskStore.getState().addons.googleSkip).toEqual(['移動'])
    view.unmount()

    // 送らないになっている名前はチェックが付き、もう一度押すと戻る
    const again = render(<TaskEventMenu x={0} y={0} taskId="m" onClose={() => {}} onOpenDetail={() => {}} />)
    const checked = again.getByRole('menuitem', { name: /Don't send this name to Google/ })
    expect(checked.querySelectorAll('svg').length).toBe(2)
    fireEvent.click(checked)
    expect(useTaskStore.getState().addons.googleSkip).toEqual([])
    again.unmount()

    // つないでいない・To-Do には出さない
    seed('event', false)
    const off = render(<TaskEventMenu x={0} y={0} taskId="m" onClose={() => {}} onOpenDetail={() => {}} />)
    expect(off.queryByRole('menuitem', { name: /Google/ })).toBeNull()
    off.unmount()
    seed('todo', true)
    const todo = render(<TaskEventMenu x={0} y={0} taskId="m" onClose={() => {}} onOpenDetail={() => {}} />)
    expect(todo.queryByRole('menuitem', { name: /Google/ })).toBeNull()
  })
})
