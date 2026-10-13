import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { INBOX_LIST_ID } from '../store/storeConstants'
import { makeTask } from '../store/taskHelpers'
import { dispatchSelectAll } from '../lib/shortcuts'
import { LIST_PAGE_SIZE } from '../hooks/useShowMore'
import type { Task } from '../types/task'
import { CompletedTasksView } from './CompletedTasksView'
import { SearchResults } from './SearchResults'
import { TaskBinView } from './TaskBinView'

const openTaskDetail = vi.hoisted(() => vi.fn())
vi.mock('../lib/overlays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/overlays')>()),
  openTaskDetail,
}))

/**
 * 数千行あるときに、描く行が上限までか（#288）。件数と描く時間（React Profiler の actualDuration）を出す。
 * 時間は機械で揺れるので確かめるのは行の数だけ
 */
const N = 5000
const BASE = Date.parse('2026-10-08T12:00:00Z')

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

function bigSeed(n: number, make: (i: number) => Partial<Task>): Task[] {
  return Array.from({ length: n }, (_, i) => {
    const at = new Date(BASE - i * 90 * 60 * 1000).toISOString()
    return { ...makeTask({ title: `数学 ${i}`, listId: INBOX_LIST_ID }, i, at), ...make(i) } as Task
  })
}
const completed = (i: number) => ({ completed: true, completedAt: new Date(BASE - i * 90 * 60 * 1000).toISOString() })
const record = (i: number) => (i % 5 < 2 ? { kind: 'log' as const, dueDate: '2026-10-01', startTime: '09:00', endTime: '10:00' } : {})

function measure(node: ReactNode) {
  let ms = 0
  let commits = 0
  const onRender: ProfilerOnRenderCallback = (_id, _phase, actual) => {
    ms += actual
    commits++
  }
  const view = render(
    <Profiler id="list" onRender={onRender}>
      {node}
    </Profiler>,
  )
  const rows = () => view.container.querySelectorAll('[data-task-row]').length
  const take = () => {
    const out = { ms: Math.round(ms), commits, rows: rows() }
    ms = 0
    commits = 0
    return out
  }
  return { take, rows }
}

/** 足された行へ枠を動かすのは次のマイクロタスク（`useTaskListSelection`）なので、待ってから次を押す */
const press = async (key: string, times = 1, shiftKey = false) => {
  for (let i = 0; i < times; i++) await act(async () => void fireEvent.keyDown(window, { key, shiftKey }))
}

describe(`${N} 件の一覧は先頭の ${LIST_PAGE_SIZE} 行だけ描く`, { timeout: 120_000 }, () => {
  it('完了済み: 開くと 100 行。「さらに表示」で 100 行ずつ足す。件数は全部の数', async () => {
    useTaskStore.setState({ tasks: bigSeed(N, completed) })
    const { take, rows } = measure(<CompletedTasksView />)
    const open = take()
    console.info(`[perf #288] completed open: ${JSON.stringify(open)}`)
    expect(open.rows).toBe(LIST_PAGE_SIZE)
    expect(screen.getByText(`${N} items`)).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: `Show more (${N - LIST_PAGE_SIZE} left)` }))
    expect(rows()).toBe(LIST_PAGE_SIZE * 2)
  })

  it('ゴミ箱: 開くと 100 行', () => {
    useTaskStore.setState({ tasks: bigSeed(N, (i) => ({ deletedAt: new Date(BASE - i * 60000).toISOString() })) })
    const { take } = measure(<TaskBinView mode="deleted" />)
    const open = take()
    console.info(`[perf #288] bin open: ${JSON.stringify(open)}`)
    expect(open.rows).toBe(LIST_PAGE_SIZE)
  })

  it('検索（To-Do 3,000・記録 2,000）: 「数学 1」で開き、1 文字消して「数学」に広げても 100 行。記録は行にしない', () => {
    useTaskStore.setState({ tasks: bigSeed(N, record) })
    useTaskStore.getState().setSearchQuery('数学 1')
    const { take } = measure(<SearchResults />)
    const open = take()
    act(() => useTaskStore.getState().setSearchQuery('数学 '))
    const edited = take()
    console.info(`[perf #288] search open: ${JSON.stringify(open)} / edit 1 char: ${JSON.stringify(edited)}`)
    expect(open.rows).toBe(LIST_PAGE_SIZE)
    expect(edited.rows).toBe(LIST_PAGE_SIZE)
    expect(screen.getByText('“数学 ” · 3000 to-dos')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2000 records' })).toBeInTheDocument()
  })
})

describe('描いていない行へもキーで行ける', () => {
  it('完了済み: 最後の行で ↓ を押すと行が足され、枠（aria-activedescendant）が 101 行目へ動く', async () => {
    useTaskStore.setState({ tasks: bigSeed(150, completed) })
    const { rows } = measure(<CompletedTasksView />)
    await act(async () => {}) // 開いたときの選択の初期化（マイクロタスク）を済ませる
    await press('ArrowDown', LIST_PAGE_SIZE)
    const list = screen.getByRole('listbox')
    expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: /数学 99$/ }).id)
    expect(rows()).toBe(LIST_PAGE_SIZE)

    await press('ArrowDown')
    expect(rows()).toBe(150)
    expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: /数学 100$/ }).id)
    await press('ArrowDown', 60)
    expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: /数学 149$/ }).id)
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull()
  })

  it('検索: Shift+↓ で最後の行から先へ広げると、足された行まで選択も広がる', async () => {
    useTaskStore.setState({ tasks: bigSeed(120, () => ({})) })
    useTaskStore.getState().setSearchQuery('数学')
    measure(<SearchResults />)
    await act(async () => {})
    await press('ArrowDown', LIST_PAGE_SIZE)
    await press('ArrowDown', 2, true)
    expect(screen.getAllByRole('option')).toHaveLength(120)
    const selected = screen.getAllByRole('option', { selected: true })
    expect(selected).toHaveLength(3)
    expect(selected[0]).toHaveTextContent('数学 99')
    expect(selected[2]).toHaveTextContent('数学 101')
  })
})

describe('検索の記録', () => {
  it('記録は To-Do の行に混ぜず、件数と「記録を見る」で出す。開くと新しい順に並び、押すと詳細', async () => {
    const user = userEvent.setup()
    useTaskStore.getState().addTask('数学の宿題')
    useTaskStore.setState({
      tasks: [
        ...useTaskStore.getState().tasks,
        ...bigSeed(2, (i) => ({
          title: `数学 記録 ${i}`,
          kind: i === 0 ? ('log' as const) : ('sleep' as const),
          dueDate: i === 0 ? '2026-10-01' : '2026-10-05',
          startTime: '09:00',
          endTime: '10:00',
        })),
      ],
    })
    useTaskStore.getState().setSearchQuery('数学')
    render(<SearchResults />)

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('数学の宿題')
    expect(screen.getByRole('heading', { name: '2 records' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /数学 記録/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Show records' }))
    const records = within(screen.getByRole('region', { name: 'Records' })).getAllByRole('button', { name: /数学 記録/ })
    expect(records).toHaveLength(2)
    expect(records[0]).toHaveTextContent('数学 記録 1')
    expect(records[1]).toHaveTextContent('数学 記録 0')
    await user.click(records[1])
    expect(openTaskDetail).toHaveBeenCalledWith(useTaskStore.getState().tasks.find((x) => x.title === '数学 記録 0')!.id)
  })

  it('当たったのが記録だけなら、To-Do は無いと一言出して記録を下に出す', () => {
    useTaskStore.setState({ tasks: bigSeed(3, () => ({ kind: 'log' as const, dueDate: '2026-10-01' })) })
    useTaskStore.getState().setSearchQuery('数学')
    render(<SearchResults />)
    expect(screen.getByText('No matching to-dos')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('heading', { name: '3 records' })).toBeInTheDocument()
  })
})

describe('ゴミ箱の複数選択（長い一覧）', () => {
  it('⌘A は描いている 100 行だけを選ぶ。「さらに表示」の後の行も押して選び、まとめて戻せる', async () => {
    const user = userEvent.setup()
    useTaskStore.setState({ tasks: bigSeed(130, (i) => ({ archivedAt: new Date(BASE - i * 60000).toISOString() })) })
    render(<TaskBinView mode="archived" />)
    act(() => void dispatchSelectAll())
    expect(screen.getByRole('toolbar')).toHaveAccessibleName(`${LIST_PAGE_SIZE} selected`)
    await press('Escape')
    expect(screen.queryByRole('toolbar')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Show more (30 left)' }))
    await user.click(screen.getByRole('option', { name: '数学 120' }))
    await user.click(screen.getByRole('option', { name: '数学 129' }))
    expect(screen.getByRole('toolbar')).toHaveAccessibleName('2 selected')
    await user.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Unarchive' }))
    const byTitle = (title: string) => useTaskStore.getState().tasks.find((x) => x.title === title)!
    expect(byTitle('数学 120').archivedAt).toBeNull()
    expect(byTitle('数学 129').archivedAt).toBeNull()
    expect(byTitle('数学 121').archivedAt).not.toBeNull()
  })
})
