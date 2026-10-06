import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { useBulkTaskActions } from './useBulkTaskActions'

function setup() {
  const s = useTaskStore.getState()
  const a = s.addTask('A')!
  const b = s.addTask('B')!
  const bulk = renderHook(() => useBulkTaskActions()).result.current
  return { a, b, bulk }
}

const task = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)!

describe('useBulkTaskActions', () => {
  it('今と同じリストを選び直しても、トーストも取り消しの履歴も積まない', () => {
    const { a, bulk } = setup()
    useTaskStore.setState({ moveBannerText: null })
    const before = useTaskStore.getState()
    bulk.moveToList([a], task(a).listId)
    const after = useTaskStore.getState()
    expect(after.tasks).toBe(before.tasks)
    expect(after.moveBannerText).toBeNull()
  })

  it('同じ優先度を選び直しても、何も変えない', () => {
    const { a, bulk } = setup()
    const before = useTaskStore.getState().tasks
    bulk.setPriority([a], task(a).priority)
    expect(useTaskStore.getState().tasks).toBe(before)
  })

  it('値の違うものだけ変える', () => {
    const { a, b, bulk } = setup()
    useTaskStore.getState().updateTask(a, { priority: 'high' })
    bulk.setPriority([a, b], 'high')
    expect(task(a).priority).toBe('high')
    expect(task(b).priority).toBe('high')
  })

  it('⌘↵: 未完了が混ざっていれば完了、全部済みなら未完了に戻す', () => {
    const { a, b, bulk } = setup()
    useTaskStore.getState().toggleTask(a)
    bulk.toggleComplete([a, b])
    expect(task(a).completed).toBe(true)
    expect(task(b).completed).toBe(true)

    bulk.toggleComplete([a, b])
    expect(task(a).completed).toBe(false)
    expect(task(b).completed).toBe(false)
  })

  it('未完了に戻すのは 1 回の元に戻すで戻る', () => {
    const { a, b, bulk } = setup()
    bulk.complete([a, b])
    bulk.uncomplete([a, b])
    useTaskStore.getState().undoLastOperation()
    expect(task(a).completed).toBe(true)
    expect(task(b).completed).toBe(true)
  })
})
