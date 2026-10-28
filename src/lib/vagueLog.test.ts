import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS, withLogCategory } from './taskDefaults'
import { isCountedLog, isVagueLog, readVague, withVague } from './vagueLog'
import { applyTaskPatch } from '../store/taskHelpers'
import { normalizeActiveTimer } from './timerSync'
import { parseBackupJson } from './backupFormat'
import { timerLogTask } from '../store/slices/timeLogs'

const task = (id: string, over: Partial<Task> = {}): Task => ({
  ...TASK_DEFAULTS,
  id,
  title: id,
  description: '',
  completed: true,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  order: 0,
  listId: 'inbox',
  sectionId: null,
  parentId: null,
  dueDate: '2026-10-27',
  startTime: '10:00',
  endTime: '11:00',
  priority: 'none',
  tags: [],
  recurrence: null,
  kind: 'log',
  ...over,
})

describe('「なんとなく」の記録（#657）', () => {
  it('記録だけが持ち、持つ記録はラベル・色を持たない', () => {
    const labeled = task('a', { category: '課題', tags: ['課題'], color: '#7986CB', labelId: 'x' })
    const v = withVague(labeled, true)
    expect(v).toMatchObject({ vague: true, category: null, tags: [], color: null })
    expect('labelId' in v).toBe(false)
    expect(isVagueLog(v)).toBe(true)
    expect(isCountedLog(v)).toBe(false)
    // 睡眠・To-Do は持たない（項目ごと無い）
    expect('vague' in withLogCategory({ ...task('s', { kind: 'sleep' }), vague: true })).toBe(false)
    expect('vague' in withLogCategory({ ...task('t', { kind: 'todo' }), vague: true })).toBe(false)
    // 外すと項目ごと無い
    expect('vague' in withVague(v, false)).toBe(false)
    expect(withVague(v, true)).toBe(v)
  })

  it('「なんとなく」を選ぶとラベルを外し、ラベル・色・ラベルなしを選び直すと「なんとなく」を外す', () => {
    const labeled = task('a', { category: '課題', tags: ['課題'] })
    const v = applyTaskPatch(labeled, { vague: true })
    expect(v).toMatchObject({ vague: true, category: null, tags: [], color: null })
    expect(applyTaskPatch(v, { category: 'ES', color: null })).toMatchObject({ category: 'ES', tags: ['ES'] })
    expect('vague' in applyTaskPatch(v, { category: 'ES', color: null })).toBe(false)
    expect('vague' in applyTaskPatch(v, { category: null, color: null })).toBe(false)
    expect('vague' in applyTaskPatch(v, { color: '#33B679' })).toBe(false)
    // 題名・時刻を直しても「なんとなく」のまま
    expect(applyTaskPatch(v, { title: '行き来', startTime: '09:30' }).vague).toBe(true)
  })

  it('サーバー・バックアップの値を読む', () => {
    expect(readVague(true)).toBe(true)
    expect(readVague('true')).toBe(true)
    expect(readVague(null)).toBe(false)
    const tasks = parseBackupJson(
      JSON.stringify({
        lists: [{ id: '__inbox__', name: 'Inbox' }],
        tasks: [
          { id: 'v', title: 'スマホ', listId: '__inbox__', kind: 'log', vague: true },
          { id: 'r', title: '雑用', list_id: '__inbox__', is_time_log: true, is_vague: true },
          { id: 't', title: '課題', listId: '__inbox__', kind: 'todo', vague: true },
        ],
      }),
    )!.tasks
    expect(tasks.map((t) => t.vague ?? null)).toEqual([true, true, null])
  })

  it('タイマーの「なんとなく」は付いているときだけ持ち、ラベル・色は持たない', () => {
    const base = { taskTitle: '行き来', startedAt: '2026-10-27T01:00:00.000Z', tags: ['課題'], color: '#7986CB' }
    expect(normalizeActiveTimer({ ...base, vague: true })).toMatchObject({ vague: true, tags: [], color: null })
    expect('vague' in normalizeActiveTimer(base)!).toBe(false)
  })

  it('「なんとなく」のタイマーを止めると「なんとなく」の記録（題名が睡眠でも睡眠にしない）', () => {
    const timer = { taskTitle: '睡眠', startedAt: '2026-10-27T01:00:00.000Z', tags: [], color: null, vague: true as const }
    const log = timerLogTask(timer, '2026-10-27T02:00:00.000Z', [])!
    expect(log).toMatchObject({ kind: 'log', vague: true, category: null })
  })
})
