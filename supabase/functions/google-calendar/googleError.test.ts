import { describe, expect, it } from 'vitest'
import { classifyGoogleError, GoogleApiError, isRetryableGoogleError, parseGoogleErrorReasons } from './googleError.ts'

/** Calendar API のエラー本文（Google の形） */
function calendarBody(code: number, reasons: string[], message = 'x', status = 'PERMISSION_DENIED'): string {
  return JSON.stringify({
    error: { code, message, status, errors: reasons.map((reason) => ({ domain: 'usageLimits', reason, message })) },
  })
}

function calendarError(status: number, body: string): GoogleApiError {
  return new GoogleApiError('calendar', status, parseGoogleErrorReasons(body), body)
}

function tokenError(status: number, body: string): GoogleApiError {
  return new GoogleApiError('token', status, parseGoogleErrorReasons(body), body)
}

describe('parseGoogleErrorReasons', () => {
  it('Calendar API の errors[].reason と details[].reason、status を読む', () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        status: 'PERMISSION_DENIED',
        errors: [{ reason: 'insufficientPermissions' }],
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
      },
    })
    expect(parseGoogleErrorReasons(body)).toEqual(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'PERMISSION_DENIED'])
  })

  it('トークンの更新の { error: "invalid_grant" } を読む', () => {
    expect(parseGoogleErrorReasons('{"error":"invalid_grant","error_description":"Token has been expired or revoked."}')).toEqual([
      'invalid_grant',
    ])
  })

  it('JSON でない本文は空', () => {
    expect(parseGoogleErrorReasons('<html>Forbidden</html>')).toEqual([])
    expect(parseGoogleErrorReasons('null')).toEqual([])
  })
})

describe('classifyGoogleError', () => {
  it.each(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded'])(
    '403 の利用上限（%s）はつなぎ直しにしない',
    (reason) => {
      const e = calendarError(403, calendarBody(403, [reason]))
      expect(classifyGoogleError(e)).toBe('rate_limited')
      expect(isRetryableGoogleError(e)).toBe(true)
    },
  )

  it('429 は利用上限', () => {
    expect(classifyGoogleError(calendarError(429, calendarBody(429, ['rateLimitExceeded'], 'x', 'RESOURCE_EXHAUSTED')))).toBe(
      'rate_limited',
    )
    expect(classifyGoogleError(calendarError(429, 'Too Many Requests'))).toBe('rate_limited')
    expect(classifyGoogleError(tokenError(429, 'slow down'))).toBe('rate_limited')
  })

  it('スコープ不足の 403 は書き込みを許可してつなぎ直す', () => {
    const body = calendarBody(403, ['insufficientPermissions'], 'Request had insufficient authentication scopes.')
    expect(classifyGoogleError(calendarError(403, body))).toBe('scope')
    // 理由が読めなくても文言で
    expect(classifyGoogleError(calendarError(403, 'Request had insufficient authentication scopes.'))).toBe('scope')
  })

  it('他人の予定など、変える権限が無い 403', () => {
    expect(classifyGoogleError(calendarError(403, calendarBody(403, ['forbiddenForNonOrganizer'])))).toBe('forbidden')
    expect(classifyGoogleError(calendarError(403, calendarBody(403, ['forbidden'])))).toBe('forbidden')
  })

  it('API が有効でない（こちらの設定の誤り）は連携を外さない', () => {
    expect(classifyGoogleError(calendarError(403, calendarBody(403, ['accessNotConfigured'])))).toBe('failed')
  })

  it('取り消された・期限切れはつなぎ直し', () => {
    expect(classifyGoogleError(tokenError(400, '{"error":"invalid_grant"}'))).toBe('auth_expired')
    expect(classifyGoogleError(calendarError(401, calendarBody(401, ['authError'], 'x', 'UNAUTHENTICATED')))).toBe('auth_expired')
  })

  it('トークンの更新のそれ以外の失敗・Google の一時的な失敗は連携を残す', () => {
    expect(classifyGoogleError(tokenError(401, '{"error":"invalid_client"}'))).toBe('failed')
    expect(classifyGoogleError(tokenError(503, 'Service Unavailable'))).toBe('failed')
    expect(classifyGoogleError(calendarError(500, calendarBody(500, ['backendError'])))).toBe('failed')
    expect(classifyGoogleError(new TypeError('fetch failed'))).toBe('failed')
    expect(isRetryableGoogleError(calendarError(500, calendarBody(500, ['backendError'])))).toBe(false)
  })

  it('ログ用の文言は前と同じ形', () => {
    expect(calendarError(403, 'body').message).toBe('Calendar API error 403: body')
    expect(tokenError(400, 'body').message).toBe('Google token refresh failed: 400 body')
  })
})
