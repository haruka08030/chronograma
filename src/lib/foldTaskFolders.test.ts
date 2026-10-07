import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import { INBOX_ID } from '../store/storeConstants'
import { foldTaskFolders, needsFold, type FoldState } from './foldTaskFolders'
import { categoryHex } from './logCategoryColors'
import { TASK_DEFAULTS } from './taskDefaults'

const NOW = '2026-10-05T00:00:00.000Z'
const SAGE = '#33B679'
const TOMATO = '#D50000'

function task(over: Partial<Task>): Task {
  return {
    ...TASK_DEFAULTS,
    id: Math.random().toString(36).slice(2),
    title: 't',
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    order: 0,
    listId: INBOX_ID,
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    ...over,
  }
}

const list = (id: string, name: string, color: string, kind?: TaskList['kind']): TaskList => ({ id, name, color, order: 0, kind })

function state(over: Partial<FoldState>): FoldState {
  return {
    lists: [list(INBOX_ID, '', '#7986CB')],
    sections: [],
    tasks: [],
    timeLogTagPresets: [],
    logCategoryColors: {},
    ...over,
  }
}

describe('foldTaskFolders', () => {
  it('畳むものが無ければ null（いつか・チェックリストは残す）', () => {
    const s = state({
      lists: [list(INBOX_ID, '', '#7986CB'), list('w', 'いつか', SAGE, 'someday'), list('c', '買い物', SAGE, 'checklist')],
    })
    expect(needsFold(s)).toBe(false)
    expect(foldTaskFolders(s, NOW)).toBeNull()
  })

  it('フォルダのタスクを未分類へ移し、フォルダ名をその色のラベルにする', () => {
    const t = task({ listId: 'f', sectionId: 'sec' })
    const sub = task({ listId: 'f', parentId: t.id })
    const out = foldTaskFolders(
      state({
        lists: [list(INBOX_ID, '', '#7986CB'), list('f', 'ゼミ', SAGE)],
        sections: [{ id: 'sec', listId: 'f', name: '発表', order: 0 }],
        tasks: [t, sub],
      }),
      NOW,
    )!
    expect(out.lists.map((l) => l.id)).toEqual([INBOX_ID])
    expect(out.sections).toEqual([])
    expect(out.timeLogTagPresets).toEqual(['ゼミ'])
    expect(categoryHex('ゼミ', out.logCategoryColors)).toBe(SAGE)
    const [ft, fsub] = out.tasks
    expect(ft).toMatchObject({ listId: INBOX_ID, sectionId: null, color: SAGE, updatedAt: NOW })
    // 子は色を持たない（親のラベルで分かる）
    expect(fsub).toMatchObject({ listId: INBOX_ID, color: null })
  })

  it('色を付けていたタスクはその色のまま', () => {
    const t = task({ listId: 'f', color: TOMATO })
    const out = foldTaskFolders(state({ lists: [list(INBOX_ID, '', '#7986CB'), list('f', 'ゼミ', SAGE)], tasks: [t] }), NOW)!
    expect(out.tasks[0]!.color).toBe(TOMATO)
  })

  it('フォルダの色にもうラベル名があれば、色はそのまま・フォルダ名は付けない', () => {
    const t = task({ listId: 'f' })
    const out = foldTaskFolders(
      state({
        lists: [list(INBOX_ID, '', '#7986CB'), list('f', 'ゼミ', SAGE)],
        tasks: [t],
        timeLogTagPresets: ['勉強'],
        logCategoryColors: { 勉強: 'sage' },
      }),
      NOW,
    )!
    expect(out.timeLogTagPresets).toEqual(['勉強'])
    expect(out.tasks[0]!.color).toBe(SAGE)
  })

  it('フォルダ名と同じラベルがあれば、そのラベルの色', () => {
    const t = task({ listId: 'f' })
    const out = foldTaskFolders(
      state({
        lists: [list(INBOX_ID, '', '#7986CB'), list('f', 'ゼミ', SAGE)],
        tasks: [t],
        timeLogTagPresets: ['ゼミ'],
        logCategoryColors: { ゼミ: 'tomato' },
      }),
      NOW,
    )!
    expect(out.tasks[0]!.color).toBe(TOMATO)
    expect(out.timeLogTagPresets).toEqual(['ゼミ'])
  })

  it('Canvas の課題は科目のタグだけで、ラベルは付けない', () => {
    const a = task({ listId: 'canvas-list', tags: ['統計学'] })
    const b = task({ listId: 'canvas-list', tags: [] })
    const out = foldTaskFolders(state({ lists: [list(INBOX_ID, '', '#7986CB'), list('canvas-list', 'Canvas', SAGE)], tasks: [a, b] }), NOW)!
    expect(out.timeLogTagPresets).toEqual([])
    expect(out.tasks.map((t) => t.color)).toEqual([null, null])
    expect(out.tasks[0]!.tags).toEqual(['統計学'])
  })

  it('未分類のセクションも外す（ほかのリストのタスクは触らない）', () => {
    const t = task({ sectionId: 'in' })
    const w = task({ listId: 'w', sectionId: 'ws' })
    const out = foldTaskFolders(
      state({
        lists: [list(INBOX_ID, '', '#7986CB'), list('w', 'いつか', SAGE, 'someday')],
        sections: [
          { id: 'in', listId: INBOX_ID, name: 'a', order: 0 },
          { id: 'ws', listId: 'w', name: 'b', order: 0 },
        ],
        tasks: [t, w],
      }),
      NOW,
    )!
    expect(out.sections.map((s) => s.id)).toEqual(['ws'])
    expect(out.tasks[0]).toMatchObject({ sectionId: null, color: null })
    expect(out.tasks[1]).toBe(w)
  })
})
