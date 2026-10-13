import { describe, expect, it } from 'vitest'
import { useTaskStore } from './taskStore'
import { INBOX_ID } from './storeConstants'
import { IMPORT_ROLLBACK_KEEP_DAYS, clearImportRollback, loadImportRollback, saveImportRollback } from '../lib/importRollback'
import { buildBackupPayload } from '../lib/backupFormat'
import { categoryHex } from '../lib/logCategoryColors'
import { legacyLabelId } from '../lib/labelIds'
import todoistProject from '../lib/fixtures/todoist-project.csv?raw'

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
    saveImportRollback({ json: '{broken', savedAt: new Date().toISOString(), taskCount: 3 })
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

describe('バックアップのラベルの id（#365）', () => {
  const rec = (id: string, category: string, over: Record<string, unknown> = {}) => ({
    id,
    title: id,
    listId: INBOX_ID,
    kind: 'log',
    category,
    tags: [category],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  })

  it('書き出し → 取り込みで、名前を変えたラベルの id と行の id がそのまま残る', () => {
    const math = legacyLabelId('数学')
    const json = JSON.stringify(
      buildBackupPayload({
        tasks: [rec('r1', '数学II', { labelId: math }) as never],
        lists: [{ id: INBOX_ID, name: 'Inbox', color: '#7986CB', order: 0 }],
        habits: [],
        sections: [],
        timeLogTagPresets: ['数学II'],
        logCategoryColors: { 数学II: 'tomato' },
        logLabelIds: { 数学II: math },
      }),
    )
    expect(st().importData(json)).toBe(true)
    expect(st().logLabelIds).toEqual({ 数学II: math })
    expect(st().tasks[0]).toMatchObject({ category: '数学II', labelId: math })
    expect(JSON.parse(st().backupJson()).logLabelIds).toEqual({ 数学II: math })
  })

  it('前の版のバックアップ（id が無い）は、記録は分類名・To-Do は色から id を付ける', () => {
    const json = JSON.stringify({
      tasks: [rec('r1', '英語'), { id: 't1', title: 't1', listId: INBOX_ID, color: categoryHex('英語', { 英語: 'sage' }) }],
      lists: [{ id: INBOX_ID, name: 'Inbox', color: '#7986CB', order: 0 }],
      timeLogTagPresets: ['英語'],
      logCategoryColors: { 英語: 'sage' },
    })
    expect(st().importData(json)).toBe(true)
    expect(st().logLabelIds).toEqual({})
    expect(st().tasks.map((t) => t.labelId)).toEqual([legacyLabelId('英語'), legacyLabelId('英語')])
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
    const savedAt = new Date().toISOString()
    localStorage.setItem('chronograma-import-rollback-v1', JSON.stringify({ json, savedAt }))
    expect(loadImportRollback()).toEqual({ json, savedAt, taskCount: 0 })
    clearImportRollback()
    expect(loadImportRollback()).toBeNull()
  })

  it(`控えは ${IMPORT_ROLLBACK_KEEP_DAYS} 日たったら捨てる（全データの写しを残し続けない）`, () => {
    const savedAt = '2026-10-01T00:00:00.000Z'
    saveImportRollback({ json: '{}', savedAt, taskCount: 1 })
    const day = 24 * 60 * 60_000
    expect(loadImportRollback(Date.parse(savedAt) + IMPORT_ROLLBACK_KEEP_DAYS * day - 1)).not.toBeNull()
    expect(loadImportRollback(Date.parse(savedAt) + IMPORT_ROLLBACK_KEEP_DAYS * day + 1)).toBeNull()
    expect(localStorage.getItem('chronograma-import-rollback-v1')).toBeNull()
  })

  it('控えには持ち主（取り込んだときの dataOwner）を付ける', () => {
    st().setDataOwner('u1')
    seedCurrent()
    st().importData(otherBackup())
    expect(loadImportRollback()?.owner).toBe('u1')
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

  it('リスト名が同じ名前のラベルならその色を付け、Inbox はラベルなし。知らない名前は選んだときだけラベルを作る', () => {
    seedCurrent()
    const csv = 'title,list\nA,勉強\nB,Inbox\nC,趣味\nD,趣味\n'
    st().importTasksFromCsv(csv)
    const byTitle = (t: string) =>
      st()
        .tasks.filter((x) => x.title === t)
        .at(-1)!
    expect(byTitle('A')).toMatchObject({ listId: INBOX_ID, color: categoryHex('勉強', st().logCategoryColors) })
    expect(byTitle('B')).toMatchObject({ listId: INBOX_ID, color: null })
    // 選ばなければラベルは作らない
    expect(byTitle('C').color).toBeNull()
    expect(st().timeLogTagPresets).toEqual(['勉強', '仕事'])

    st().importTasksFromCsv(csv, { unknownLists: 'label' })
    expect(st().timeLogTagPresets).toEqual(['勉強', '仕事', '趣味'])
    const hobby = categoryHex('趣味', st().logCategoryColors)
    expect(byTitle('C').color).toBe(hobby)
    expect(byTitle('D').color).toBe(hobby)
    // 作ったラベルも ⌘Z 1 回で消える
    st().undoLastOperation()
    expect(st().timeLogTagPresets).toEqual(['勉強', '仕事'])
  })

  it('Todoist の CSV はファイル名をラベルにし、締切の時刻も入れる', () => {
    seedCurrent()
    const r = st().importTasksFromCsv(todoistProject, { fileName: 'ゼミ.csv', unknownLists: 'label' })
    expect(r).toEqual({ imported: 4, skipped: 0, errors: [] })
    const report = st().tasks.find((t) => t.title === 'レポートを出す')!
    expect(report).toMatchObject({
      dueDate: '2026-10-20',
      dueTime: '17:00',
      priority: 'high',
      tags: ['大学', '提出'],
      color: categoryHex('ゼミ', st().logCategoryColors),
    })
    expect(st().timeLogTagPresets).toContain('ゼミ')
  })
})
