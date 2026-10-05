import { describe, expect, it } from 'vitest'
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { functionErrorMessage, readFunctionErrorBody } from './functionError'

const httpError = (body: string, status: number) => new FunctionsHttpError(new Response(body, { status }))

describe('readFunctionErrorBody', () => {
  it('2xx 以外の応答の本文（{ ok: false, code, error }）を読む', async () => {
    const err = httpError(JSON.stringify({ ok: false, code: 'notion_bad_url', error: 'notion_bad_url' }), 400)
    expect(await readFunctionErrorBody(err)).toEqual({ ok: false, code: 'notion_bad_url', error: 'notion_bad_url' })
  })

  it('同じエラーを 2 回読める（本文を使い切らない）', async () => {
    const err = httpError(JSON.stringify({ ok: false, error: 'x' }), 500)
    await readFunctionErrorBody(err)
    expect(await readFunctionErrorBody(err)).toEqual({ ok: false, error: 'x' })
  })

  it('JSON でない本文・関数に届かなかったエラーは null', async () => {
    expect(await readFunctionErrorBody(httpError('Bad Gateway', 502))).toBeNull()
    expect(await readFunctionErrorBody(new FunctionsFetchError(new TypeError('Failed to fetch')))).toBeNull()
    expect(await readFunctionErrorBody(new Error('x'))).toBeNull()
  })
})

describe('functionErrorMessage', () => {
  it('本文の error をそのまま返す（画面の文言の判定に使う）', async () => {
    const err = httpError(JSON.stringify({ ok: false, error: 'Google Calendar not connected. Reconnect in settings.' }), 409)
    expect(await functionErrorMessage(err)).toBe('Google Calendar not connected. Reconnect in settings.')
  })

  it('本文が読めなければ例外の文言', async () => {
    expect(await functionErrorMessage(httpError('oops', 500))).toBe('Edge Function returned a non-2xx status code')
    expect(await functionErrorMessage('weird')).toBe('Edge Function request failed')
  })
})
