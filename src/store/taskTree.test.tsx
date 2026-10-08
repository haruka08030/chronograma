import { describe, expect, it } from 'vitest'
import { useTaskStore } from './taskStore'
import { INBOX_ID } from './storeConstants'

const st = () => useTaskStore.getState()
const task = (id: string) => st().tasks.find((t) => t.id === id)!
const roots = (listId: string) =>
  st()
    .tasks.filter((t) => t.parentId === null && t.listId === listId && t.kind !== 'log')
    .sort((a, b) => a.order - b.order)
    .map((t) => t.title)

function addList(name: string) {
  st().addList(name, 'checklist')
  return st().lists.find((l) => l.name === name)!.id
}

describe('サブタスクの付け外しとリスト間の移動（taskTree）', () => {
  it('リストへ移すと、ルートは移した先の最後に入り、子・孫も同じリストへ（セクションは外す）', () => {
    const work = addList('仕事')
    const sec = st().addSection(work, '今週')
    st().addTask('W1', work)
    const p = st().addTask('P')!
    const c = st().addTask('c', undefined, p)!
    const g = st().addTask('g', undefined, c)!
    useTaskStore.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === p ? { ...t, sectionId: sec } : t)) }))

    expect(st().moveTaskToList(p, work)).toMatchObject({ moved: true, listId: work })
    expect(roots(work)).toEqual(['W1', 'P'])
    for (const id of [p, c, g]) expect(task(id)).toMatchObject({ listId: work, sectionId: null })
    expect(task(c).parentId).toBe(p)
    expect(task(g).parentId).toBe(c)

    // 同じリストへは何もしない（履歴も積まない）
    const tasks = st().tasks
    expect(st().moveTaskToList(p, work)).toEqual({ moved: false })
    expect(st().tasks).toBe(tasks)
  })

  it('まとめて移すとき、子を一緒に選んでいても子だけを親から引き離さない', () => {
    const work = addList('仕事')
    const a = st().addTask('A')!
    const a1 = st().addTask('a1', undefined, a)!
    const b = st().addTask('B')!
    const r = st().moveTasksToList([a, a1, b, a], work)
    expect(r).toMatchObject({ moved: true, count: 2 })
    expect(task(a1)).toMatchObject({ parentId: a, listId: work })
    expect([task(a).listId, task(b).listId]).toEqual([work, work])
    expect(new Set([task(a).order, task(b).order]).size).toBe(2)
  })

  it('サブタスクをルートへ上げると、親の直後・親と同じセクションに入る。残った兄弟の並びは詰める', () => {
    const work = addList('仕事')
    const sec = st().addSection(work, '今週')
    const p = st().addTask('P', work)!
    useTaskStore.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === p ? { ...t, sectionId: sec } : t)) }))
    const c1 = st().addTask('c1', undefined, p)!
    const c2 = st().addTask('c2', undefined, p)!
    st().promoteSubtaskToRoot(c2)
    expect(task(c2)).toMatchObject({ parentId: null, listId: work, sectionId: sec })
    expect(task(c1).parentId).toBe(p)
    expect(roots(work)).toEqual(['P', 'c2'])
    // ⌘Z で元の親の子に戻る
    st().undoLastOperation()
    expect(task(c2).parentId).toBe(p)
  })

  it('記録（ログ）は入れ子にもルートへの昇格にも使わない', () => {
    const p = st().addTask('P')!
    const c = st().addTask('c', undefined, p)!
    const base = task(p)
    useTaskStore.setState((s) => ({
      tasks: [
        ...s.tasks,
        { ...base, id: 'log-root', title: '記録', kind: 'log' },
        { ...base, id: 'log-child', title: '記録 2', kind: 'log', parentId: p },
      ],
    }))
    const tasks = st().tasks
    st().nestRootUnderParent(p, 'log-root', null)
    st().nestRootUnderParent('log-root', p, null)
    st().moveSubtaskInList('log-child', p, null)
    st().moveSubtaskInList(c, 'log-root', null)
    st().promoteSubtaskToRoot('log-child')
    expect(st().tasks).toBe(tasks)
  })

  it('並べ替えでセクションごと別のリストへ移すと、子もそのリストへ付いていく', () => {
    const work = addList('仕事')
    const sec = st().addSection(work, '今週')
    const p = st().addTask('P')!
    const c = st().addTask('c', undefined, p)!
    st().reorderManualRootTasks([p], { taskIds: [p], sectionId: sec, listId: work })
    expect(task(p)).toMatchObject({ listId: work, sectionId: sec })
    expect(task(c)).toMatchObject({ listId: work, parentId: p })
    expect(roots(INBOX_ID)).toEqual([])
  })
})
