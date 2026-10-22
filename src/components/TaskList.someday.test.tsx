import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import { DndContext } from '@dnd-kit/core'
import { useTaskStore } from '../store/taskStore'
import { makeTask } from '../store/taskHelpers'
import { TaskList } from './TaskList'
import { TaskContextMenu } from './TaskContextMenu'

beforeAll(() => {
  // jsdom には無い（枠の行を見える所へ送る）
  Element.prototype.scrollIntoView = () => {}
})

/** いつかのリスト: 夢（マチュピチュ、一歩 2 つのうち 1 つ済み）とやりたい（ピクニック） */
function seed() {
  const s = useTaskStore.getState()
  s.addList('いつか', 'someday')
  const wish = useTaskStore.getState().lists.find((l) => l.name === 'いつか')!
  const at = (id: string, title: string, order: number, over = {}) => ({ ...makeTask({ title, listId: wish.id }, order), id, ...over })
  useTaskStore.setState({
    tasks: [
      at('picnic', 'ピクニック', 0),
      at('machu', 'マチュピチュに行く', 1, { somedayTier: 'dream' }),
      at('save', 'お金を貯める', 0, { parentId: 'machu', completed: true, completedAt: '2026-01-01T00:00:00Z' }),
      at('spanish', 'スペイン語を習う', 1, { parentId: 'machu' }),
    ],
  })
  useTaskStore.getState().selectList(wish.id)
  return wish.id
}

const renderList = () =>
  render(
    <DndContext>
      <TaskList />
    </DndContext>,
  )

describe('いつかの夢ボードとやりたい棚（#439）', () => {
  it('夢があれば夢ボードで開く。タイルに次の一歩・進み具合。やりたいへ切り替えると行で出る', async () => {
    seed()
    const user = userEvent.setup()
    renderList()
    const board = screen.getByRole('region', { name: 'Lifetime' })
    expect(within(board).getByRole('button', { name: 'マチュピチュに行く' })).toBeInTheDocument()
    expect(within(board).getByText('Next step: スペイン語を習う')).toBeInTheDocument()
    expect(within(board).getByRole('img', { name: 'Steps done 1/2' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'ピクニック' })).toBeNull()
    await user.click(screen.getByRole('tab', { name: /^Soon/ }))
    expect(screen.getByRole('option', { name: 'ピクニック' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Lifetime' })).toBeNull()
    // 夢の一歩は行に出さない
    expect(screen.queryByRole('option', { name: 'スペイン語を習う' })).toBeNull()
  })

  it('夢ボードを開いて入れると夢になる', async () => {
    seed()
    const user = userEvent.setup()
    renderList()
    await user.type(screen.getByPlaceholderText('Add something for your lifetime'), 'オーロラを見る{Enter}')
    expect(useTaskStore.getState().tasks.find((t) => t.title === 'オーロラを見る')!.somedayTier).toBe('dream')
  })

  it('# セクションで絞り込むと夢とやりたいを上下に出し、入れるとそのセクションに入る', async () => {
    const listId = seed()
    const travel = useTaskStore.getState().addSection(listId, '旅行')
    useTaskStore.setState({
      tasks: useTaskStore.getState().tasks.map((t) => (t.id === 'machu' || t.id === 'picnic' ? { ...t, sectionId: travel } : t)),
    })
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole('button', { name: '# 旅行' }))
    expect(screen.queryByRole('tab', { name: /^Soon/ })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Lifetime' })).getByRole('button', { name: 'マチュピチュに行く' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'ピクニック' })).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Add something you want to do'), '京都{Enter}')
    expect(useTaskStore.getState().tasks.find((t) => t.title === '京都')!.sectionId).toBe(travel)
  })

  it('かなえた夢はボードの下に日付つきで残る', async () => {
    seed()
    const user = userEvent.setup()
    useTaskStore.setState({
      tasks: useTaskStore
        .getState()
        .tasks.map((t) => (t.id === 'machu' ? { ...t, completed: true, completedAt: '2026-03-02T03:00:00.000Z' } : t)),
    })
    // 夢が無い（かなえた夢だけ）ときはやりたいで開くので、夢へ切り替える
    renderList()
    await user.click(screen.getByRole('tab', { name: /^Lifetime/ }))
    expect(screen.getByRole('heading', { name: 'Done' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Lifetime' })).getByText(/2026/)).toHaveTextContent(/Mar.*2/)
  })

  it('メニューの「夢にする」「やりたいへ移す」で段を変える', async () => {
    seed()
    const user = userEvent.setup()
    const { unmount } = render(<TaskContextMenu x={10} y={10} taskIds={['picnic']} onClose={() => {}} onOpenDetail={() => {}} />)
    await user.click(screen.getByRole('menuitem', { name: /Move to Lifetime/ }))
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'picnic')!.somedayTier).toBe('dream')
    unmount()
    render(<TaskContextMenu x={10} y={10} taskIds={['machu']} onClose={() => {}} onOpenDetail={() => {}} />)
    await user.click(screen.getByRole('menuitem', { name: /Move to Soon/ }))
    expect('somedayTier' in useTaskStore.getState().tasks.find((t) => t.id === 'machu')!).toBe(false)
  })

  it('まだ何も無いいつかは、追加欄の下に例。押すと欄に入り、1 件あれば出ない', async () => {
    const user = userEvent.setup()
    useTaskStore.getState().addList('いつか', 'someday')
    const wish = useTaskStore.getState().lists.find((l) => l.name === 'いつか')!
    useTaskStore.getState().selectList(wish.id)
    render(
      <DndContext>
        <TaskList />
      </DndContext>,
    )
    await user.click(screen.getByRole('button', { name: 'Put “Travel abroad” in the add field' }))
    const input = screen.getByDisplayValue('Travel abroad')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('button', { name: 'Put “Travel abroad” in the add field' })).toBeNull()
  })

  it('夢が 1 件も無いあいだは切り替えも夢ボードも出さず、やりたいの一覧だけ（#517）', () => {
    seed()
    useTaskStore.setState({ tasks: useTaskStore.getState().tasks.filter((t) => t.id === 'picnic') })
    renderList()
    expect(screen.queryByRole('tab', { name: /^Lifetime/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Lifetime' })).toBeNull()
    expect(screen.getByRole('option', { name: 'ピクニック' })).toBeInTheDocument()
  })

  it('入れるときに「☆ 夢」を押すと夢になり、切り替えと夢ボードが出る（#517）', async () => {
    seed()
    useTaskStore.setState({ tasks: useTaskStore.getState().tasks.filter((t) => t.id === 'picnic') })
    const user = userEvent.setup()
    renderList()
    const input = screen.getByPlaceholderText('Add something you want to do')
    await user.type(input, 'オーロラを見る')
    await user.click(screen.getByRole('button', { name: 'Lifetime', pressed: false }))
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(useTaskStore.getState().tasks.find((t) => t.title === 'オーロラを見る')!.somedayTier).toBe('dream')
    expect(screen.getByRole('tab', { name: /^Lifetime/ })).toBeInTheDocument()
  })
})
