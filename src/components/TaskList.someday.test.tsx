import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { useTaskStore } from '../store/taskStore'
import { makeTask } from '../store/taskHelpers'
import { applyDragEnd } from '../lib/dragEnd'
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

const tierOf = (title: string) => screen.getByRole('option', { name: title }).closest('[role="group"]')!.getAttribute('aria-label')

describe('いつかの 2 段（#221）', () => {
  it('夢は上にカード（次の一歩・日付・進み具合）、やりたいは下の一覧。夢の一歩は一覧の行に出さない（#429）', () => {
    seed()
    useTaskStore.setState({
      tasks: useTaskStore.getState().tasks.map((t) => (t.id === 'spanish' ? { ...t, dueDate: '2026-10-20' } : t)),
    })
    render(
      <DndContext>
        <TaskList />
      </DndContext>,
    )
    const dreams = screen.getByRole('region', { name: 'Dreams' })
    expect(within(dreams).getByRole('button', { name: 'マチュピチュに行く' })).toBeInTheDocument()
    expect(within(dreams).getByText('Next step: スペイン語を習う')).toBeInTheDocument()
    expect(within(dreams).getByText(/10\/20/)).toBeInTheDocument()
    expect(within(dreams).getByLabelText('Steps done 1/2')).toBeInTheDocument()
    expect(tierOf('ピクニック')).toBe('Wishes')
    expect(screen.queryByRole('option', { name: 'マチュピチュに行く' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'スペイン語を習う' })).toBeNull()
  })

  it('メニューの「夢へ移す」「やりたいへ移す」で段を変える', async () => {
    seed()
    const user = userEvent.setup()
    const { unmount } = render(<TaskContextMenu x={10} y={10} taskIds={['picnic']} onClose={() => {}} onOpenDetail={() => {}} />)
    await user.click(screen.getByRole('menuitem', { name: 'Move to Dreams' }))
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'picnic')!.somedayTier).toBe('dream')
    unmount()
    render(<TaskContextMenu x={10} y={10} taskIds={['machu']} onClose={() => {}} onOpenDetail={() => {}} />)
    await user.click(screen.getByRole('menuitem', { name: 'Move to Wishes' }))
    expect('somedayTier' in useTaskStore.getState().tasks.find((t) => t.id === 'machu')!).toBe(false)
  })

  it('ドラッグで段の見出しへ落とすとその段へ、別の段の行の前へ落とすとその段に並べる', () => {
    seed()
    const drop = (activeId: string, overId: string) =>
      applyDragEnd({
        active: { id: activeId, data: { current: {} } },
        over: { id: overId },
        delta: { x: 0, y: 0 },
      } as unknown as DragEndEvent)
    drop('task::picnic', 'tier::dream')
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'picnic')!.somedayTier).toBe('dream')
    drop('task::machu', 'tier::wish')
    expect('somedayTier' in useTaskStore.getState().tasks.find((t) => t.id === 'machu')!).toBe(false)
    // やりたいのマチュピチュを、夢のピクニックの前へ
    drop('task::machu', 'task::picnic')
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'machu')!.somedayTier).toBe('dream')
  })

  it('やりたいをセクションで分ける。空のセクションも出し、夢はセクションで分けない（#427・#429）', () => {
    const listId = seed()
    const travel = useTaskStore.getState().addSection(listId, '旅行')
    useTaskStore.getState().addSection(listId, '学び')
    useTaskStore.setState({
      tasks: useTaskStore.getState().tasks.map((t) => (t.id === 'machu' || t.id === 'picnic' ? { ...t, sectionId: travel } : t)),
    })
    render(
      <DndContext>
        <TaskList />
      </DndContext>,
    )
    const groups = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))
    expect(groups).toEqual(['Wishes', '旅行', '学び'])
    expect(tierOf('ピクニック')).toBe('旅行')
    expect(within(screen.getByRole('region', { name: 'Dreams' })).getByRole('button', { name: 'マチュピチュに行く' })).toBeInTheDocument()
  })
})
