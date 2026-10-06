import { describe, expect, it } from 'vitest'
import { groupsBySection, sortKeyOf, sortModeOf } from './todoSurfaceView'

const grouping = { lists: false, dueViews: false, byList: { a: false, b: true } }

describe('groupsBySection', () => {
  it('手動ならどの設定でも分ける', () => {
    expect(groupsBySection('manual', grouping, { listId: 'a' })).toBe(true)
    expect(groupsBySection('manual', grouping, 'dueViews')).toBe(true)
  })

  it('リストはリストごとの設定に従い、未設定なら分ける', () => {
    expect(groupsBySection('dueDate', grouping, { listId: 'a' })).toBe(false)
    expect(groupsBySection('dueDate', grouping, { listId: 'b' })).toBe(true)
    expect(groupsBySection('dueDate', grouping, { listId: 'c' })).toBe(true)
    expect(groupsBySection('dueDate', { lists: false, dueViews: false }, { listId: 'c' })).toBe(true)
  })

  it('「すべて」と期限別ビューはそれぞれの設定に従う', () => {
    expect(groupsBySection('dueDate', { lists: true, dueViews: false }, 'lists')).toBe(true)
    expect(groupsBySection('dueDate', { lists: true, dueViews: false }, 'dueViews')).toBe(false)
  })
})

describe('sort order per list and view', () => {
  it('keys a list by its id and a view by its name', () => {
    expect(sortKeyOf('canvas-list', null)).toBe('canvas-list')
    expect(sortKeyOf(null, 'upcoming')).toBe('view:upcoming')
    expect(sortKeyOf(null, null)).toBe('view:all')
    // 色ラベルは「すべて」と別に覚える
    expect(sortKeyOf(null, 'all', '#D50000')).toBe('label:#D50000')
    expect(sortKeyOf(null, 'all', 'NONE')).toBe('label:NONE')
    expect(sortKeyOf('canvas-list', null, '#D50000')).toBe('canvas-list')
  })

  it('keeps each list’s own order and defaults to manual', () => {
    const byKey = { 'canvas-list': 'dueDate' as const }
    expect(sortModeOf(byKey, 'canvas-list')).toBe('dueDate')
    expect(sortModeOf(byKey, '__inbox__')).toBe('manual')
    expect(sortModeOf(undefined, 'view:today')).toBe('manual')
  })
})
