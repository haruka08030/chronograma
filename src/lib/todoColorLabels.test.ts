import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { recordLabelKey, recordLabelKeyHex } from './logCategoryColors'
import { colorLabelEditRows, colorLabelText, recordLabelKeyText, todoColorLabels } from './todoColorLabels'
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
const TOMATO = '#D50000'
const CUSTOM = '#123456'
// 「就活」= トマト、「授業」= セージ
const presets = ['授業', '就活']
const colors = { 授業: 'sage', 就活: 'tomato' }

describe('todoColorLabels', () => {
  it('lists colors put on tasks: labels in label order, then unnamed and custom colors', () => {
    const labels = todoColorLabels(
      [
        task({ color: CUSTOM }),
        task({ color: '#f6bf26' }),
        task({ color: TOMATO }),
        task({ color: SAGE }),
        task({ color: SAGE, completed: true }),
        task({ color: null }),
      ],
      new Set(),
      presets,
      colors,
    )
    expect(labels).toEqual([
      { hex: SAGE, name: '授業', count: 1 },
      { hex: TOMATO, name: '就活', count: 1 },
      { hex: '#F6BF26', name: null, count: 1 },
      { hex: CUSTOM, name: null, count: 1 },
    ])
  })

  it('keeps a color whose tasks are all done, with 0', () => {
    expect(todoColorLabels([task({ color: SAGE, completed: true })], new Set(), presets, colors)).toEqual([
      { hex: SAGE, name: '授業', count: 0 },
    ])
  })

  it('leaves out records, subtasks, deleted tasks and someday/checklist lists', () => {
    const labels = todoColorLabels(
      [
        task({ color: SAGE, kind: 'log' }),
        task({ color: SAGE, parentId: 'p' }),
        task({ color: SAGE, deletedAt: '2026-10-01T00:00:00.000Z' }),
        task({ color: SAGE, listId: 'shop' }),
      ],
      new Set(['shop']),
      presets,
      colors,
    )
    expect(labels).toEqual([])
  })

  it('adds labels not on any task yet, with 0, below the shown ones when asked (drop targets while dragging)', () => {
    expect(todoColorLabels([task({ color: TOMATO }), task({ color: '#F6BF26' })], new Set(), presets, colors, true)).toEqual([
      { hex: TOMATO, name: '就活', count: 1 },
      { hex: '#F6BF26', name: null, count: 1 },
      { hex: SAGE, name: '授業', count: 0 },
    ])
  })
})

describe('colorLabelText', () => {
  const t = (key: string) => `t:${key}`
  it('uses the label name, then the Google color name, then the hex', () => {
    expect(colorLabelText(SAGE, presets, colors, t)).toBe('授業')
    expect(colorLabelText('#F6BF26', presets, colors, t)).toBe('t:googleColors.banana')
    expect(colorLabelText('#123456', presets, colors, t)).toBe('#123456')
  })
})

describe('recordLabelKey', () => {
  const t = (key: string) => `t:${key}`
  it('groups a record by its label, then by its unnamed color, like the timeline color', () => {
    expect(recordLabelKey({ category: '就活', color: null }, presets, colors)).toBe('就活')
    // 名前の付いた色だけ持つ記録はそのラベルにまとめる
    expect(recordLabelKey({ category: null, color: SAGE.toLowerCase() }, presets, colors)).toBe('授業')
    expect(recordLabelKey({ category: null, color: '#f6bf26' }, presets, colors)).toBe('#F6BF26')
    expect(recordLabelKey({ category: null, color: null }, presets, colors)).toBe('')
  })
  it('gives the same color and name as the To-Do color labels', () => {
    expect(recordLabelKeyHex('#F6BF26', colors)).toBe('#F6BF26')
    expect(recordLabelKeyHex('授業', colors)).toBe(SAGE)
    expect(recordLabelKeyHex('', colors)).toBe('#9E9E9E')
    expect(recordLabelKeyText('#F6BF26', presets, colors, t)).toBe('t:googleColors.banana')
    expect(recordLabelKeyText('授業', presets, colors, t)).toBe('授業')
    expect(recordLabelKeyText('', presets, colors, t)).toBe('t:labels.none')
  })
})

describe('colorLabelEditRows（ナビの色ラベルのカード）', () => {
  const presets = ['勉強', 'バイト']
  const colors = { 勉強: 'sage', バイト: 'tomato' }

  it('ラベル名のある色は名前と色を変え、ほかのラベルはそのまま', () => {
    expect(colorLabelEditRows('#33B679', { name: 'Study', hex: '#039BE5' }, presets, colors)).toEqual([
      { from: '勉強', name: 'Study', color: 'peacock' },
      { from: 'バイト', name: 'バイト', color: 'tomato' },
    ])
  })

  it('名前を空にしても元の名前のまま（消すのは削除だけ）', () => {
    expect(colorLabelEditRows('#33B679', { name: ' ', hex: '#33B679' }, presets, colors)[0]).toEqual({
      from: '勉強',
      name: '勉強',
      color: 'sage',
    })
  })

  it('名前の無い色に名前を書くと、その色のラベルを作る', () => {
    expect(colorLabelEditRows('#039BE5', { name: '読書', hex: '#039BE5' }, presets, colors).at(-1)).toEqual({
      from: null,
      name: '読書',
      color: 'peacock',
      fromHex: '#039BE5',
    })
  })

  it('削除はその色のラベルの行を外す', () => {
    expect(colorLabelEditRows('#D50000', null, presets, colors)).toEqual([{ from: '勉強', name: '勉強', color: 'sage' }])
  })
})
