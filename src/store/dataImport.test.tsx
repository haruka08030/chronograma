import { describe, expect, it } from 'vitest'
import { useTaskStore } from './taskStore'
import { INBOX_ID } from './storeConstants'
import { clearImportRollback, loadImportRollback, saveImportRollback } from '../lib/importRollback'
import { buildBackupPayload } from '../lib/backupFormat'

const st = () => useTaskStore.getState()
const titles = () => st().tasks.map((t) => t.title)

/** 別の端末で書き出したバックアップ（今の手元とは別の中身） */
function otherBackup() {
  const before = st()
  const s = useTaskStore.getState()
  s.addTask('バックアップの 1')
  const parent = s.addTask('バックアップの親')!
  s.addTask('バックアップの子', undefined, parent)
  const json = st().backupJson()
  useTaskStore.setState({ tasks: before.tasks })
  return json
}

function seedCurrent() {
  const s = st()
  s.addList('仕事', 'checklist')
  const list = st().lists.find((l) => l.name === '仕事')!
  s.addSection(list.id, '今週')
  s.addTask('今の 1')
  s.addTask('今の 2', list.id)
  s.addHabit({ title: '散歩', color: '#33B679', timeMode: 'none', startTime: null, endTime: null, frequency: { type: 'daily' } })
  s.setTimeLogTagPresets(['勉強', '仕事'])
  return list
}

describe('バックアップの取り込みと「取り込み前に戻す」', () => {
  it('取り込む前の全データを控え、再読み込みのあと（⌘Z が効かなくても）そっくり戻せる', () => {
    const backup = otherBackup()
    const list = seedCurrent()
    const before = st()

    expect(st().importData(backup)).toBe(true)
    expect(titles()).toEqual(['バックアップの 1', 'バックアップの親', 'バックアップの子'])
    expect(loadImportRollback()?.taskCount).toBe(2)

    // ⌘Z の履歴ではなく、localStorage の控えから戻す
    expect(st().restoreBeforeImport()).toBe(true)
    expect(titles()).toEqual(['今の 1', '今の 2'])
    expect(st().tasks.find((t) => t.title === '今の 2')?.listId).toBe(list.id)
    expect(st().lists.map((l) => l.id)).toEqual(before.lists.map((l) => l.id))
    expect(st().sections.map((x) => x.name)).toEqual(['今週'])
    expect(st().habits.map((h) => h.title)).toEqual(['散歩'])
    expect(st().timeLogTagPresets).toEqual(['勉強', '仕事'])
    // 戻した行は更新時刻を新しくする（同期で、取り込んだ側の行より古いと見なされて負けないように）
    const old = new Map(before.tasks.map((t) => [t.id, t.updatedAt]))
    for (const t of st().tasks) expect(t.updatedAt >= old.get(t.id)!).toBe(true)
    // 控えは 1 回で使い切る
    expect(loadImportRollback()).toBeNull()
    expect(st().restoreBeforeImport()).toBe(false)
  })

  it('取り込みは ⌘Z 1 回で戻る', () => {
    const backup = otherBackup()
    seedCurrent()
    st().importData(backup)
    expect(st().undoLastOperation()).toBe(true)
    expect(titles()).toEqual(['今の 1', '今の 2'])
  })

  it('読めないファイルは取り込まず、手元も控えも変えない', () => {
    seedCurrent()
    const tasks = st().tasks
    for (const bad of ['', '{', '[]', '{"tasks":"x"}', JSON.stringify({ hello: 1 })]) {
      expect(st().importData(bad)).toBe(false)
    }
    expect(st().tasks).toBe(tasks)
    expect(loadImportRollback()).toBeNull()
  })

  it('取り込んだ親子のつながりは保たれる（書き出し → 取り込みで行が欠けない）', () => {
    seedCurrent()
    const parent = st().addTask('親')!
    st().addTask('子', undefined, parent)
    const json = st().backupJson()
    const before = st().tasks.map((t) => ({ id: t.id, title: t.title, parentId: t.parentId, listId: t.listId }))
    st().resetLocalData()
    expect(st().tasks).toEqual([])
    expect(st().importData(json)).toBe(true)
    expect(st().tasks.map((t) => ({ id: t.id, title: t.title, parentId: t.parentId, listId: t.listId }))).toEqual(before)
  })

  it('控えが壊れていたら戻さずに控えを消す（手元はそのまま）', () => {
    seedCurrent()
    const tasks = st().tasks
    saveImportRollback({ json: '{broken', savedAt: '2026-10-01T00:00:00.000Z', taskCount: 3 })
    expect(st().restoreBeforeImport()).toBe(false)
    expect(st().tasks).toBe(tasks)
    expect(loadImportRollback()).toBeNull()
  })

  it('ログアウトなどで手元を空にしたら、前の人の控えも消す（次の人が戻せない）', () => {
    seedCurrent()
    st().importData(otherBackup())
    expect(loadImportRollback()).not.toBeNull()
    st().resetLocalData()
    expect(loadImportRollback()).toBeNull()
    expect(st().restoreBeforeImport()).toBe(false)
  })
})

describe('importRollback（控えの読み書き）', () => {
  it('形の違う控えは無いものとして扱う。件数が無ければ 0', () => {
    localStorage.setItem('chronograma-import-rollback-v1', '{"json":1,"savedAt":"x"}')
    expect(loadImportRollback()).toBeNull()
    localStorage.setItem('chronograma-import-rollback-v1', 'not json')
    expect(loadImportRollback()).toBeNull()
    const json = JSON.stringify(
      buildBackupPayload({ tasks: [], lists: [], habits: [], sections: [], timeLogTagPresets: [], logCategoryColors: {} }),
    )
    localStorage.setItem('chronograma-import-rollback-v1', JSON.stringify({ json, savedAt: '2026-10-01T00:00:00.000Z' }))
    expect(loadImportRollback()).toEqual({ json, savedAt: '2026-10-01T00:00:00.000Z', taskCount: 0 })
    clearImportRollback()
    expect(loadImportRollback()).toBeNull()
  })
})

describe('CSV の取り込み', () => {
  it('今のタスクの後ろに足し、リスト名（大文字小文字は問わない）で振り分け、知らないリストは未分類へ', () => {
    const list = seedCurrent()
    const existing = st().tasks
    const r = st().importTasksFromCsv('title,list,due,priority,tags\nA,仕事,2026/10/9,high,"x;y"\nB,ない,,,\n,仕事,,,\n')
    expect(r).toEqual({ imported: 2, skipped: 1, errors: [] })
    // 今あるタスクは 1 行も変えない
    for (const t of existing) expect(st().tasks.find((x) => x.id === t.id)).toBe(t)
    const a = st().tasks.find((t) => t.title === 'A')!
    const b = st().tasks.find((t) => t.title === 'B')!
    expect(a).toMatchObject({ listId: list.id, dueDate: '2026-10-09', priority: 'high', tags: ['x', 'y'], parentId: null })
    expect(b.listId).toBe(INBOX_ID)
    expect(Math.min(a.order, b.order)).toBeGreaterThan(Math.max(...existing.map((t) => t.order)))
    expect(new Set(st().tasks.map((t) => t.id)).size).toBe(st().tasks.length)
  })

  it('読めない CSV は何も足さない。足した分は ⌘Z で消える', () => {
    seedCurrent()
    const tasks = st().tasks
    expect(st().importTasksFromCsv('')).toEqual({ imported: 0, skipped: 0, errors: ['empty'] })
    expect(st().importTasksFromCsv('due,list\n2026-10-01,x').errors).toEqual(['missing_title_column'])
    expect(st().tasks).toBe(tasks)

    st().importTasksFromCsv('title\nX\nY')
    expect(titles()).toEqual(['今の 1', '今の 2', 'X', 'Y'])
    st().undoLastOperation()
    expect(titles()).toEqual(['今の 1', '今の 2'])
  })
})
