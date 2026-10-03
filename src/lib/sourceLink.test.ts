import { describe, expect, it } from 'vitest'
import { sourceLinkOf } from './sourceLink'

describe('sourceLinkOf', () => {
  it('recognises a memo that is just a Canvas or Notion URL', () => {
    expect(sourceLinkOf('https://canvas.ucsc.edu/courses/9/assignments/11')?.service).toBe('canvas')
    expect(sourceLinkOf('https://school.instructure.com/calendar')?.service).toBe('canvas')
    expect(sourceLinkOf(' https://www.notion.so/abc123 \n')?.service).toBe('notion')
    expect(sourceLinkOf('https://example.com/page')).toEqual({ url: 'https://example.com/page', service: null })
  })

  it('leaves memos with other text alone', () => {
    expect(sourceLinkOf('')).toBeNull()
    expect(sourceLinkOf('第3章を読む https://example.com')).toBeNull()
    expect(sourceLinkOf('https://example.com\n2 行目のメモ')).toBeNull()
    expect(sourceLinkOf('javascript:alert(1)')).toBeNull()
  })
})
