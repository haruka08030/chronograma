import { describe, expect, it } from 'vitest'
import { classifySyncError } from './syncErrorReason'

describe('classifySyncError', () => {
  it('端末がオフラインなら中身によらず offline', () => {
    expect(classifySyncError('JWT expired', false)).toBe('offline')
  })

  it('fetch が届かなかった文は offline', () => {
    expect(classifySyncError(new TypeError('Failed to fetch'), true)).toBe('offline')
    expect(classifySyncError('TypeError: Load failed', true)).toBe('offline')
  })

  it('ログインの期限切れは auth', () => {
    expect(classifySyncError('JWT expired', true)).toBe('auth')
    expect(classifySyncError({ message: 'Invalid Refresh Token: Refresh Token Not Found' }, true)).toBe('auth')
    expect(classifySyncError({ code: 'PGRST301', message: 'JWSError' }, true)).toBe('auth')
  })

  it('それ以外（サーバーの不調・想定外）は server', () => {
    expect(classifySyncError('internal server error', true)).toBe('server')
    expect(classifySyncError(new Error('boom'), true)).toBe('server')
    expect(classifySyncError(null, true)).toBe('server')
  })
})
