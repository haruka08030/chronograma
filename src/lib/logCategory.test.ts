import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { frequentLogs, inferLogCategory, logTitleSuggestions } from './logCategory'
import { logLabelFromTask } from './logCategoryColors'
import { TASK_DEFAULTS } from './taskDefaults'

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
    listId: 'inbox',
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

const SAGE = '#33B679'
const presets = ['就活', '課題']
const colors = { 就活: SAGE, 課題: '#D50000' }

describe('To-Do から記録を作るときの分類', () => {
  it('ラベル（色に付けた名前）を分類として引き継ぐ', () => {
    expect(logLabelFromTask(task({ color: SAGE.toLowerCase() }), presets, colors)).toEqual({ tags: ['就活'], color: null })
  })

  it('タグは分類にしない', () => {
    expect(logLabelFromTask(task({ tags: ['メモ'], color: null }), presets, colors)).toEqual({ tags: [], color: null })
  })

  it('名前の無い色は、色だけ引き継ぐ', () => {
    expect(logLabelFromTask(task({ color: '#123456' }), presets, colors)).toEqual({ tags: [], color: '#123456' })
  })

  it('タイマーの元タスクからも、タグではなくラベルで引く', () => {
    const categoryHexes = presets.map((n) => [n, colors[n as keyof typeof colors]] as const)
    const tagged = task({ tags: ['メモ'] })
    const labeled = task({ tags: ['メモ'], color: SAGE })
    expect(inferLogCategory([tagged], 'ES', { sourceTaskId: tagged.id, categoryHexes })).toBeNull()
    expect(inferLogCategory([labeled], 'ES', { sourceTaskId: labeled.id, categoryHexes })).toBe('就活')
  })
})

describe('よく使う記録（ワンタップ再開）', () => {
  const log = (title: string, dueDate: string) => task({ kind: 'log', title, dueDate, startTime: '10:00', endTime: '11:00' })

  it('直近 30 日の回数が多い順。直前の 1 回だけの記録に押し出されない', () => {
    const tasks = [
      log('dev', '2026-10-01'),
      log('dev', '2026-10-03'),
      log('dev', '2026-10-05'),
      log('勉強', '2026-10-02'),
      log('勉強', '2026-10-04'),
      log('買い物', '2026-10-07'),
    ]
    expect(frequentLogs(tasks, 2, '2026-10-07').map((r) => r.title)).toEqual(['dev', '勉強'])
  })

  it('同じ回数なら新しい順。30 日より前の回数は数えない', () => {
    const tasks = [
      log('読書', '2026-08-01'),
      log('読書', '2026-08-02'),
      log('読書', '2026-08-03'),
      log('dev', '2026-10-01'),
      log('勉強', '2026-10-05'),
    ]
    expect(frequentLogs(tasks, 3, '2026-10-07').map((r) => r.title)).toEqual(['勉強', 'dev', '読書'])
  })
})

describe('記録の名前の候補', () => {
  const log = (title: string, dueDate: string, startTime = '10:00', endTime = '11:00', tags: string[] = []) =>
    task({ kind: 'log', title, dueDate, startTime, endTime, tags, category: tags[0] ?? null })
  const titles = (tasks: Task[], q: string) => logTitleSuggestions(tasks, q, 3, '2026-10-07').map((r) => r.title)

  it('打った文字で始まるもの → 単語の頭 → 途中に含むもの。大文字・全角は区別しない', () => {
    const tasks = [log('lab stat', '2026-10-06'), log('STAT 勉強', '2026-10-01'), log('ecstatic', '2026-10-06')]
    expect(titles(tasks, 'ｓｔ')).toEqual(['STAT 勉強', 'lab stat', 'ecstatic'])
  })

  it('同じ段の中はよく使う順。空欄と、打ったものと同じタイトルは出さない', () => {
    const tasks = [
      log('STAT 演習', '2026-10-06'),
      log('STAT 勉強', '2026-10-01'),
      log('STAT 勉強', '2026-10-02'),
      log('STAT', '2026-10-05'),
    ]
    expect(titles(tasks, 'stat')).toEqual(['STAT 勉強', 'STAT 演習'])
    expect(titles(tasks, ' ')).toEqual([])
  })

  it('カタカナとひらがなは同じに見る', () => {
    expect(titles([log('スタディ', '2026-10-06')], 'すた')).toEqual(['スタディ'])
  })

  it('ラベルといつもの長さ（新しい 10 件の中央値、5 分単位）を一緒に返す', () => {
    const tasks = [
      log('ES', '2026-10-01', '10:00', '11:30', ['就活']),
      log('ES', '2026-10-02', '10:00', '11:00', ['就活']),
      log('ES', '2026-10-03', '23:30', '01:02', ['就活']),
    ]
    expect(logTitleSuggestions(tasks, 'e', 3, '2026-10-07')).toEqual([{ title: 'ES', category: '就活', typicalMinutes: 90 }])
  })
})
