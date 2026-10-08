import { describe, expect, it } from 'vitest'
import { hasTaskFilter, NO_TODO_FILTER, todoFilterFor } from './taskFilter'

describe('To-Do 一覧の絞り込み', () => {
  const lists = [
    { id: 'school', kind: 'tasks' as const },
    { id: 'wish', kind: 'someday' as const },
  ]
  const filter = { priority: 'high' as const, estimate: null }

  it('To-Do のリスト・ビューには効かせ、いつか・チェックリストには効かせない', () => {
    expect(todoFilterFor(lists, 'school', filter)).toBe(filter)
    expect(todoFilterFor(lists, null, filter)).toBe(filter)
    expect(todoFilterFor(lists, 'wish', filter)).toBeUndefined()
  })

  it('絞り込み以外の項目（並び順）は「絞り込み中」に数えない', () => {
    expect(hasTaskFilter(NO_TODO_FILTER)).toBe(false)
    expect(hasTaskFilter({ ...NO_TODO_FILTER, sort: 'priority' } as never)).toBe(false)
    expect(hasTaskFilter(filter)).toBe(true)
  })
})
