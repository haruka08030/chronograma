import { describe, expect, it } from 'vitest'
import { md5Hex } from './md5'

describe('md5Hex', () => {
  it('Node・Postgres の md5（UTF-8）と同じ値（ブロックの境目の長さも）', () => {
    const cases: [string, string][] = [
      ['', 'd41d8cd98f00b204e9800998ecf8427e'],
      ['abc', '900150983cd24fb0d6963f7d28e17f72'],
      ['chronograma-label:授業', '96c4810d5f65f5124cc6339e5fbcf9ff'],
      ['chronograma-label:就活 ES 🎓', 'a17ffd526cc5ca3ac685a973cd712121'],
      ['x'.repeat(55), '04364420e25c512fd958a70738aa8f72'],
      ['y'.repeat(56), '6c830a5d23df58dbe0171eb5639bf3e4'],
      ['z'.repeat(200), '7057a5f99bf5773b65e06e0539314d1c'],
    ]
    for (const [text, hex] of cases) expect(md5Hex(text)).toBe(hex)
  })
})
