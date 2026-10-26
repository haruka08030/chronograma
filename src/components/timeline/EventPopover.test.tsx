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

describe('EventPopover: ⋮ を出さない（#573）', () => {
  it('カードに ⋮ は無く、詳細が開いたらカードを閉じる', async () => {
    const { useOverlays } = await import('../../lib/overlays')
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
    await view.findByRole('dialog')
    expect(view.queryByRole('button', { name: 'More options' })).toBeNull()
    expect(closed).toBe(false)
    act(() => useOverlays.setState({ detailTaskId: 'b' }))
    expect(closed).toBe(true)
    view.unmount()
    act(() => useOverlays.setState({ detailTaskId: null }))
  })
})

describe('予定のメニュー（月・予定リストの右クリック）: 複製・編集・削除', () => {
  it('「複製」で写したものの詳細を開く', async () => {
    const { TaskEventMenu } = await import('./EventContextMenu')
    useTaskStore.setState({
      tasks: [
        {
          ...makeTask({ title: 'バイト', listId: INBOX_LIST_ID, scheduledDate: '2026-10-07', startTime: '17:00', endTime: '22:00' }, 0),
          id: 'b',
        },
      ],
    })
    let opened = ''
    const menu = render(<TaskEventMenu x={0} y={0} taskId="b" onClose={() => {}} onOpenDetail={(id) => (opened = id)} />)
    expect(await menu.findByRole('menuitem', { name: 'Edit' })).toBeTruthy()
    expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeTruthy()
    fireEvent.click(menu.getByRole('menuitem', { name: 'Duplicate' }))
    const copy = useTaskStore.getState().tasks.find((t) => t.id === opened)!
    expect(copy).toMatchObject({ title: 'バイト', scheduledDate: '2026-10-07', startTime: '17:00' })
    expect(opened).not.toBe('b')
  })
})

describe('タイムラインの右クリック（brief）: 完了 / 未完了・複製だけ', () => {
  it('To-Do は「完了にする」「複製」だけを出す', async () => {
    const { TaskEventMenu } = await import('./EventContextMenu')
    useTaskStore.setState({
      tasks: [
        {
          ...makeTask({ title: 'ゼミ', listId: INBOX_LIST_ID, scheduledDate: '2099-10-07', startTime: '15:00', endTime: '16:30' }, 0),
          id: 'z',
        },
      ],
    })
    const menu = render(<TaskEventMenu x={0} y={0} brief taskId="z" onClose={() => {}} onOpenDetail={() => {}} />)
    const items = (await menu.findAllByRole('menuitem')).map((el) => el.textContent)
    expect(items).toEqual(['Mark done', 'Duplicate'])
  })
})

describe('予定のメニュー: Google に送るかは右クリックで選ばない（#626）', () => {
  it('Google につないでいても「この名前は Google に送らない」は出さない', async () => {
    const { TaskEventMenu } = await import('./EventContextMenu')
    useTaskStore.setState({
      googleConnected: true,
      googleCanWrite: true,
      tasks: [
        {
          ...makeTask({ title: '移動', listId: INBOX_LIST_ID, scheduledDate: '2026-10-07', startTime: '10:00', endTime: '10:10' }, 0),
          id: 'm',
          kind: 'event',
        },
      ],
    })
    const view = render(<TaskEventMenu x={0} y={0} taskId="m" onClose={() => {}} onOpenDetail={() => {}} />)
    expect((await view.findAllByRole('menuitem')).length).toBeGreaterThan(0)
    expect(view.queryByRole('menuitem', { name: /Google/ })).toBeNull()
  })
})
