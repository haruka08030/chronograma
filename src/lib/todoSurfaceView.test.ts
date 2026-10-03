import { describe, expect, it } from 'vitest'
import { groupsBySection } from './todoSurfaceView'

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
