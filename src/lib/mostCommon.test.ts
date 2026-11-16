import { describe, expect, it } from 'vitest'
import { mostCommon } from './mostCommon'

describe('mostCommon', () => {
  it('いちばん多いもの、同じ数なら先のもの、空なら undefined', () => {
    const id = (s: string) => s
    expect(mostCommon(['a', 'b', 'b', 'c'], id)).toBe('b')
    expect(mostCommon(['a', 'b', 'b', 'a'], id)).toBe('a')
    expect(mostCommon([], id)).toBeUndefined()
    expect(mostCommon([{ t: '9' }, { t: '10' }, { t: '10' }], (x) => x.t)).toEqual({ t: '10' })
  })
})
