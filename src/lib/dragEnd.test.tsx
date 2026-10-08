import { describe, expect, it } from 'vitest'
import type { DragEndEvent } from '@dnd-kit/core'
import { applyDragEnd } from './dragEnd'
import { useTaskStore } from '../store/taskStore'
import { INBOX_ID } from '../store/storeConstants'
import { TIMER_DROP_ID } from './timerDrop'

const st = () => useTaskStore.getState()
const task = (id: string) => st().tasks.find((t) => t.id === id)!
/** 親の子を順番どおりに（題名で） */
const childTitles = (parentId: string | null, listId?: string) =>
  st()
    .tasks.filter((t) => t.parentId === parentId && (listId === undefined || t.listId === listId))
    .sort((a, b) => a.order - b.order)
    .map((t) => t.title)

function drop(activeId: string, overId: string | null, opts: { delta?: { x: number; y: number }; group?: string[] } = {}) {
  applyDragEnd({
    active: { id: activeId, data: { current: opts.group ? { dragGroupRootIds: opts.group } : undefined }, rect: { current: {} } },
    over: overId ? { id: overId, rect: {}, data: { current: undefined }, disabled: false } : null,
    delta: opts.delta ?? { x: 0, y: 40 },
    activatorEvent: new Event('pointerdown'),
    collisions: null,
  } as unknown as DragEndEvent)
}

/** 新しいタスクは先頭に入るので、テストでは兄弟の最後に置き直す（画面で上から順に足したのと同じ並び） */
function add(title: string, listId?: string, parentId?: string) {
  const id = st().addTask(title, listId, parentId)!
  useTaskStore.setState((s) => {
    const me = s.tasks.find((t) => t.id === id)!
    const sibs = s.tasks.filter((t) => t.id !== id && t.parentId === me.parentId && t.listId === me.listId)
    const order = Math.max(0, ...sibs.map((t) => t.order)) + 1
    return { tasks: s.tasks.map((t) => (t.id === id ? { ...t, order } : t)) }
  })
  return id
}

function addList(name: string) {
  st().addList(name, 'checklist')
  return st().lists.find((l) => l.name === name)!.id
}

/** 親 P の下に子 3 つ */
function family() {
  const p = add('P')
  const c1 = add('c1', undefined, p)
  const c2 = add('c2', undefined, p)
  const c3 = add('c3', undefined, p)
  return { p, c1, c2, c3 }
}

describe('一覧のドラッグを離したとき（applyDragEnd）', () => {
  it('サブタスクを兄弟の上に落とすと、その位置へ。親は変わらない。⌘Z 1 回で戻る', () => {
    const { p, c1, c3 } = family()
    drop(`subtask::${c3}`, `subtask::${c1}`)
    expect(childTitles(p)).toEqual(['c3', 'c1', 'c2'])
    st().undoLastOperation()
    expect(childTitles(p)).toEqual(['c1', 'c2', 'c3'])
  })

  it('サブタスクを別のリストの親の子の上に落とすと、孫ごとそのリストへ移る（孫だけ元のリストに残らない）', () => {
    const { p, c1 } = family()
    const grand = add('孫', undefined, c1)
    const work = addList('仕事')
    const q = add('Q', work)
    const d1 = add('d1', undefined, q)
    drop(`subtask::${c1}`, `subtask::${d1}`)
    expect(task(c1)).toMatchObject({ parentId: q, listId: work })
    expect(task(grand)).toMatchObject({ parentId: c1, listId: work })
    expect(childTitles(q)).toEqual(['c1', 'd1'])
    expect(childTitles(p)).toEqual(['c2', 'c3'])
  })

  it('サブタスクをルートの行に落とすと、そのルートの最後の子になる', () => {
    const { c2 } = family()
    const r = add('R')
    add('r1', undefined, r)
    drop(`subtask::${c2}`, `task::${r}`)
    expect(childTitles(r)).toEqual(['r1', 'c2'])
  })

  it('ルートをサブタスクの上に落とすと、子ごとその兄弟になる', () => {
    const { p, c2 } = family()
    const r = add('R')
    const r1 = add('r1', undefined, r)
    drop(`task::${r}`, `subtask::${c2}`)
    expect(childTitles(p)).toEqual(['c1', 'R', 'c2', 'c3'])
    expect(task(r1).parentId).toBe(r)
  })

  it('自分の子の上に落としても入れ子にしない（親子が輪になって行が見えなくならない）', () => {
    const { p, c1 } = family()
    const tasks = st().tasks
    drop(`task::${p}`, `subtask::${c1}`)
    expect(st().tasks).toBe(tasks)
    expect(task(p).parentId).toBeNull()
  })

  it('入れ子の深さの上限を超える落とし方は無視する', () => {
    // 深さ 0..4 の鎖
    let parent = add('L0')
    const chain = [parent]
    for (let i = 1; i <= 4; i++) {
      parent = add(`L${i}`, undefined, parent)
      chain.push(parent)
    }
    const r = add('R')
    add('r1', undefined, r)
    // L4 の兄弟（深さ 4）にすると、R の子 r1 が深さ 5 になる
    const sib = add('L4b', undefined, chain[3])
    const before = st().tasks
    drop(`task::${r}`, `subtask::${sib}`)
    expect(st().tasks).toBe(before)
  })

  it('右へ動かすと直前の行の子になり、左へ動かすと親の直後のルートへ戻る', () => {
    const a = add('A')
    const b = add('B')
    const b1 = add('b1', undefined, b)
    add('C')
    drop(`task::${b}`, `task::${b}`, { delta: { x: 40, y: 2 } })
    expect(task(b).parentId).toBe(a)
    expect(task(b1).parentId).toBe(b)

    drop(`subtask::${b}`, `subtask::${b}`, { delta: { x: -40, y: 2 } })
    expect(task(b).parentId).toBeNull()
    expect(childTitles(null, INBOX_ID)).toEqual(['A', 'B', 'C'])
    expect(task(b1).parentId).toBe(b)
  })

  it('孫を左へ動かすと、祖父母の子として元の親の直後に入る', () => {
    const { p, c1 } = family()
    add('g1', undefined, c1)
    const g2 = add('g2', undefined, c1)
    drop(`subtask::${g2}`, null, { delta: { x: -40, y: 0 } })
    expect(task(g2).parentId).toBe(p)
    expect(childTitles(p)).toEqual(['c1', 'g2', 'c2', 'c3'])
    expect(childTitles(c1)).toEqual(['g1'])
  })

  it('複数選択でつかんでいるときは、横に動かしても入れ子にしない', () => {
    const a = add('A')
    const b = add('B')
    drop(`task::${b}`, `task::${b}`, { delta: { x: 40, y: 0 }, group: [a, b] })
    expect(task(b).parentId).toBeNull()
  })

  it('縦の動きが大きければ、右に動いていても入れ子にしない', () => {
    add('A')
    const b = add('B')
    drop(`task::${b}`, `task::${b}`, { delta: { x: 30, y: 60 } })
    expect(task(b).parentId).toBeNull()
  })

  it('リストに落とすと、子ごとそのリストへ移る。複数選択はまとめて移る', () => {
    const work = addList('仕事')
    const home = addList('家')
    const { p, c1 } = family()
    const x = add('X')
    const y = add('Y')
    drop(`task::${p}`, `drop::${work}`)
    expect(task(p).listId).toBe(work)
    expect(task(c1).listId).toBe(work)

    drop(`task::${x}`, `list::${home}`, { group: [x, y] })
    expect([task(x).listId, task(y).listId]).toEqual([home, home])

    drop(`task::${x}`, `mobile-drop::${work}`)
    expect(task(x).listId).toBe(work)
  })

  it('一覧の手動の並びで、ルートを別のルートの上に落とすとその位置へ', () => {
    useTaskStore.setState({ selectedView: 'all', selectedListId: null })
    const a = add('A')
    add('B')
    const c = add('C')
    drop(`task::${c}`, `task::${a}`)
    expect(childTitles(null)).toEqual(['C', 'A', 'B'])
  })

  it('リストとセクションの並べ替え。別のリストのセクションへは動かさない', () => {
    const work = addList('仕事')
    const home = addList('家')
    const ids = st()
      .lists.slice()
      .sort((x, y) => x.order - y.order)
      .map((l) => l.id)
    drop(`list::${home}`, `list::${ids[0]}`)
    expect(
      st()
        .lists.slice()
        .sort((x, y) => x.order - y.order)[0]!.id,
    ).toBe(home)

    const s1 = st().addSection(work, 's1')
    const s2 = st().addSection(work, 's2')
    const h1 = st().addSection(home, 'h1')
    const secOrder = () =>
      st()
        .sections.filter((s) => s.listId === work)
        .sort((x, y) => x.order - y.order)
        .map((s) => s.name)
    drop(`dragsec::${work}::${s2}`, `dropsec::${work}::${s1}`)
    expect(secOrder()).toEqual(['s2', 's1'])
    const sections = st().sections
    drop(`dragsec::${work}::${s1}`, `dropsec::${home}::${h1}`)
    expect(st().sections).toBe(sections)
  })

  it('計測の落とし先に落とすと計測を始め、行は動かさない', () => {
    const { p, c2 } = family()
    const tasks = st().tasks
    drop(`subtask::${c2}`, TIMER_DROP_ID, { delta: { x: 60, y: 0 } })
    expect(st().activeTimer?.taskId).toBe(c2)
    expect(st().tasks.filter((t) => t.kind !== 'log')).toEqual(tasks.filter((t) => t.kind !== 'log'))
    expect(childTitles(p)).toEqual(['c1', 'c2', 'c3'])
  })

  it('どこにも落とさなかった・自分の上に落としたときは何も変えない', () => {
    const { c1 } = family()
    const tasks = st().tasks
    drop(`subtask::${c1}`, null)
    drop(`subtask::${c1}`, `subtask::${c1}`)
    drop(`task::unknown`, `task::${c1}`)
    expect(st().tasks).toBe(tasks)
  })
})
