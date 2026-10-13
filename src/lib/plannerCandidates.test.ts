import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { DEFAULT_CANDIDATE_VIEW, readCandidateView, sortCandidates } from './plannerCandidates'
import { filterTasks as filterCandidates } from './taskFilter'
import { TASK_DEFAULTS } from './taskDefaults'

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    kind: 'todo',
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
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
  }) as Task

const ids = (tasks: Task[]) => tasks.map((t) => t.id)

describe('今日やる候補の絞り込み', () => {
  const pool = [
    task('a', { listId: 'school', priority: 'high', estimateMinutes: 20, color: '#33b679', tags: ['ES'] }),
    task('b', { listId: 'job', priority: 'medium', estimateMinutes: 90 }),
    task('c', { listId: 'school', priority: 'low', estimateMinutes: null }),
  ]

  it('何も選んでいなければ全部', () => {
    expect(ids(filterCandidates(pool, DEFAULT_CANDIDATE_VIEW))).toEqual(['a', 'b', 'c'])
  })

  it('リスト・ラベル（大文字で比べる）・タグで絞る', () => {
    expect(ids(filterCandidates(pool, { ...DEFAULT_CANDIDATE_VIEW, listId: 'school' }))).toEqual(['a', 'c'])
    expect(ids(filterCandidates(pool, { ...DEFAULT_CANDIDATE_VIEW, color: '#33B679' }))).toEqual(['a'])
    expect(ids(filterCandidates(pool, { ...DEFAULT_CANDIDATE_VIEW, tag: 'ES' }))).toEqual(['a'])
  })

  it('優先度は「高のみ」「中以上」', () => {
    expect(ids(filterCandidates(pool, { ...DEFAULT_CANDIDATE_VIEW, priority: 'high' }))).toEqual(['a'])
    expect(ids(filterCandidates(pool, { ...DEFAULT_CANDIDATE_VIEW, priority: 'medium' }))).toEqual(['a', 'b'])
  })

  it('見積もりは「あり」と「〜分以内」（見積もりなしは入れない）', () => {
    expect(ids(filterCandidates(pool, { ...DEFAULT_CANDIDATE_VIEW, estimate: 'set' }))).toEqual(['a', 'b'])
    expect(ids(filterCandidates(pool, { ...DEFAULT_CANDIDATE_VIEW, estimate: 30 }))).toEqual(['a'])
  })
})

describe('今日やる候補の並び順', () => {
  it('締切順は渡した順のまま', () => {
    const pool = [task('x', { dueDate: '2026-10-09' }), task('y', { dueDate: '2026-10-08' })]
    expect(ids(sortCandidates(pool, 'dueDate'))).toEqual(['x', 'y'])
  })

  it('優先度の高い順、同じなら締切の近い順（締切なしは後ろ）', () => {
    const pool = [
      task('none', { priority: 'none' }),
      task('high-late', { priority: 'high', dueDate: '2026-10-20' }),
      task('high-nodue', { priority: 'high' }),
      task('high-soon', { priority: 'high', dueDate: '2026-10-08' }),
    ]
    expect(ids(sortCandidates(pool, 'priority'))).toEqual(['high-soon', 'high-late', 'high-nodue', 'none'])
  })

  it('見積もりが短い順、見積もりなしは最後', () => {
    const pool = [task('none', { estimateMinutes: null }), task('60', { estimateMinutes: 60 }), task('15', { estimateMinutes: 15 })]
    expect(ids(sortCandidates(pool, 'estimate'))).toEqual(['15', '60', 'none'])
  })

  it('作成日の新しい順', () => {
    const pool = [task('old', { createdAt: '2026-09-01T00:00:00Z' }), task('new', { createdAt: '2026-10-01T00:00:00Z' })]
    expect(ids(sortCandidates(pool, 'createdAt'))).toEqual(['new', 'old'])
  })
})

describe('保存した並び順・絞り込みを読む', () => {
  it('既定は優先度順。以前の既定だった締切順（due）も優先度順に戻す', () => {
    expect(DEFAULT_CANDIDATE_VIEW.sort).toBe('priority')
    expect(readCandidateView({ sort: 'due' })?.sort).toBe('priority')
    expect(readCandidateView({ sort: 'dueDate' })?.sort).toBe('dueDate')
  })

  it('合わない値は既定に戻し、形が違えば読まない', () => {
    expect(readCandidateView(null)).toBeNull()
    expect(readCandidateView({ sort: 'title', listId: 3, color: '#33b679', priority: 'low', estimate: 45 })).toEqual({
      ...DEFAULT_CANDIDATE_VIEW,
      color: '#33B679',
    })
    expect(readCandidateView({ sort: 'estimate', estimate: 30, tag: 'ES' })).toEqual({
      ...DEFAULT_CANDIDATE_VIEW,
      sort: 'estimate',
      estimate: 30,
      tag: 'ES',
    })
  })
})
