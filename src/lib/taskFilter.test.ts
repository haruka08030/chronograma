import { describe, expect, it } from 'vitest'
import { hasTaskFilter, inPeriod, NO_TODO_FILTER, todoFilterFor } from './taskFilter'

describe('完了済みの期間', () => {
  it('今日を入れて過去 n 日（月をまたいでも）', () => {
    expect(inPeriod('2026-10-02', '2026-10-08', 7)).toBe(true)
    expect(inPeriod('2026-10-01', '2026-10-08', 7)).toBe(false)
    expect(inPeriod('2026-09-09', '2026-10-08', 30)).toBe(true)
    expect(inPeriod('2026-09-08', '2026-10-08', 30)).toBe(false)
    expect(inPeriod('2025-01-01', '2026-10-08', null)).toBe(true)
    // 今日より先の日（時計のずれ・別のタイムゾーン）も外さない
    expect(inPeriod('2026-10-09', '2026-10-08', 7)).toBe(true)
  })
})

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
