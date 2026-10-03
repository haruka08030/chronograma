import { describe, expect, it } from 'vitest'
import type { Habit } from '../types/habit'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import type { Task } from '../types/task'
import {
  baselineFrom,
  mergeSnapshots,
  mergeWithoutBaseline,
  SYNC_INBOX_LIST_ID,
  syncedSnapshot,
  withoutDuplicateDefaults,
  type SyncSnapshot,
} from './syncMerge'
import { TASK_DEFAULTS } from './taskDefaults'

/**
 * 同期マージはデータ消失の最後の砦なので、
 * 「片方の端末の変更が消える」形の退行を具体的なシナリオで固定する。
 */

const T0 = '2026-09-01T00:00:00.000Z'
const T1 = '2026-09-02T00:00:00.000Z'
const T2 = '2026-09-03T00:00:00.000Z'

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: T0,
    updatedAt: T0,
    order: 0,
    listId: SYNC_INBOX_LIST_ID,
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    ...patch,
  }
}

function list(id: string, patch: Partial<TaskList> = {}): TaskList {
  return { id, name: id, color: '#888888', order: 0, ...patch }
}

function section(id: string, listId = SYNC_INBOX_LIST_ID): ListSection {
  return { id, listId, name: id, order: 0 }
}

function habit(id: string, patch: Partial<Habit> = {}): Habit {
  return {
    id,
    title: id,
    color: '#888888',
    timeMode: 'none',
    startTime: null,
    endTime: null,
    frequency: { type: 'daily' },
    createdAt: T0,
    updatedAt: T0,
    completedDates: [],
    archivedAt: null,
    ...patch,
  }
}

const inbox = list(SYNC_INBOX_LIST_ID, { name: '未分類' })

function snapshot(patch: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return { lists: [inbox], tasks: [], habits: [], sections: [], ...patch }
}

const titles = (s: SyncSnapshot) => s.tasks.map((t) => t.id).sort()

describe('mergeSnapshots', () => {
  it('前回同期に無いものは両側から残す（他端末の追加を消さない）', () => {
    const base = snapshot()
    const baseline = baselineFrom(base)
    const local = snapshot({ tasks: [task('local-new')] })
    const remote = snapshot({ tasks: [task('remote-new')] })

    const { merged, deletes } = mergeSnapshots(local, remote, baseline)

    expect(titles(merged)).toEqual(['local-new', 'remote-new'])
    expect(deletes.tasks).toEqual([])
  })

  it('両側で編集されたら updatedAt が新しい方を採用する', () => {
    const base = snapshot({ tasks: [task('t1')] })
    const baseline = baselineFrom(base)
    const local = snapshot({ tasks: [task('t1', { title: 'local', updatedAt: T1 })] })
    const remote = snapshot({ tasks: [task('t1', { title: 'remote', updatedAt: T2 })] })

    const { merged } = mergeSnapshots(local, remote, baseline)

    expect(merged.tasks).toHaveLength(1)
    expect(merged.tasks[0]!.title).toBe('remote')
  })

  it('updatedAt が同じならローカル（いま画面に見えているもの）を優先する', () => {
    const base = snapshot({ tasks: [task('t1')] })
    const baseline = baselineFrom(base)
    const local = snapshot({ tasks: [task('t1', { title: 'local', updatedAt: T1 })] })
    const remote = snapshot({ tasks: [task('t1', { title: 'remote', updatedAt: T1 })] })

    const { merged } = mergeSnapshots(local, remote, baseline)

    expect(merged.tasks[0]!.title).toBe('local')
  })

  it('Postgres 形式のタイムスタンプでも大小を正しく比べる', () => {
    const base = snapshot({ tasks: [task('t1')] })
    const baseline = baselineFrom(base)
    // 文字列比較だと '2026-09-03T00:00:00+00:00' < '2026-09-02T...Z' になってしまう
    const local = snapshot({ tasks: [task('t1', { title: 'local', updatedAt: T1 })] })
    const remote = snapshot({
      tasks: [task('t1', { title: 'remote', updatedAt: '2026-09-03T00:00:00.123456+00:00' })],
    })

    const { merged } = mergeSnapshots(local, remote, baseline)

    expect(merged.tasks[0]!.title).toBe('remote')
  })

  it('他端末で削除されたものは取り込む（ローカルで未編集なら消える）', () => {
    const base = snapshot({ tasks: [task('t1')] })
    const baseline = baselineFrom(base)
    const local = snapshot({ tasks: [task('t1')] })
    const remote = snapshot({ tasks: [] })

    const { merged } = mergeSnapshots(local, remote, baseline)

    expect(merged.tasks).toEqual([])
  })

  it('他端末で削除されても、その後ローカルで編集していれば残す', () => {
    const base = snapshot({ tasks: [task('t1')] })
    const baseline = baselineFrom(base)
    const local = snapshot({ tasks: [task('t1', { title: 'edited', updatedAt: T2 })] })
    const remote = snapshot({ tasks: [] })

    const { merged, deletes } = mergeSnapshots(local, remote, baseline)

    expect(merged.tasks).toHaveLength(1)
    expect(merged.tasks[0]!.title).toBe('edited')
    expect(deletes.tasks).toEqual([])
  })

  it('この端末で削除したものはサーバーからも消す', () => {
    const base = snapshot({ tasks: [task('t1')] })
    const baseline = baselineFrom(base)
    const local = snapshot({ tasks: [] })
    const remote = snapshot({ tasks: [task('t1')] })

    const { merged, deletes } = mergeSnapshots(local, remote, baseline)

    expect(merged.tasks).toEqual([])
    expect(deletes.tasks).toEqual(['t1'])
  })

  it('この端末で削除した後に他端末が編集していたら復活させる', () => {
    const base = snapshot({ tasks: [task('t1')] })
    const baseline = baselineFrom(base)
    const local = snapshot({ tasks: [] })
    const remote = snapshot({ tasks: [task('t1', { title: 'remote edit', updatedAt: T2 })] })

    const { merged, deletes } = mergeSnapshots(local, remote, baseline)

    expect(merged.tasks).toHaveLength(1)
    expect(merged.tasks[0]!.title).toBe('remote edit')
    expect(deletes.tasks).toEqual([])
  })

  it('開きっぱなしの端末が、他端末で増えたタスクを消さない', () => {
    // レビューで挙げた事故シナリオそのもの
    const base = snapshot({ tasks: [task('shared')] })
    const baseline = baselineFrom(base)
    const local = snapshot({ tasks: [task('shared')] })
    const remote = snapshot({ tasks: [task('shared'), task('added-elsewhere')] })

    const { merged, deletes } = mergeSnapshots(local, remote, baseline)

    expect(titles(merged)).toEqual(['added-elsewhere', 'shared'])
    expect(deletes.tasks).toEqual([])
  })

  it('空の baseline では両側を足し合わせ、何も削除しない', () => {
    const baseline = baselineFrom(snapshot())
    const local = snapshot({ tasks: [task('a')] })
    const remote = snapshot({ tasks: [task('b')] })

    const { merged, deletes } = mergeSnapshots(local, remote, baseline)

    expect(titles(merged)).toEqual(['a', 'b'])
    expect(deletes.tasks).toEqual([])
  })

  it('習慣の達成日は両方の端末の分を残す（行の勝ち負けで片方を消さない）', () => {
    const base = snapshot({ habits: [habit('h1')] })
    const baseline = baselineFrom(base)
    const local = snapshot({ habits: [habit('h1', { completedDates: ['2026-09-02'], updatedAt: T1 })] })
    const remote = snapshot({
      habits: [habit('h1', { completedDates: ['2026-09-03'], updatedAt: T2 })],
    })

    const { merged } = mergeSnapshots(local, remote, baseline)

    expect(merged.habits[0]!.completedDates).toEqual(['2026-09-02', '2026-09-03'])
    // ほかの端末にも行き渡るよう、勝った側より新しい時刻になる
    expect(Date.parse(merged.habits[0]!.updatedAt)).toBeGreaterThan(Date.parse(T2))
  })

  it('片方で外した達成日は外す（もう片方で付けた日は残す）', () => {
    const base = snapshot({ habits: [habit('h1', { completedDates: ['2026-09-01', '2026-09-02'] })] })
    const baseline = baselineFrom(base)
    // この端末で 9/1 を外し、ほかの端末で 9/3 を付けた
    const local = snapshot({ habits: [habit('h1', { completedDates: ['2026-09-02'], updatedAt: T2 })] })
    const remote = snapshot({ habits: [habit('h1', { completedDates: ['2026-09-01', '2026-09-02', '2026-09-03'], updatedAt: T1 })] })

    const { merged } = mergeSnapshots(local, remote, baseline)

    expect(merged.habits[0]!.completedDates).toEqual(['2026-09-02', '2026-09-03'])
  })

  it('前回同期の達成日の控えが無ければ、両方を合わせる', () => {
    const base = snapshot({ habits: [habit('h1')] })
    const { habitDates: _omit, ...oldBaseline } = baselineFrom(base)
    void _omit
    const local = snapshot({ habits: [habit('h1', { completedDates: ['2026-09-02'], updatedAt: T2 })] })
    const remote = snapshot({ habits: [habit('h1', { completedDates: ['2026-09-03'], updatedAt: T1 })] })

    const { merged } = mergeSnapshots(local, remote, oldBaseline)

    expect(merged.habits[0]!.completedDates).toEqual(['2026-09-02', '2026-09-03'])
  })
})

describe('同じ行を両方の端末で変えたとき（項目ごと）', () => {
  it('違う項目を変えたなら両方残す（スマホでタイトル・PC で完了）', () => {
    const base = snapshot({ tasks: [task('t1', { title: '課題', completed: false })] })
    const baseline = baselineFrom(base)
    const local = snapshot({ tasks: [task('t1', { title: '課題（第 3 回）', completed: false, updatedAt: T1 })] })
    const remote = snapshot({ tasks: [task('t1', { title: '課題', completed: true, updatedAt: T2 })] })

    const { merged } = mergeSnapshots(local, remote, baseline)

    expect(merged.tasks[0]).toMatchObject({ title: '課題（第 3 回）', completed: true })
    // 両方の変更を合わせた新しい版なので、ほかの端末にも行き渡るよう時刻を今にする
    expect(Date.parse(merged.tasks[0]!.updatedAt)).toBeGreaterThan(Date.parse(T2))
  })

  it('同じ項目を両方で変えたら新しいほう', () => {
    const base = snapshot({ tasks: [task('t1', { title: '課題' })] })
    const baseline = baselineFrom(base)
    const local = snapshot({ tasks: [task('t1', { title: 'こちら', updatedAt: T1 })] })
    const remote = snapshot({ tasks: [task('t1', { title: 'あちら', updatedAt: T2 })] })

    expect(mergeSnapshots(local, remote, baseline).merged.tasks[0]!.title).toBe('あちら')
  })

  it('片方だけ変えたなら、古い時刻でもその変更を残す', () => {
    const base = snapshot({ tasks: [task('t1', { title: '課題', priority: 'none' })] })
    const baseline = baselineFrom(base)
    // こちらは優先度だけ（新しい時刻）、あちらはタイトルだけ（古い時刻）
    const local = snapshot({ tasks: [task('t1', { title: '課題', priority: 'high', updatedAt: T2 })] })
    const remote = snapshot({ tasks: [task('t1', { title: '課題（改）', priority: 'none', updatedAt: T1 })] })

    expect(mergeSnapshots(local, remote, baseline).merged.tasks[0]).toMatchObject({ title: '課題（改）', priority: 'high' })
  })

  it('前回同期の項目の控えが無ければ、行ごと新しいほう（前の動き）', () => {
    const base = snapshot({ tasks: [task('t1', { title: '課題', completed: false })] })
    const { fields: _omit, ...oldBaseline } = baselineFrom(base)
    void _omit
    const local = snapshot({ tasks: [task('t1', { title: '課題（第 3 回）', completed: false, updatedAt: T1 })] })
    const remote = snapshot({ tasks: [task('t1', { title: '課題', completed: true, updatedAt: T2 })] })

    expect(mergeSnapshots(local, remote, oldBaseline).merged.tasks[0]).toMatchObject({ title: '課題', completed: true })
  })
})

describe('mergeSnapshots の参照整合性', () => {
  it('消えたリストを参照するタスクは未分類に付け替える', () => {
    const other = list('other-list')
    const base = snapshot({ lists: [inbox, other], tasks: [task('t1', { listId: other.id })] })
    const baseline = baselineFrom(base)
    // 他端末で other-list を削除。ローカルはそのリストのタスクを編集していた
    const local = snapshot({
      lists: [inbox, other],
      tasks: [task('t1', { listId: other.id, title: 'kept', updatedAt: T2 })],
    })
    const remote = snapshot({ lists: [inbox], tasks: [] })

    const { merged } = mergeSnapshots(local, remote, baseline)

    expect(merged.lists.map((l) => l.id)).toEqual([SYNC_INBOX_LIST_ID])
    expect(merged.tasks).toHaveLength(1)
    expect(merged.tasks[0]!.listId).toBe(SYNC_INBOX_LIST_ID)
  })

  it('消えた Canvas の古いリストのタスクとセクションは、未分類ではなく Canvas のリストへ', () => {
    const old = list('canvas-list-school.instructure.com')
    const canvas = list('canvas-list')
    const sec = section('canvas-course-school.instructure.com-101', old.id)
    const t1 = task('canvas-school.instructure.com-assignment-1', { listId: old.id, sectionId: sec.id })
    const base = snapshot({ lists: [inbox, old], sections: [sec], tasks: [t1] })
    const baseline = baselineFrom(base)
    // この端末で 1 つの Canvas リストにまとめた後、別の端末が古いリストのまま課題を書き換えていた
    const local = snapshot({ lists: [inbox, canvas], sections: [{ ...sec, listId: canvas.id }], tasks: [{ ...t1, listId: canvas.id }] })
    const remote = snapshot({ lists: [inbox, old], sections: [sec], tasks: [{ ...t1, title: 'edited', updatedAt: T2 }] })

    const { merged } = mergeSnapshots(local, remote, baseline)

    expect(merged.tasks[0]).toMatchObject({ title: 'edited', listId: 'canvas-list', sectionId: sec.id })
  })

  it('消えたセクションを参照するタスクはセクションなしにする', () => {
    const sec = section('sec1')
    const base = snapshot({ sections: [sec], tasks: [task('t1', { sectionId: sec.id })] })
    const baseline = baselineFrom(base)
    const local = snapshot({
      sections: [sec],
      tasks: [task('t1', { sectionId: sec.id, title: 'kept', updatedAt: T2 })],
    })
    const remote = snapshot({ sections: [], tasks: [] })

    const { merged } = mergeSnapshots(local, remote, baseline)

    expect(merged.sections).toEqual([])
    expect(merged.tasks[0]!.sectionId).toBeNull()
  })

  it('親が消えたサブタスクはルートに昇格させる', () => {
    const base = snapshot({ tasks: [task('parent'), task('child', { parentId: 'parent' })] })
    const baseline = baselineFrom(base)
    const local = snapshot({
      tasks: [task('parent'), task('child', { parentId: 'parent', title: 'kept', updatedAt: T2 })],
    })
    const remote = snapshot({ tasks: [] })

    const { merged } = mergeSnapshots(local, remote, baseline)

    expect(merged.tasks).toHaveLength(1)
    expect(merged.tasks[0]!.id).toBe('child')
    expect(merged.tasks[0]!.parentId).toBeNull()
  })

  it('未分類リストはサーバーから消さない', () => {
    const base = snapshot({ lists: [inbox] })
    const baseline = baselineFrom(base)
    const local = snapshot({ lists: [] })
    const remote = snapshot({ lists: [inbox] })

    const { merged, deletes } = mergeSnapshots(local, remote, baseline)

    expect(deletes.lists).toEqual([])
    expect(merged.lists.map((l) => l.id)).toEqual([SYNC_INBOX_LIST_ID])
  })
})

describe('リストの削除と他端末の追加が重なったとき', () => {
  it('消えたリストに他端末が足したセクションは、リストと一緒にサーバーから消す（残すとリストを消せない）', () => {
    const inbox: TaskList = { id: SYNC_INBOX_LIST_ID, name: '未分類', color: '#000', order: 0, updatedAt: T0 }
    const gone: TaskList = { id: 'L', name: 'ゼミ', color: '#000', order: 1, updatedAt: T0 }
    const sec: ListSection = { id: 'S', listId: 'L', name: '発表', order: 0, updatedAt: T1 }
    const baseline = baselineFrom({ lists: [inbox, gone], sections: [], tasks: [], habits: [] })
    const local: SyncSnapshot = { lists: [inbox], sections: [], tasks: [], habits: [] }
    const remote: SyncSnapshot = { lists: [inbox, gone], sections: [sec], tasks: [task('b', { listId: 'L', sectionId: 'S', updatedAt: T1 })], habits: [] }
    const { merged, deletes } = mergeSnapshots(local, remote, baseline)
    expect(deletes.lists).toEqual(['L'])
    expect(deletes.sections).toEqual(['S'])
    expect(merged.tasks.find((t) => t.id === 'b')).toMatchObject({ listId: SYNC_INBOX_LIST_ID, sectionId: null })
  })
})

describe('mergeWithoutBaseline（前回同期が無い端末の初回同期）', () => {
  it('送れていなかった手元のタスクを、古いサーバーで上書きして消さない', () => {
    const local = snapshot({ tasks: [task('old', { updatedAt: T1 }), task('unsynced-es', { createdAt: T2, updatedAt: T2 })] })
    const remote = snapshot({ tasks: [task('old'), task('from-phone')] })
    const merged = mergeWithoutBaseline(local, remote)
    expect(merged.tasks.map((t) => t.id).sort()).toEqual(['from-phone', 'old', 'unsynced-es'])
    expect(merged.tasks.find((t) => t.id === 'old')?.updatedAt).toBe(T1)
  })
})

describe('リスト・セクションの変更（更新時刻で新しい方を残す）', () => {
  it('他端末で変えたリストの種類を、変えていない端末が送り返して戻さない', () => {
    const before = list('wish', { kind: 'someday', updatedAt: T0 })
    const base = baselineFrom(snapshot({ lists: [inbox, before] }))
    const local = snapshot({ lists: [inbox, before] })
    const remote = snapshot({ lists: [inbox, list('wish', { kind: 'tasks', updatedAt: T1 })] })
    const { merged } = mergeSnapshots(local, remote, base)
    expect(merged.lists.find((l) => l.id === 'wish')?.kind).toBe('tasks')
  })

  it('他端末で消したセクションを、変えていない端末が生き返らせない', () => {
    const sec = { ...section('old'), updatedAt: T0 }
    const base = baselineFrom(snapshot({ sections: [sec] }))
    const { merged, deletes } = mergeSnapshots(snapshot({ sections: [sec] }), snapshot(), base)
    expect(merged.sections).toEqual([])
    expect(deletes.sections).toEqual([])
  })

  it('時刻を持つ前の控え（0）にあるセクションをこの端末で消したら、サーバーからも消す', () => {
    const base = baselineFrom(snapshot({ sections: [section('old')] }))
    const remote = snapshot({ sections: [{ ...section('old'), updatedAt: T2 }] })
    const { merged, deletes } = mergeSnapshots(snapshot(), remote, base)
    expect(merged.sections).toEqual([])
    expect(deletes.sections).toEqual(['old'])
  })
})

describe('withoutDuplicateDefaults（ログインせずに使っていた端末の初回同期）', () => {
  const inbox: TaskList = { id: SYNC_INBOX_LIST_ID, name: '未分類', color: '#000', order: 0 }
  const someday = (id: string): TaskList => ({ id, name: 'いつか', color: '#000', order: 1, kind: 'someday' })

  it('中身の無い初期リストは、アカウントに同じものがあれば外す', () => {
    const local: SyncSnapshot = { lists: [inbox, someday('local')], sections: [], tasks: [], habits: [] }
    const remote: SyncSnapshot = { lists: [inbox, someday('remote')], sections: [], tasks: [], habits: [] }
    expect(withoutDuplicateDefaults(local, remote).lists.map((l) => l.id)).toEqual([SYNC_INBOX_LIST_ID])
  })

  it('タスクが入っていれば残す', () => {
    const local: SyncSnapshot = { lists: [inbox, someday('local')], sections: [], tasks: [task('t', { listId: 'local' })], habits: [] }
    const remote: SyncSnapshot = { lists: [inbox, someday('remote')], sections: [], tasks: [], habits: [] }
    expect(withoutDuplicateDefaults(local, remote).lists.map((l) => l.id)).toEqual([SYNC_INBOX_LIST_ID, 'local'])
  })

  it('日本語と英語の端末でも、初期リストを二重にしない', () => {
    const local: SyncSnapshot = { lists: [inbox, { ...someday('local'), name: 'Someday' }], sections: [], tasks: [], habits: [] }
    const remote: SyncSnapshot = { lists: [inbox, someday('remote')], sections: [], tasks: [], habits: [] }
    expect(withoutDuplicateDefaults(local, remote).lists.map((l) => l.id)).toEqual([SYNC_INBOX_LIST_ID])
  })

  it('同じ種類でも、自分で名前を付けた空のリストは残す', () => {
    const local: SyncSnapshot = { lists: [inbox, { ...someday('local'), name: '行きたい場所' }], sections: [], tasks: [], habits: [] }
    const remote: SyncSnapshot = { lists: [inbox, someday('remote')], sections: [], tasks: [], habits: [] }
    expect(withoutDuplicateDefaults(local, remote).lists.map((l) => l.id)).toEqual([SYNC_INBOX_LIST_ID, 'local'])
  })

  it('自分で作ったふつうのリストは空でも残す', () => {
    const mine: TaskList = { id: 'mine', name: 'ゼミ', color: '#000', order: 3 }
    const local: SyncSnapshot = { lists: [inbox, mine], sections: [], tasks: [], habits: [] }
    const remote: SyncSnapshot = { lists: [inbox, { ...mine, id: 'other' }], sections: [], tasks: [], habits: [] }
    expect(withoutDuplicateDefaults(local, remote).lists.map((l) => l.id)).toEqual([SYNC_INBOX_LIST_ID, 'mine'])
  })
})

describe('syncedSnapshot（拒否された行を控えに入れない）', () => {
  it('a new row the server rejected stays on this device on the next sync', () => {
    const local = snapshot({ tasks: [task('ok', { updatedAt: T1 }), task('rejected', { updatedAt: T1 })] })
    const remote = snapshot()
    const synced = syncedSnapshot(local, remote, [{ table: 'tasks', id: 'rejected', op: 'upsert' }])
    // サーバーには ok だけが届いた
    const next = mergeSnapshots(local, snapshot({ tasks: [task('ok', { updatedAt: T1 })] }), baselineFrom(synced))
    expect(titles(next.merged)).toEqual(['ok', 'rejected'])
    expect(next.deletes.tasks).toEqual([])
  })

  it('an edit the server rejected is kept over the older server version', () => {
    const remote = snapshot({ tasks: [task('a', { title: 'old', updatedAt: T0 })] })
    const local = snapshot({ tasks: [task('a', { title: 'new', updatedAt: T1 })] })
    const synced = syncedSnapshot(local, remote, [{ table: 'tasks', id: 'a', op: 'upsert' }])
    expect(synced.tasks[0].title).toBe('old')
    const next = mergeSnapshots(local, remote, baselineFrom(synced))
    expect(next.merged.tasks[0].title).toBe('new')
  })

  it('returns the pushed snapshot as is when nothing was rejected', () => {
    const local = snapshot({ tasks: [task('a')] })
    expect(syncedSnapshot(local, snapshot(), [])).toBe(local)
  })
})
