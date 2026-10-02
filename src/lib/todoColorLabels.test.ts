import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { colorLabelText, todoColorLabels } from './todoColorLabels'

function task(over: Partial<Task>): Task {
  return {
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
        task({ color: SAGE, isTimeLog: true }),
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

  it('adds labels not on any task yet, with 0, when asked (drop targets while dragging)', () => {
    expect(todoColorLabels([task({ color: '#F6BF26' })], new Set(), presets, colors, true)).toEqual([
      { hex: SAGE, name: '授業', count: 0 },
      { hex: TOMATO, name: '就活', count: 0 },
      { hex: '#F6BF26', name: null, count: 1 },
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
