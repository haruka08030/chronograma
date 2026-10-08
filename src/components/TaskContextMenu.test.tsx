import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { TaskContextMenu } from './TaskContextMenu'

const task = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)!

function seed() {
  const s = useTaskStore.getState()
  const a = s.addTask('A')!
  const b = s.addTask('B')!
  useTaskStore.setState({ timeLogTagPresets: ['Work'], logCategoryColors: { Work: '#D50000' } })
  return { a, b }
}

const renderMenu = (taskIds: string[]) =>
  render(<TaskContextMenu x={10} y={10} taskIds={taskIds} onClose={() => {}} onOpenDetail={() => {}} />)

describe('TaskContextMenu のラベル', () => {
  const originalMatchMedia = window.matchMedia
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('PC: 選んだ複数の To-Do に「ラベル ›」から 1 回で付け、「ラベルなし」で外す', async () => {
    const user = userEvent.setup()
    const { a, b } = seed()
    const { unmount } = renderMenu([a, b])
    await user.click(screen.getByRole('menuitem', { name: /Label/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Work' }))
    expect(task(a).color).toBe('#D50000')
    expect(task(b).color).toBe('#D50000')
    unmount()

    // 全部同じラベルなら今の値が右に出て、そのラベルにチェックが付く
    renderMenu([a, b])
    const entry = screen.getByRole('menuitem', { name: /Label/ })
    expect(entry).toHaveTextContent('Work')
    await user.click(entry)
    expect(screen.getByRole('menuitem', { name: 'Work' }).querySelector('svg')).not.toBeNull()
    await user.click(screen.getByRole('menuitem', { name: 'No label' }))
    expect(task(a).color).toBeNull()
    expect(task(b).color).toBeNull()
  })

  it('PC: 検索欄にラベル名を打つと、そのラベルを付けられる', async () => {
    const user = userEvent.setup()
    const { a, b } = seed()
    renderMenu([a, b])
    await user.type(screen.getByRole('textbox'), 'work')
    await user.click(screen.getByRole('menuitem', { name: /^Label ›\s*Work$/ }))
    expect(task(a).color).toBe('#D50000')
  })

  it('スマホ: 下からのシートの中で「ラベル」を開いて選ぶ', async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('pointer: coarse'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia
    const user = userEvent.setup()
    const { a, b } = seed()
    renderMenu([a, b])
    const sheet = screen.getByRole('menu')
    expect(within(sheet).queryByRole('textbox')).toBeNull()
    await user.click(within(sheet).getByRole('menuitem', { name: /Label/ }))
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Work' }))
    expect(task(a).color).toBe('#D50000')
    expect(task(b).color).toBe('#D50000')
  })
})
