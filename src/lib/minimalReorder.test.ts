import { describe, expect, it } from 'vitest'
import { minimalReorder } from './minimalReorder'

describe('minimalReorder', () => {
  it('1 件動かすと変わるのは 1 行だけ', () => {
    const before = [0, 1, 5, 2, 3] // 5 を 1 と 2 の間へ
    const after = minimalReorder(before)
    expect(after.filter((v, i) => v !== before[i])).toHaveLength(1)
    expect(after).toEqual([0, 1, 1.5, 2, 3])
  })

  it('先頭・末尾へ動かしても 1 行だけ。結果は増え続ける', () => {
    expect(minimalReorder([3, 0, 1, 2])).toEqual([-1, 0, 1, 2])
    expect(minimalReorder([1, 2, 3, 0])).toEqual([1, 2, 3, 4])
  })

  it('同じ値が並んでいても、増え続ける値にする', () => {
    const after = minimalReorder([0, 0, 0])
    expect(after[0]! < after[1]! && after[1]! < after[2]!).toBe(true)
  })
})
