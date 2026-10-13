import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { dreamSteps, parseTierDropId, readSomedayTier, somedayTierOf, withDreamsFromSteps, withSomedayTier } from './somedayTier'

const task = (id: string, over: Partial<Task> = {}): Task => ({
  ...TASK_DEFAULTS,
  id,
  title: id,
  description: '',
  completed: false,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  order: 0,
  listId: 'wish',
  sectionId: null,
  parentId: null,
  dueDate: null,
  startTime: null,
  endTime: null,
  priority: 'none',
  tags: [],
  recurrence: null,
  ...over,
})

describe('somedayTier', () => {
  it('夢だけ項目を持ち、持たないものはやりたい', () => {
    expect(somedayTierOf(task('a'))).toBe('wish')
    const d = withSomedayTier(task('a'), 'dream')
    expect(somedayTierOf(d)).toBe('dream')
    expect('somedayTier' in withSomedayTier(d, 'wish')).toBe(false)
    const plain = task('b')
    expect(withSomedayTier(plain, null)).toBe(plain)
    expect(readSomedayTier('dream')).toBe('dream')
    expect(readSomedayTier('wish')).toBeNull()
    expect(parseTierDropId('tier::dream')).toBe('dream')
    expect(parseTierDropId('tier::x')).toBeNull()
  })

  it('夢の次の一歩は並び順で最初の済んでいない子。進み具合は済んだ子 / 全部（消した子は数えない）', () => {
    const tasks = [
      task('d', { somedayTier: 'dream' }),
      task('s1', { parentId: 'd', order: 1, completed: true }),
      task('s2', { parentId: 'd', order: 2, title: 'HSK 3 級' }),
      task('s3', { parentId: 'd', order: 3 }),
      task('s4', { parentId: 'd', order: 4, deletedAt: '2026-01-02T00:00:00Z' }),
    ]
    expect(dreamSteps(tasks, 'd')).toMatchObject({ next: { title: 'HSK 3 級' }, done: 1, total: 3 })
    expect(dreamSteps(tasks, 's1')).toBeNull()
  })

  it('前の版のデータ: いつかのリストの、子を持つルートの行は夢にする', () => {
    const tasks = [
      task('goal'),
      task('step', { parentId: 'goal' }),
      task('alone'),
      task('todo', { listId: '__inbox__' }),
      task('todoStep', { listId: '__inbox__', parentId: 'todo' }),
    ]
    const out = withDreamsFromSteps(tasks, new Set(['wish']))
    expect(out.map((t) => t.somedayTier ?? null)).toEqual(['dream', null, null, null, null])
    // 直すものが無ければ同じ配列
    expect(withDreamsFromSteps(out, new Set(['wish']))).toBe(out)
  })
})
