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

describe('セクションを消す（#357）', () => {
  it('中のタスクはセクションを外すだけで、更新時刻は変えない（取り消すと戻る）', () => {
    const s = useTaskStore.getState()
    s.addList('L')
    const listId = useTaskStore.getState().lists.find((l) => l.name === 'L')!.id
    const sec = useTaskStore.getState().addSection(listId, 'S')
    useTaskStore.getState().setQuickAddSectionId(sec)
    const ids = ['x', 'y'].map((t) => useTaskStore.getState().addTask(t, listId)!)
    useTaskStore.getState().bulkUpdateTasks(ids, { sectionId: sec })
    const before = new Map(useTaskStore.getState().tasks.map((t) => [t.id, t]))
    useTaskStore.getState().deleteSection(sec)
    const after = useTaskStore.getState().tasks.filter((t) => ids.includes(t.id))
    expect(after.map((t) => t.sectionId)).toEqual([null, null])
    expect(after.map((t) => t.updatedAt)).toEqual(ids.map((id) => before.get(id)!.updatedAt))
    expect(useTaskStore.getState().sections.some((x) => x.id === sec)).toBe(false)
    useTaskStore.getState().undoLastOperation()
    expect(
      useTaskStore
        .getState()
        .tasks.filter((t) => ids.includes(t.id))
        .map((t) => t.sectionId),
    ).toEqual([sec, sec])
  })
})
