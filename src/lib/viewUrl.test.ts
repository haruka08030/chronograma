import { describe, expect, it } from 'vitest'
import { parseViewUrl, toSmartView, viewQuery, withViewQuery } from './viewUrl'

const loc = (over: Partial<Parameters<typeof viewQuery>[0]>) => ({ view: null, listId: null, tag: null, color: null, ...over })

describe('parseViewUrl', () => {
  it('reads a view', () => {
    expect(parseViewUrl('?view=planner')).toEqual(loc({ view: 'planner' }))
    expect(parseViewUrl('?view=settings')).toEqual(loc({ view: 'settings' }))
  })

  it('opens merged old views where they moved', () => {
    expect(parseViewUrl('?view=activity-log')?.view).toBe('planner')
    expect(parseViewUrl('?view=plan-vs-actual')?.view).toBe('calendar')
  })

  it('reads a list with its tag filter', () => {
    expect(parseViewUrl('?list=abc&tag=%E6%95%B0%E5%AD%A6')).toEqual(loc({ listId: 'abc', tag: '数学' }))
  })

  it('reads a color label and normalizes it', () => {
    expect(parseViewUrl('?view=all&color=%23ff8800')).toEqual(loc({ view: 'all', color: '#FF8800' }))
    expect(parseViewUrl('?view=all&color=ff8800')?.color).toBe('#FF8800')
    expect(parseViewUrl('?view=all&color=red')?.color).toBeNull()
  })

  it('returns null without a known view or list', () => {
    expect(parseViewUrl('')).toBeNull()
    expect(parseViewUrl('?view=nope')).toBeNull()
    expect(parseViewUrl('?code=x&state=y')).toBeNull()
  })

  it('round-trips through viewQuery', () => {
    for (const l of [loc({ view: 'calendar' }), loc({ listId: 'a b&c', tag: 'x' }), loc({ view: 'all', color: '#00AA11' })]) {
      expect(parseViewUrl(`?${viewQuery(l)}`)).toEqual(l)
    }
  })
})

describe('withViewQuery', () => {
  it('replaces the view and keeps other params', () => {
    expect(withViewQuery('?view=planner&code=1&state=2', loc({ view: 'habits' }))).toBe('?view=habits&code=1&state=2')
  })

  it('drops the old list filters when switching to a view', () => {
    expect(withViewQuery('?list=a&tag=t', loc({ view: 'stats' }))).toBe('?view=stats')
  })

  it('leaves only the other params when nothing is open', () => {
    expect(withViewQuery('?view=planner&x=1', loc({}))).toBe('?x=1')
    expect(withViewQuery('?view=planner', loc({}))).toBe('')
  })
})

describe('toSmartView', () => {
  it('rejects unknown names', () => {
    expect(toSmartView('today')).toBe('today')
    expect(toSmartView('__proto__')).toBeNull()
    expect(toSmartView(null)).toBeNull()
  })
})
