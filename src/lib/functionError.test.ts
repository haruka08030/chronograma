import { describe, expect, it } from 'vitest'
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { classifyFunctionError, functionErrorMessage, readFunctionErrorBody } from './functionError'
import { isNetworkErrorMessage } from './errorMessages'

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

  it('supabase-js を読まずに見分ける（名前が FunctionsHttpError で context が Response なら読む、#268）', async () => {
    const err = Object.assign(new Error('non-2xx'), { name: 'FunctionsHttpError', context: new Response('{"error":"x"}', { status: 400 }) })
    expect(await readFunctionErrorBody(err)).toEqual({ error: 'x' })
    const noResponse = Object.assign(new Error('non-2xx'), { name: 'FunctionsHttpError', context: { json: async () => ({}) } })
    expect(await readFunctionErrorBody(noResponse)).toBeNull()
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
    expect(await functionErrorMessage(httpError('oops', 400))).toBe('Edge Function returned a non-2xx status code')
    expect(await functionErrorMessage('weird')).toBe('Edge Function request failed')
  })

  it('届かなかった・ゲートウェイの 5xx はネットワークの失敗の文言（「保存に失敗」にしない）', async () => {
    for (const err of [
      new FunctionsFetchError(new TypeError('Failed to fetch')),
      new FunctionsRelayError({}),
      httpError('Bad Gateway', 502),
    ]) {
      const message = await functionErrorMessage(err)
      expect(isNetworkErrorMessage(message)).toBe(true)
      expect(message).not.toMatch(/non-2xx/)
    }
  })
})

describe('classifyFunctionError', () => {
  it('関数の本文があれば http と状態コード・コード', async () => {
    const err = httpError(JSON.stringify({ ok: false, code: 'canvas_api', error: 'canvas_api' }), 502)
    expect(await classifyFunctionError(err)).toEqual({ kind: 'http', status: 502, code: 'canvas_api', message: 'canvas_api' })
  })

  it('FunctionsFetchError・FunctionsRelayError・JSON でない 5xx は network', async () => {
    expect((await classifyFunctionError(new FunctionsFetchError(new TypeError('Failed to fetch')))).kind).toBe('network')
    expect((await classifyFunctionError(new FunctionsRelayError({}))).kind).toBe('network')
    expect(await classifyFunctionError(httpError('<html>', 503))).toMatchObject({ kind: 'network', status: 503, code: null })
  })

  it('JSON でない 4xx は http（コードなし）、それ以外は unknown', async () => {
    expect(await classifyFunctionError(httpError('nope', 404))).toMatchObject({ kind: 'http', status: 404, code: null })
    expect(await classifyFunctionError(new Error('x'))).toEqual({ kind: 'unknown', status: null, code: null, message: 'x' })
  })
})
