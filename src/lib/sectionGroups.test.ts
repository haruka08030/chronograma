import { describe, expect, it } from 'vitest'
import type { ListSection } from '../types/section'
import { groupBySection } from './sectionGroups'

const sec = (id: string, order: number, listId = 'L'): ListSection => ({ id, listId, name: id, order })

describe('groupBySection', () => {
  it('puts unsectioned items first, then sections in order, keeping empty sections', () => {
    const items = [
      { id: 'a', sectionId: 's2' },
      { id: 'b', sectionId: null },
      { id: 'c', sectionId: 's1' },
    ]
    const groups = groupBySection(items, [sec('s2', 1), sec('s1', 0), sec('s3', 2), sec('x', 0, 'other')], 'L')
    expect(groups.map((g) => [g.section?.id ?? null, g.items.map((i) => i.id)])).toEqual([
      [null, ['b']],
      ['s1', ['c']],
      ['s2', ['a']],
      ['s3', []],
    ])
  })

  it('treats items whose section is gone as unsectioned', () => {
    const groups = groupBySection([{ id: 'a', sectionId: 'gone' }], [], 'L')
    expect(groups).toEqual([{ section: null, items: [{ id: 'a', sectionId: 'gone' }] }])
  })
})
