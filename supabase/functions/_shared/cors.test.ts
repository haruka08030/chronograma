import { describe, expect, it } from 'vitest'
import { corsHeadersFor, parseAllowedOrigins } from './cors'

describe('parseAllowedOrigins', () => {
  it('keeps the dev origins and normalizes configured ones', () => {
    const allowed = parseAllowedOrigins(' https://app.example.com/ , https://b.example.com/path, nope ,')
    expect(allowed).toContain('http://localhost:5173')
    expect(allowed).toContain('https://app.example.com')
    expect(allowed).toContain('https://b.example.com')
    expect(allowed).not.toContain('nope')
  })

  it('allows only the dev origins when unset', () => {
    expect(parseAllowedOrigins(undefined).every((o) => o.startsWith('http://'))).toBe(true)
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
