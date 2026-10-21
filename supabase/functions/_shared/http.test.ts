import { describe, expect, it } from 'vitest'
import { errorResponse, integrationErrorStatus, jsonResponse, readJsonBody, retryAfterMs } from './http.ts'

const post = (body: string) => new Request('https://x.test/fn', { method: 'POST', body })

describe('readJsonBody', () => {
  it('JSON のオブジェクトを読む', async () => {
    expect(await readJsonBody(post('{"action":"status"}'))).toEqual({ action: 'status' })
  })

  it('JSON でない本文は null（呼ぶ側で 400）', async () => {
    expect(await readJsonBody(post('{"action":'))).toBeNull()
    expect(await readJsonBody(post('not json'))).toBeNull()
  })

  it('オブジェクトでない JSON も null', async () => {
    expect(await readJsonBody(post('[1,2]'))).toBeNull()
    expect(await readJsonBody(post('42'))).toBeNull()
    expect(await readJsonBody(post('null'))).toBeNull()
  })

  it('空の本文・POST 以外は {}', async () => {
    expect(await readJsonBody(post(''))).toEqual({})
    expect(await readJsonBody(new Request('https://x.test/fn', { method: 'GET' }))).toEqual({})
  })
})

describe('errorResponse', () => {
  it('ステータスつきで { ok: false, error, code } を返す', async () => {
    const res = errorResponse(400, 'notion_bad_url', 'notion_bad_url')
    expect(res.status).toBe(400)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.json()).toEqual({ ok: false, code: 'notion_bad_url', error: 'notion_bad_url' })
  })

  it('code が無ければ error だけ', async () => {
    expect(await errorResponse(500, 'Internal error').json()).toEqual({ ok: false, error: 'Internal error' })
  })

  it('jsonResponse の既定は 200', () => {
    expect(jsonResponse({ ok: true }).status).toBe(200)
  })
})

describe('integrationErrorStatus', () => {
  it('入力の誤りは 400、送りすぎは 429、連携先の失敗は 502', () => {
    expect(integrationErrorStatus('canvas_bad_url')).toBe(400)
    expect(integrationErrorStatus('notion_bad_url')).toBe(400)
    expect(integrationErrorStatus('canvas_feed_invalid')).toBe(400)
    expect(integrationErrorStatus('canvas_too_many')).toBe(400)
    expect(integrationErrorStatus('notion_rate_limited')).toBe(429)
    expect(integrationErrorStatus('canvas_unauthorized')).toBe(502)
    expect(integrationErrorStatus('notion_not_shared')).toBe(502)
    expect(integrationErrorStatus('canvas_api')).toBe(502)
  })
})

describe('retryAfterMs', () => {
  it('秒・HTTP の日時を ms に', () => {
    expect(retryAfterMs('2', 5000)).toBe(2000)
    expect(retryAfterMs('0', 5000)).toBe(0)
    const now = Date.parse('2026-10-19T00:00:00Z')
    expect(retryAfterMs('Mon, 19 Oct 2026 00:00:03 GMT', 5000, now)).toBe(3000)
  })

  it('無い・読めない・長すぎるときは null', () => {
    expect(retryAfterMs(null, 5000)).toBeNull()
    expect(retryAfterMs('soon', 5000)).toBeNull()
    expect(retryAfterMs('60', 5000)).toBeNull()
  })
})
