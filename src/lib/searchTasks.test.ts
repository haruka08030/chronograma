import { describe, expect, it } from 'vitest'
import { makeTask } from '../store/taskHelpers'
import type { Task } from '../types/task'
import { searchRecords, searchTasks } from './searchTasks'

const task = (title: string, extra: Partial<Task> = {}): Task => ({ ...makeTask({ title, listId: 'l' }, 0), ...extra }) as Task

describe('searchTasks / searchRecords', () => {
  const todo = task('数学の宿題')
  const event = task('数学の授業', { kind: 'event' })
  const log = task('勉強', { kind: 'log', tags: ['数学'], dueDate: '2026-10-01', startTime: '09:00' })
  const newer = task('数学', { kind: 'log', dueDate: '2026-10-03', startTime: '08:00' })
  const sleep = task('睡眠 数学の夢', { kind: 'sleep', dueDate: '2026-10-02', startTime: '23:00' })
  const deleted = task('数学 消した', { deletedAt: '2026-10-01T00:00:00Z' })
  const all = [todo, event, log, newer, sleep, deleted]

  it('To-Do と予定だけ（記録・睡眠・ゴミ箱は入れない）', () => {
    expect(searchTasks(all, ' 数学 ').map((x) => x.id)).toEqual([todo.id, event.id])
  })

  it('記録と睡眠は別に、新しい順（タグ＝分類でも当たる）', () => {
    expect(searchRecords(all, '数学').map((x) => x.id)).toEqual([newer.id, sleep.id, log.id])
  })

  it('空の語では何も返さない', () => {
    expect(searchTasks(all, '  ')).toEqual([])
    expect(searchRecords(all, '')).toEqual([])
  })
})
