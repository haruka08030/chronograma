import { describe, expect, it, vi } from 'vitest'

vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? [] : k), language: 'ja' },
}))

const { migrateTaskState } = await import('./migrate')
const OLD = '2026-01-01T00:00:00.000Z'

function log(id: string, title: string) {
  return {
    id,
    title,
    description: '',
    completed: true,
    completedAt: OLD,
    createdAt: OLD,
    updatedAt: OLD,
    order: 0,
    listId: '__inbox__',
    sectionId: null,
    parentId: null,
    dueDate: '2026-01-01',
    startTime: '23:00',
    endTime: '07:00',
    priority: 'none',
    tags: [],
    recurrence: null,
    isTimeLog: true,
  }
}

describe('データの移行は updatedAt を変えない', () => {
  it('睡眠の印を付けても、元の updatedAt のまま（古い端末の行がほかの端末の新しい編集に勝たない）', () => {
    const out = migrateTaskState({ tasks: [log('s', '睡眠')], lists: [], sections: [], habits: [] }, 31)
    const sleep = out.tasks.find((t) => t.id === 's')!
    expect(sleep.kind).toBe('sleep')
    expect(sleep.updatedAt).toBe(OLD)
  })
})

describe('タスクの種類（v38）', () => {
  it('2 つの印（記録か・睡眠か）を kind 1 つにし、印は残さない', () => {
    const todo = { ...log('t', '買い物'), isTimeLog: false }
    const sleep = { ...log('s', '夜'), isSleep: true }
    const out = migrateTaskState({ tasks: [todo, log('l', 'ゼミ'), sleep], lists: [], sections: [], habits: [] }, 37)
    expect(out.tasks.map((t) => t.kind)).toEqual(['todo', 'log', 'sleep'])
    for (const t of out.tasks) {
      expect(t).not.toHaveProperty('isTimeLog')
      expect(t).not.toHaveProperty('isSleep')
      expect(t.updatedAt).toBe(OLD)
    }
  })

  it('睡眠の印だけで記録の印が無いものは To-Do のまま', () => {
    const odd = { ...log('x', '夜'), isTimeLog: false, isSleep: true }
    const out = migrateTaskState({ tasks: [odd], lists: [], sections: [], habits: [] }, 37)
    expect(out.tasks[0].kind).toBe('todo')
  })
})

describe('他のタイムゾーン', () => {
  it('文字列の配列（名前の無い前の版）は名前なしの { tz, label } に', () => {
    const out = migrateTaskState(
      { tasks: [], lists: [], sections: [], habits: [], extraTimeZones: ['Europe/London', 'America/New_York'] },
      35,
    )
    expect(out.extraTimeZones).toEqual([
      { tz: 'Europe/London', label: '' },
      { tz: 'America/New_York', label: '' },
    ])
  })

  it('保存が無ければ空', () => {
    const out = migrateTaskState({ tasks: [], lists: [], sections: [], habits: [] }, 35)
    expect(out.extraTimeZones).toEqual([])
  })
})

describe('習慣のアーカイブ（版 37）', () => {
  it('前の版の習慣は使用中になり、updatedAt は変えない', () => {
    const h = {
      id: 'h',
      title: 'ジム',
      color: '#33B679',
      timeMode: 'none',
      startTime: null,
      endTime: null,
      frequency: { type: 'daily' },
      createdAt: OLD,
      updatedAt: OLD,
      completedDates: ['2026-01-01'],
    }
    const out = migrateTaskState({ tasks: [], lists: [], sections: [], habits: [h] }, 36)
    expect(out.habits[0]).toMatchObject({ archivedAt: null, updatedAt: OLD, completedDates: ['2026-01-01'] })
  })
})

describe('はじめの案内（版 39）', () => {
  it('前の版でタスクか習慣がある人には出さない', () => {
    expect(migrateTaskState({ tasks: [log('l', 'ゼミ')], lists: [], sections: [], habits: [] }, 38).onboardingDone).toBe(true)
    expect(migrateTaskState({ tasks: [], lists: [], sections: [], habits: [{ id: 'h' }] }, 38).onboardingDone).toBe(true)
  })

  it('まだ何も無い人には出す', () => {
    expect(migrateTaskState({ tasks: [], lists: [], sections: [], habits: [] }, 38).onboardingDone).toBe(false)
  })
})
