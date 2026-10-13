import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { PERSIST_STORAGE_KEY } from '../../store/storeConstants'
import { DRAFT_SAVE_DELAY_MS } from '../../hooks/useDraftField'
import { TaskDetail } from '../TaskDetail'

const savedTask = (id: string) =>
  (
    JSON.parse(localStorage.getItem(PERSIST_STORAGE_KEY)!) as {
      state: { tasks: { id: string; description: string; location: string | null }[] }
    }
  ).state.tasks.find((t) => t.id === id)!
const storeTask = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)!

/** アプリと同じく、ストアの今のタスクを渡す */
function Detail({ id }: { id: string }) {
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === id))
  return task ? <TaskDetail task={task} onClose={() => {}} /> : null
}

function renderDetail() {
  const id = useTaskStore.getState().addTask('Buy milk')!
  const view = render(<Detail id={id} />)
  return { id, ...view }
}

/** 1 文字ずつ打つ（打つたびに textarea の中身が 1 文字伸びる） */
function typeEach(el: HTMLElement, text: string) {
  let value = (el as HTMLInputElement).value
  for (const ch of text) {
    value += ch
    fireEvent.change(el, { target: { value } })
  }
}

let persistWrites: () => number
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const setItem = vi.spyOn(Storage.prototype, 'setItem')
  persistWrites = () => setItem.mock.calls.filter(([k]) => k === PERSIST_STORAGE_KEY).length
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('メモ・場所の欄は打っている間ストアを変えない（#266）', () => {
  it('20 文字打っても全データの保存は 0 回。止まったら 1 回だけ保存する', () => {
    const { id } = renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Add notes…' }))
    const memo = screen.getByPlaceholderText('Add notes…')
    const before = persistWrites()
    let taskUpdates = 0
    const unsub = useTaskStore.subscribe((s, p) => {
      if (s.tasks !== p.tasks) taskUpdates++
    })

    typeEach(memo, 'hello world, twenty!')
    expect(memo).toHaveValue('hello world, twenty!')
    expect(persistWrites() - before).toBe(0)
    expect(taskUpdates).toBe(0)
    expect(storeTask(id).description).toBe('')

    act(() => void vi.advanceTimersByTime(DRAFT_SAVE_DELAY_MS))
    expect(persistWrites() - before).toBe(1)
    expect(taskUpdates).toBe(1)
    expect(savedTask(id).description).toBe('hello world, twenty!')
    unsub()
  })

  it('離れたら待たずに保存し、表示に戻る', () => {
    const { id } = renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Add notes…' }))
    const memo = screen.getByPlaceholderText('Add notes…')
    typeEach(memo, 'abc')
    fireEvent.blur(memo)
    expect(savedTask(id).description).toBe('abc')
    expect(screen.queryByPlaceholderText('Add notes…')).not.toBeInTheDocument()
    expect(screen.getByText('abc')).toBeInTheDocument()
  })

  it('タブを閉じる（pagehide）・裏に回る（visibilitychange）・閉じる（unmount）ときは書きかけを保存する', () => {
    const { id, unmount } = renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Add notes…' }))
    const memo = screen.getByPlaceholderText('Add notes…')

    typeEach(memo, 'a')
    act(() => void window.dispatchEvent(new Event('pagehide')))
    expect(savedTask(id).description).toBe('a')

    typeEach(memo, 'b')
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    vis.mockRestore()
    expect(savedTask(id).description).toBe('ab')

    typeEach(memo, 'c')
    act(() => void window.dispatchEvent(new Event('beforeunload')))
    expect(savedTask(id).description).toBe('abc')

    typeEach(memo, 'd')
    unmount()
    expect(savedTask(id).description).toBe('abcd')
  })

  it('打ち終えたメモは 1 回の ⌘Z で戻る', () => {
    const { id } = renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Add notes…' }))
    const memo = screen.getByPlaceholderText('Add notes…')
    typeEach(memo, 'one')
    act(() => void vi.advanceTimersByTime(DRAFT_SAVE_DELAY_MS))
    typeEach(memo, ' two')
    fireEvent.blur(memo)
    expect(storeTask(id).description).toBe('one two')
    act(() => void useTaskStore.getState().undoLastOperation())
    expect(storeTask(id).description).toBe('')
  })

  it('書きかけが無い間に外から変わったら（元に戻す・他のタブ）欄も合わせる', () => {
    const { id } = renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Add notes…' }))
    act(() => useTaskStore.getState().updateTask(id, { description: 'from elsewhere' }))
    expect(screen.getByPlaceholderText('Add notes…')).toHaveValue('from elsewhere')
  })

  it('場所も打っている間は保存せず、離れたら保存する', () => {
    const { id } = renderDetail()
    const place = screen.getByPlaceholderText(/location/i)
    const before = persistWrites()
    typeEach(place, 'Tokyo')
    expect(persistWrites() - before).toBe(0)
    fireEvent.blur(place)
    expect(savedTask(id).location).toBe('Tokyo')
    // 空にしたら null
    fireEvent.change(place, { target: { value: '' } })
    act(() => void vi.advanceTimersByTime(DRAFT_SAVE_DELAY_MS))
    expect(savedTask(id).location).toBeNull()
  })

  it('打っている途中に他のタブが保存しても、両方の変更が残る（書きかけは取り込んだ後のタスクに当たる）', () => {
    const { id } = renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Add notes…' }))
    typeEach(screen.getByPlaceholderText('Add notes…'), 'memo')

    const saved = JSON.parse(localStorage.getItem(PERSIST_STORAGE_KEY)!) as { state: { tasks: { id: string; title: string }[] } }
    saved.state.tasks = [...saved.state.tasks, { ...saved.state.tasks[0]!, id: 'other', title: 'From the other tab' }]
    localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify(saved))
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: PERSIST_STORAGE_KEY })))
    expect(useTaskStore.getState().tasks.map((t) => t.title)).toEqual(['Buy milk', 'From the other tab'])
    expect(screen.getByPlaceholderText('Add notes…')).toHaveValue('memo')

    act(() => void vi.advanceTimersByTime(DRAFT_SAVE_DELAY_MS))
    expect(savedTask(id).description).toBe('memo')
    expect(savedTask('other')).toBeDefined()
  })
})
