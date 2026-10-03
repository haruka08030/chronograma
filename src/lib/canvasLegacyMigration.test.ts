import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { migrateLegacyCanvasIds } from './canvasLegacyMigration'

const T0 = '2026-10-01T00:00:00.000Z'
const NOW = '2026-10-03T00:00:00.000Z'
const HOST = 'school.instructure.com'
const URL1 = `https://${HOST}/courses/101/assignments/1`

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: T0,
    updatedAt: T0,
    order: 0,
    listId: 'canvas-list',
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    ...patch,
  }
}

const lists: TaskList[] = [
  { id: '__inbox__', name: '未分類', color: '#000000', order: 0 },
  { id: 'canvas-list', name: 'Canvas', color: '#111111', order: 1 },
  { id: 'mine', name: 'ゼミ', color: '#222222', order: 2 },
]
const sec = (id: string, listId = 'canvas-list'): ListSection => ({ id, listId, name: '経済学入門', order: 0 })
const NEW_SEC = `canvas-course-${HOST}-101`
const NEW_ID = `canvas-${HOST}-assignment-1`

function run(tasks: Task[], sections: ListSection[] = []) {
  return migrateLegacyCanvasIds({ lists, sections, tasks }, NOW)
}

describe('migrateLegacyCanvasIds', () => {
  it('folds a first-version copy into its twin, keeping what the user wrote', () => {
    const twin = task(NEW_ID, { title: 'レポート（Canvas の題名）', description: URL1, sectionId: NEW_SEC, dueDate: '2026-10-05' })
    const old = task('canvas-assignment-1', {
      title: '古い題名',
      description: `${URL1}\n図書館で資料を借りる`,
      listId: '__inbox__',
      color: '#F6BF26',
      scheduledDate: '2026-10-04',
      startTime: '13:00',
      endTime: '15:00',
    })
    const child = task('sub', { parentId: old.id, listId: '__inbox__' })
    const r = run([old, twin, child], [sec(NEW_SEC)])

    expect(r.tasks.map((t) => t.id)).toEqual([NEW_ID, 'sub'])
    expect(r.tasks[0]).toMatchObject({
      title: 'レポート（Canvas の題名）',
      dueDate: '2026-10-05',
      listId: 'canvas-list',
      sectionId: NEW_SEC,
      color: '#F6BF26',
      description: `${URL1}\n図書館で資料を借りる`,
      scheduledDate: '2026-10-04',
      startTime: '13:00',
      endTime: '15:00',
    })
    expect(r.tasks[1]).toMatchObject({ parentId: NEW_ID, listId: 'canvas-list' })
  })

  it('keeps the copy where the user moved it, and its completion', () => {
    const twin = task(NEW_ID, { description: URL1, sectionId: NEW_SEC })
    const old = task('canvas-assignment-1', { description: URL1, listId: 'mine', completed: true, completedAt: T0 })
    const [t] = run([twin, old], [sec(NEW_SEC)]).tasks
    expect(t).toMatchObject({ id: NEW_ID, listId: 'mine', sectionId: null, completed: true, completedAt: T0 })
  })

  it('renames a copy without a twin, and its course section, to the school found in its URL', () => {
    const other = task(`canvas-${HOST}-assignment-2`, { description: `https://${HOST}/courses/202/assignments/2` })
    const old = task('canvas-assignment-1', { description: URL1, sectionId: 'canvas-course-101' })
    const r = run([old, other], [sec('canvas-course-101')])
    expect(r.tasks[0]).toMatchObject({ id: NEW_ID, sectionId: NEW_SEC, updatedAt: NOW })
    expect(r.sections.map((s) => s.id)).toEqual([NEW_SEC])
  })

  it('uses the URL even before anything was imported with the new ids', () => {
    expect(run([task('canvas-assignment-1', { description: URL1 })]).tasks[0].id).toBe(NEW_ID)
  })

  it('leaves a copy alone when the school cannot be told', () => {
    const a = task('canvas-a.instructure.com-assignment-5')
    const b = task('canvas-b.instructure.com-assignment-6')
    const old = task('canvas-assignment-1', { description: 'https://other.example.com/courses/1/assignments/1' })
    expect(run([a, b, old]).tasks.map((t) => t.id)).toContain('canvas-assignment-1')
  })

  it('puts an assignment that fell into the inbox back into its course', () => {
    const t = task(NEW_ID, { description: URL1, listId: '__inbox__' })
    expect(run([t], [sec(NEW_SEC)]).tasks[0]).toMatchObject({ listId: 'canvas-list', sectionId: NEW_SEC })
  })

  it('changes nothing the second time', () => {
    const once = run([task('canvas-assignment-1', { description: URL1, listId: '__inbox__' })], [sec('canvas-course-101')])
    expect(migrateLegacyCanvasIds(once, NOW)).toBe(once)
  })
})
