import { describe, expect, it } from 'vitest'
import {
  BACKUP_SCHEMA_VERSION,
  buildBackupPayload,
  isImportFileTooLarge,
  MAX_IMPORT_FILE_BYTES,
  parseBackupJson,
  readBackupJson,
  withFreshStamps,
} from './backupFormat'
import { backupProblemText } from './backupProblemText'
import i18n from '../i18n/config'

const file = (data: Record<string, unknown>) => JSON.stringify({ version: 3, ...data })

describe('parseBackupJson', () => {
  it('fills in fields a hand-edited or old file left out, so screens do not crash', () => {
    const parsed = parseBackupJson(
      file({
        lists: [{ id: '__inbox__', name: '未分類' }],
        tasks: [{ id: 't1', title: '課題', listId: '__inbox__', dueDate: 'tomorrow', startTime: 9, recurrence: { type: 'hourly' } }],
        habits: [{ id: 'h1', title: 'ジム', completedDates: ['2026-10-01', 3, 'x'], frequency: { type: 'weekly', weekdays: [1, 9] } }],
      }),
    )
    expect(parsed).not.toBeNull()
    const t = parsed!.tasks[0]
    expect(t.tags).toEqual([])
    expect(t.description).toBe('')
    expect(t.completed).toBe(false)
    expect(t.dueDate).toBeNull()
    expect(t.startTime).toBeNull()
    expect(t.recurrence).toBeNull()
    expect(Number.isFinite(Date.parse(t.updatedAt))).toBe(true)
    const h = parsed!.habits[0]
    expect(h.completedDates).toEqual(['2026-10-01'])
    expect(h.frequency).toEqual({ type: 'weekly', weekdays: [1] })
    expect(Number.isFinite(Date.parse(h.updatedAt))).toBe(true)
    expect(h.archivedAt).toBeNull()
  })

  it('keeps a habit archived, and treats a broken archive stamp as active', () => {
    const parsed = parseBackupJson(
      file({
        lists: [{ id: '__inbox__', name: '未分類' }],
        tasks: [],
        habits: [
          { id: 'a', title: '英単語', archivedAt: '2026-10-02T00:00:00.000Z' },
          { id: 'b', title: 'ジム', archivedAt: 'yesterday' },
        ],
      }),
    )
    expect(parsed!.habits.map((h) => h.archivedAt)).toEqual(['2026-10-02T00:00:00.000Z', null])
  })

  it('keeps valid values as they are', () => {
    const parsed = parseBackupJson(
      file({
        lists: [{ id: '__inbox__', name: '未分類' }],
        tasks: [
          {
            id: 't1',
            title: 'ES',
            listId: '__inbox__',
            tags: ['就活'],
            dueDate: '2026-10-05',
            dueTime: '18:00',
            recurrence: { type: 'weekly', interval: 2 },
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-02T00:00:00.000Z',
          },
        ],
      }),
    )
    const t = parsed!.tasks[0]
    expect(t.tags).toEqual(['就活'])
    expect(t.dueDate).toBe('2026-10-05')
    expect(t.dueTime).toBe('18:00')
    expect(t.recurrence).toEqual({ type: 'weekly', interval: 2 })
    expect(t.updatedAt).toBe('2026-10-02T00:00:00.000Z')
  })

  it('keeps the weekdays of a weekly repeat', () => {
    const parsed = parseBackupJson(
      file({
        lists: [{ id: '__inbox__', name: '未分類' }],
        tasks: [
          {
            id: 't1',
            title: 'ジム',
            listId: '__inbox__',
            dueDate: '2026-10-05',
            recurrence: { type: 'weekly', interval: 1, weekdays: [5, 1, 3] },
          },
          {
            id: 't2',
            title: '日記',
            listId: '__inbox__',
            dueDate: '2026-10-05',
            recurrence: { type: 'daily', interval: 1, weekdays: [1] },
          },
        ],
      }),
    )
    expect(parsed!.tasks[0].recurrence).toEqual({ type: 'weekly', interval: 1, weekdays: [1, 3, 5] })
    expect(parsed!.tasks[1].recurrence).toEqual({ type: 'daily', interval: 1 })
  })
})

describe('unknown fields', () => {
  it('keeps only known fields of tasks, habits, lists and sections, and drops everything else', () => {
    const parsed = parseBackupJson(
      file({
        lists: [{ id: 'l1', name: '授業', color: '#7986cb', order: 1, kind: 'tasks', evil: '<script>', __proto__x: 1 }],
        listSections: [{ id: 's1', listId: 'l1', name: '週 1', order: 0, extra: true }],
        tasks: [
          {
            id: 't1',
            title: '課題',
            listId: 'l1',
            sectionId: 's1',
            category: '勉強',
            is_time_log: true,
            reminders: [
              { at: 'start', minutes: 10, url: 'https://evil.example' },
              { at: 'never', minutes: 5 },
            ],
            injected: { deep: 1 },
            user_id: 'someone-else',
          },
        ],
        habits: [
          { id: 'h1', title: 'ジム', frequency: { type: 'weekly', weekdays: [2], extra: 1 }, injected: 'x', user_id: 'someone-else' },
        ],
      }),
    )
    expect(parsed).not.toBeNull()
    const t = parsed!.tasks[0] as unknown as Record<string, unknown>
    expect(t.injected).toBeUndefined()
    expect(t.user_id).toBeUndefined()
    expect(t.is_time_log).toBeUndefined()
    expect(t.category).toBe('勉強')
    expect(t.kind).toBe('log')
    expect(t.reminders).toEqual([{ at: 'start', minutes: 10 }])
    expect(Object.keys(t).sort()).toEqual(
      [
        'archivedAt',
        'category',
        'color',
        'completed',
        'completedAt',
        'createdAt',
        'deletedAt',
        'description',
        'dueDate',
        'dueTime',
        'endDate',
        'endTime',
        'habitId',
        'id',
        'kind',
        'listId',
        'location',
        'order',
        'parentId',
        'priority',
        'recurrence',
        'reminders',
        'scheduledDate',
        'sectionId',
        'startTime',
        'tags',
        'timeZone',
        'timeZoneAnchor',
        'title',
        'updatedAt',
      ].sort(),
    )
    const h = parsed!.habits[0] as unknown as Record<string, unknown>
    expect(Object.keys(h).sort()).toEqual(
      [
        'archivedAt',
        'color',
        'completedDates',
        'createdAt',
        'endTime',
        'frequency',
        'id',
        'startTime',
        'timeMode',
        'title',
        'updatedAt',
      ].sort(),
    )
    expect(h.frequency).toEqual({ type: 'weekly', weekdays: [2] })
    expect(Object.keys(parsed!.lists[0]).sort()).toEqual(['color', 'id', 'kind', 'name', 'order'])
    expect(Object.keys(parsed!.sections[0]).sort()).toEqual(['id', 'listId', 'name', 'order'])
  })
})

describe('isImportFileTooLarge', () => {
  it('lets files up to 20 MB through and stops bigger ones before reading', () => {
    expect(MAX_IMPORT_FILE_BYTES).toBe(20 * 1024 * 1024)
    expect(isImportFileTooLarge({ size: 0 })).toBe(false)
    expect(isImportFileTooLarge({ size: MAX_IMPORT_FILE_BYTES })).toBe(false)
    expect(isImportFileTooLarge({ size: MAX_IMPORT_FILE_BYTES + 1 })).toBe(true)
    expect(isImportFileTooLarge(new Blob(['{}']))).toBe(false)
  })

  it('has the message in each language', async () => {
    expect(i18n.t('alert.importFileTooLarge', { mb: 20, lng: 'ja' })).toContain('20 MB')
    expect(i18n.t('alert.importFileTooLarge', { mb: 20, lng: 'en' })).toContain('20 MB')
  })
})

describe('task kind', () => {
  const inbox = [{ id: '__inbox__', name: '未分類' }]

  it('reads the two flags of an older backup (or a server row) as the kind, and drops the flags', () => {
    const parsed = parseBackupJson(
      file({
        lists: inbox,
        tasks: [
          { id: 't', title: 'todo', listId: '__inbox__' },
          { id: 'l', title: 'log', listId: '__inbox__', isTimeLog: true },
          { id: 's', title: 'sleep', listId: '__inbox__', isTimeLog: true, isSleep: true },
          { id: 'r', title: 'row', list_id: '__inbox__', is_time_log: true, is_sleep: false },
        ],
      }),
    )!
    expect(parsed.tasks.map((t) => t.kind)).toEqual(['todo', 'log', 'sleep', 'log'])
    for (const t of parsed.tasks) {
      expect(t).not.toHaveProperty('isTimeLog')
      expect(t).not.toHaveProperty('isSleep')
    }
  })

  it('writes the flags next to the kind, so older app versions can read the file, and reads its own file back', () => {
    const tasks = parseBackupJson(
      file({
        lists: inbox,
        tasks: [
          { id: 'l', title: 'log', listId: '__inbox__', kind: 'log' },
          { id: 's', title: 'sleep', listId: '__inbox__', kind: 'sleep' },
        ],
      }),
    )!.tasks
    const payload = buildBackupPayload({
      tasks,
      lists: [],
      habits: [],
      sections: [],
      timeLogTagPresets: [],
      logCategoryColors: {},
    })
    expect(payload.tasks).toMatchObject([
      { kind: 'log', isTimeLog: true, isSleep: false },
      { kind: 'sleep', isTimeLog: true, isSleep: true },
    ])
    const back = parseBackupJson(JSON.stringify({ ...payload, lists: inbox }))!
    expect(back.tasks.map((t) => t.kind)).toEqual(['log', 'sleep'])
  })
})

describe('readBackupJson', () => {
  const inbox = { id: '__inbox__', name: '未分類' }
  const problemOf = (json: string) => {
    const read = readBackupJson(json)
    return read.ok ? null : read.problem
  }

  it('reads a consistent file', () => {
    const read = readBackupJson(file({ lists: [inbox], tasks: [{ id: 't1', title: 'ES', listId: '__inbox__' }] }))
    expect(read.ok).toBe(true)
  })

  it('says when the file is not JSON or not a backup', () => {
    expect(problemOf('{ not json')).toEqual({ kind: 'notJson' })
    expect(problemOf('null')).toEqual({ kind: 'notBackup' })
    expect(problemOf(JSON.stringify({ tasks: [] }))).toEqual({ kind: 'notBackup' })
  })

  it('says when the file comes from a newer app version', () => {
    const json = JSON.stringify({ schemaVersion: BACKUP_SCHEMA_VERSION + 1, lists: [], tasks: [] })
    expect(problemOf(json)).toEqual({ kind: 'newerVersion', version: BACKUP_SCHEMA_VERSION + 1 })
  })

  it('counts rows missing required fields', () => {
    expect(problemOf(file({ lists: [inbox], tasks: [{ id: 't1' }, { title: 'x', listId: '__inbox__' }] }))).toEqual({
      kind: 'missingFields',
      item: 'task',
      count: 2,
    })
    expect(problemOf(file({ lists: [{ id: 'l1' }], tasks: [] }))).toEqual({ kind: 'missingFields', item: 'list', count: 1 })
  })

  it('names duplicate IDs with a count and an example', () => {
    const tasks = [
      { id: 't1', title: 'ES', listId: '__inbox__' },
      { id: 't1', title: 'ES 2', listId: '__inbox__' },
      { id: 't1', title: 'ES 3', listId: '__inbox__' },
    ]
    expect(problemOf(file({ lists: [inbox], tasks }))).toEqual({ kind: 'duplicateIds', item: 'task', count: 2, example: 'ES 2' })
    expect(problemOf(file({ lists: [inbox, { id: '__inbox__', name: '' }], tasks: [] }))).toEqual({
      kind: 'duplicateIds',
      item: 'list',
      count: 1,
      example: '__inbox__',
    })
    const listSections = [
      { id: 's1', listId: '__inbox__', name: '前半' },
      { id: 's1', listId: '__inbox__', name: '後半' },
    ]
    expect(problemOf(file({ lists: [inbox], tasks: [], listSections }))).toMatchObject({ kind: 'duplicateIds', item: 'section' })
  })

  it('names tasks and sections pointing to a list not in the file', () => {
    const tasks = [
      { id: 't1', title: 'OK', listId: '__inbox__' },
      { id: 't2', title: '迷子', listId: 'gone' },
      { id: 't3', title: '迷子 2', listId: 'gone' },
    ]
    expect(problemOf(file({ lists: [inbox], tasks }))).toEqual({ kind: 'missingList', item: 'task', count: 2, example: '迷子' })
    const listSections = [{ id: 's1', listId: 'gone', name: '前半' }]
    expect(problemOf(file({ lists: [inbox], tasks: [], listSections }))).toEqual({
      kind: 'missingList',
      item: 'section',
      count: 1,
      example: '前半',
    })
  })

  it('names tasks whose section is missing or in another list', () => {
    const lists = [inbox, { id: 'l2', name: '大学' }]
    const listSections = [{ id: 's1', listId: 'l2', name: '前半' }]
    const tasks = [
      { id: 't1', title: '別リスト', listId: '__inbox__', sectionId: 's1' },
      { id: 't2', title: '無い', listId: 'l2', sectionId: 'gone' },
      { id: 't3', title: 'OK', listId: 'l2', sectionId: 's1' },
    ]
    expect(problemOf(file({ lists, tasks, listSections }))).toEqual({ kind: 'missingSection', count: 2, example: '別リスト' })
  })

  it('names subtasks whose parent is not in the file', () => {
    const tasks = [
      { id: 't1', title: '親', listId: '__inbox__' },
      { id: 't2', title: '子', listId: '__inbox__', parentId: 't1' },
      { id: 't3', title: '孤児', listId: '__inbox__', parentId: 'gone' },
    ]
    expect(problemOf(file({ lists: [inbox], tasks }))).toEqual({ kind: 'missingParent', count: 1, example: '孤児' })
  })

  it('parseBackupJson still returns null for a rejected file', () => {
    expect(parseBackupJson(file({ lists: [inbox], tasks: [{ id: 't1', title: 'x', listId: 'gone' }] }))).toBeNull()
  })
})

describe('backupProblemText', () => {
  it('says what is wrong in plain words, in each language', async () => {
    const before = i18n.language
    await i18n.changeLanguage('ja')
    expect(backupProblemText({ kind: 'missingParent', count: 3, example: '課題' })).toBe(
      '親タスクがファイルに無いサブタスクが 3 件あります（例:「課題」）',
    )
    await i18n.changeLanguage('en')
    expect(backupProblemText({ kind: 'duplicateIds', item: 'list', count: 1, example: 'a'.repeat(30) })).toBe(
      `1 list(s) have a duplicate ID (e.g. "${'a'.repeat(20)}…").`,
    )
    await i18n.changeLanguage(before)
  })
})

describe('withFreshStamps', () => {
  it('marks every imported row as edited now so sync does not prefer older server rows', () => {
    const parsed = parseBackupJson(
      file({
        lists: [{ id: '__inbox__', name: '未分類' }],
        tasks: [{ id: 't1', title: 'ES', listId: '__inbox__', updatedAt: '2020-01-01T00:00:00.000Z' }],
      }),
    )!
    const before = Date.now()
    const fresh = withFreshStamps(parsed)
    expect(Date.parse(fresh.tasks[0].updatedAt)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(fresh.lists[0].updatedAt!)).toBeGreaterThanOrEqual(before)
  })
})
