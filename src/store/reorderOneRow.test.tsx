import { describe, expect, it } from 'vitest'
import { useTaskStore } from './taskStore'

describe('手動の並べ替え（#261）', () => {
  it('1 件動かすと、順番と更新時刻が変わるのはその 1 行だけ', () => {
    const s = useTaskStore.getState()
    const ids = ['a', 'b', 'c', 'd'].map((t) => s.addTask(t)!)
    const before = new Map(useTaskStore.getState().tasks.map((t) => [t.id, t]))
    const current = [...useTaskStore.getState().tasks]
      .filter((t) => ids.includes(t.id))
      .sort((x, y) => x.order - y.order)
      .map((t) => t.id)
    // 最後の行を 2 番目へ
    const moved = current.at(-1)!
    const next = [current[0]!, moved, ...current.slice(1, -1)]
    useTaskStore.getState().reorderManualRootTasks(next)

    const after = useTaskStore.getState().tasks
    const changed = after.filter((t) => before.get(t.id) !== t)
    expect(changed.map((t) => t.id)).toEqual([moved])
    const orderOf = (id: string) => after.find((t) => t.id === id)!.order
    expect(next.map(orderOf)).toEqual([...next.map(orderOf)].sort((x, y) => x - y))
  })
})
