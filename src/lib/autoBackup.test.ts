import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { idsToPrune, restoreMissing, type AutoBackupMeta, type RestorableData } from './autoBackup'
import { SYNC_INBOX_LIST_ID } from './syncMerge'

const T0 = '2026-09-25T00:00:00.000Z'
const NOW = '2026-10-02T00:00:00.000Z'

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', completed: false, completedAt: null, createdAt: T0, updatedAt: T0,
    order: 0, listId: SYNC_INBOX_LIST_ID, sectionId: null, parentId: null, dueDate: null,
    startTime: null, endTime: null, priority: 'none', tags: [], recurrence: null, ...patch,
  }
}

const inbox = { id: SYNC_INBOX_LIST_ID, name: '未分類', color: '#888888', order: 0 }
const data = (patch: Partial<RestorableData> = {}): RestorableData => ({ lists: [inbox], sections: [], tasks: [], habits: [], ...patch })

describe('restoreMissing', () => {
  it('控えにあって今は無いものだけ戻し、今あるものは控えの内容で上書きしない', () => {
    const current = data({ tasks: [task('kept', { title: '今の題名' }), task('today')] })
    const backup = data({ tasks: [task('kept', { title: '古い題名' }), task('es-lost')] })
    const { next, addedTasks } = restoreMissing(current, backup, NOW)
    expect(addedTasks).toBe(1)
    expect(next.tasks.map((t) => t.id)).toEqual(['kept', 'today', 'es-lost'])
    expect(next.tasks[0].title).toBe('今の題名')
  })

  it('戻したものは更新時刻を今にする（同期で他端末の削除と見なされて再び消えないように）', () => {
    const { next } = restoreMissing(data(), data({ tasks: [task('es-lost')] }), NOW)
    expect(next.tasks[0].updatedAt).toBe(NOW)
  })

  it('消えたリストとセクションも一緒に戻し、親が無い参照は外す', () => {
    const backup = data({
      lists: [inbox, { id: 'es', name: 'ES', color: '#888888', order: 1 }],
      sections: [{ id: 'sec', listId: 'es', name: '締切近い', order: 0 }],
      tasks: [task('a', { listId: 'es', sectionId: 'sec', parentId: 'gone' })],
    })
    const { next } = restoreMissing(data(), backup, NOW)
    expect(next.lists.map((l) => l.id)).toEqual([SYNC_INBOX_LIST_ID, 'es'])
    expect(next.sections.map((s) => s.id)).toEqual(['sec'])
    expect(next.tasks[0]).toMatchObject({ listId: 'es', sectionId: 'sec', parentId: null })
  })
})

describe('idsToPrune', () => {
  const meta = (kind: AutoBackupMeta['kind'], day: number): AutoBackupMeta => ({
    id: `${kind}-${day}`, kind, savedAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    dateKey: '', todoCount: 0, logCount: 0,
  })

  it('毎日は 14 件、同期の直前は 5 件を新しい順に残す', () => {
    const all = [
      ...Array.from({ length: 16 }, (_, i) => meta('daily', i + 1)),
      ...Array.from({ length: 6 }, (_, i) => meta('beforeSync', i + 1)),
    ]
    expect(idsToPrune(all).sort()).toEqual(['beforeSync-1', 'daily-1', 'daily-2'])
  })
})
