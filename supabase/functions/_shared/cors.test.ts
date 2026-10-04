import { describe, expect, it } from 'vitest'
import { corsHeadersFor, devOriginsEnabled, parseAllowedOrigins } from './cors'

describe('parseAllowedOrigins', () => {
  it('normalizes configured origins and leaves out localhost by default', () => {
    const allowed = parseAllowedOrigins(' https://app.example.com/ , https://b.example.com/path, nope ,')
    expect(allowed).toEqual(['https://app.example.com', 'https://b.example.com'])
    expect(allowed).not.toContain('http://localhost:5173')
  })

  it('allows nothing when unset (production without dev origins)', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([])
  })

  it('adds the dev origins only when enabled', () => {
    const allowed = parseAllowedOrigins('https://app.example.com', true)
    expect(allowed).toContain('http://localhost:5173')
    expect(allowed).toContain('https://app.example.com')
  })
})

describe('devOriginsEnabled', () => {
  it('reads true / 1 / yes only', () => {
    for (const v of ['true', 'TRUE', '1', 'yes', ' true ']) expect(devOriginsEnabled(v), v).toBe(true)
    for (const v of [undefined, '', 'false', '0', 'no', 'on']) expect(devOriginsEnabled(v), String(v)).toBe(false)
  })
})

describe('corsHeadersFor', () => {
  const allowed = parseAllowedOrigins('https://app.example.com')

  it('echoes an allowed origin', () => {
    expect(corsHeadersFor('https://app.example.com', allowed)['Access-Control-Allow-Origin']).toBe('https://app.example.com')
  })

  it('does not allow other origins', () => {
    expect(corsHeadersFor('https://evil.example.com', allowed)['Access-Control-Allow-Origin']).toBeUndefined()
    expect(corsHeadersFor(null, allowed)['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('never answers with a wildcard', () => {
    expect(Object.values(corsHeadersFor('https://app.example.com', allowed))).not.toContain('*')
  })
})
