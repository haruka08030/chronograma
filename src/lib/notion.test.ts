import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import { NOTION_LIST_ID, notionTaskId, parseNotionTaskId, reconcileNotionPages, splitNotionDate, type NotionPage } from './notion'

const NOW = '2026-09-30T00:00:00.000Z'
const PAGE_A = '0123456789abcdef0123456789abcdef'
const PAGE_B = 'fedcba9876543210fedcba9876543210'

const inbox: TaskList = { id: 'inbox', name: 'Inbox', color: '#000000', order: 0 }
const opts = { now: NOW, listColor: '#123456', titleFor: (p: NotionPage) => `${p.title}：${p.status}` }

function page(pageId: string, status: string, patch: Partial<NotionPage> = {}): NotionPage {
  return { pageId, url: `https://www.notion.so/${pageId}`, title: 'A社', status, date: null, ...patch }
}

function reconcileOnce(pages: NotionPage[], datesEnabled = true) {
  return reconcileNotionPages({ lists: [inbox], tasks: [] }, { databaseTitle: '就活', datesEnabled, pages }, opts)
}

describe('notionTaskId', () => {
  it('round-trips Japanese statuses and dashed page ids', () => {
    const id = notionTaskId('01234567-89ab-cdef-0123-456789abcdef', '面接を受ける')
    expect(id).toMatch(/^notion-[0-9a-f]{32}-[A-Za-z0-9_-]+$/)
    expect(parseNotionTaskId(id)).toEqual({ pageId: PAGE_A, status: '面接を受ける' })
  })

  it('ignores ordinary task ids', () => {
    expect(parseNotionTaskId('3f2a1c4e-0000-4000-8000-000000000000')).toBeNull()
  })
})

describe('splitNotionDate', () => {
  it('keeps the wall-clock time Notion returns', () => {
    expect(splitNotionDate('2026-10-03T14:00:00.000+09:00')).toEqual({ dueDate: '2026-10-03', dueTime: '14:00' })
    expect(splitNotionDate('2026-10-03')).toEqual({ dueDate: '2026-10-03', dueTime: null })
  })
})

describe('reconcileNotionPages', () => {
  it('creates the Notion list and one task per action row', () => {
    const r = reconcileOnce([page(PAGE_A, 'ES を出す', { date: '2026-10-03' })])
    expect(r.lists.find((l) => l.id === NOTION_LIST_ID)?.name).toBe('就活')
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0]).toMatchObject({
      title: 'A社：ES を出す',
      listId: NOTION_LIST_ID,
      dueDate: '2026-10-03',
      description: `https://www.notion.so/${PAGE_A}`,
    })
  })

  it('completes an open task once its row leaves the action statuses, and reports it as automatic', () => {
    const first = reconcileOnce([page(PAGE_A, 'ES を出す')])
    const r = reconcileNotionPages(first, { databaseTitle: '就活', datesEnabled: true, pages: [] }, opts)
    expect(r.tasks[0].completed).toBe(true)
    expect(r.autoCompletedIds).toEqual([first.tasks[0].id])
  })

  it('makes a fresh task when the same row reaches the next action status', () => {
    const first = reconcileOnce([page(PAGE_A, 'ES を出す')])
    const r = reconcileNotionPages(first, { databaseTitle: '就活', datesEnabled: true, pages: [page(PAGE_A, '面接を受ける')] }, opts)
    expect(r.tasks).toHaveLength(2)
    expect(r.tasks.filter((t) => !t.completed).map((t) => t.title)).toEqual(['A社：面接を受ける'])
  })

  it('never reopens a task the user already completed or deleted', () => {
    const first = reconcileOnce([page(PAGE_A, 'ES を出す'), page(PAGE_B, 'ES を出す')])
    const tasks: Task[] = [
      { ...first.tasks[0], completed: true, completedAt: NOW },
      { ...first.tasks[1], deletedAt: NOW },
    ]
    const r = reconcileNotionPages(
      { lists: first.lists, tasks },
      { databaseTitle: '就活', datesEnabled: true, pages: [page(PAGE_A, 'ES を出す'), page(PAGE_B, 'ES を出す')] },
      opts,
    )
    expect(r.changed).toBe(false)
    expect(r.tasks).toBe(tasks)
  })

  it('follows Notion title and date changes, but leaves due dates alone when no date column is chosen', () => {
    const first = reconcileOnce([page(PAGE_A, 'ES を出す', { date: '2026-10-03' })])
    const renamed = reconcileNotionPages(
      first,
      {
        databaseTitle: '就活',
        datesEnabled: true,
        pages: [page(PAGE_A, 'ES を出す', { title: 'A株式会社', date: '2026-10-05T10:00:00.000+09:00' })],
      },
      opts,
    )
    expect(renamed.tasks[0]).toMatchObject({ title: 'A株式会社：ES を出す', dueDate: '2026-10-05', dueTime: '10:00' })

    const manual = { ...first, tasks: [{ ...first.tasks[0], dueDate: '2026-10-10' }] }
    const noDates = reconcileNotionPages(manual, { databaseTitle: '就活', datesEnabled: false, pages: [page(PAGE_A, 'ES を出す')] }, opts)
    expect(noDates.tasks[0].dueDate).toBe('2026-10-10')
  })

  it('reports no change when everything already matches', () => {
    const first = reconcileOnce([page(PAGE_A, 'ES を出す')])
    const r = reconcileNotionPages(first, { databaseTitle: '就活', datesEnabled: true, pages: [page(PAGE_A, 'ES を出す')] }, opts)
    expect(r.changed).toBe(false)
  })
})
