import { describe, expect, it, vi } from 'vitest'
import { GoogleApiError } from './googleError.ts'
import { GoogleEventDeletedError, patchExisting, splitDeleted, upsertEvent } from './deleted.ts'

/** Google で消されたアプリの予定（#494）: 送っても戻さない・取得で見つける */
type Item = { id: string; status?: string; recurringEventId?: string; updated?: string }
const apiError = (status: number) => new GoogleApiError('calendar', status, [], '{}')
const ID = 'chronograma616263'

/** 返す応答を順に決めた書き込み */
function writer(...results: Array<Item | Error>) {
  const calls: Array<[string, Record<string, unknown>]> = []
  const write = vi.fn(async (method: 'PATCH' | 'POST', fields: Record<string, unknown>) => {
    calls.push([method, fields])
    const next = results.shift()
    if (!next || next instanceof Error) throw next ?? new Error('no more')
    return next
  })
  return { write, calls }
}

describe('upsertEvent', () => {
  it('あれば直す（status は送らない）', async () => {
    const { write, calls } = writer({ id: ID, status: 'confirmed' })
    expect(await upsertEvent(write, ID, { summary: 'a' }, false)).toEqual({ id: ID, status: 'confirmed' })
    expect(calls).toEqual([['PATCH', { summary: 'a' }]])
  })

  it('無ければその ID で作る', async () => {
    const { write, calls } = writer(apiError(404), { id: ID })
    await upsertEvent(write, ID, { summary: 'a' }, false)
    expect(calls.map((c) => c[0])).toEqual(['PATCH', 'POST'])
    expect(calls[1][1]).toEqual({ summary: 'a', id: ID })
  })

  it('Google で消された予定は戻さない（消えたまま返る・410）', async () => {
    await expect(upsertEvent(writer({ id: ID, status: 'cancelled' }).write, ID, {}, false)).rejects.toBeInstanceOf(GoogleEventDeletedError)
    await expect(upsertEvent(writer(apiError(410)).write, ID, {}, false)).rejects.toBeInstanceOf(GoogleEventDeletedError)
    // 作ろうとしたら ID が使われていて（409）、直すと消えていた
    await expect(
      upsertEvent(writer(apiError(404), apiError(409), { id: ID, status: 'cancelled' }).write, ID, {}, false),
    ).rejects.toBeInstanceOf(GoogleEventDeletedError)
  })

  it('アプリが Google から消した予定（revive）は戻す', async () => {
    const { write, calls } = writer({ id: ID, status: 'confirmed' })
    await upsertEvent(write, ID, { summary: 'a' }, true)
    expect(calls).toEqual([['PATCH', { summary: 'a', status: 'confirmed' }]])
  })

  it('ほかの失敗はそのまま投げる', async () => {
    await expect(upsertEvent(writer(apiError(403)).write, ID, {}, false)).rejects.toBeInstanceOf(GoogleApiError)
  })
})

describe('patchExisting', () => {
  it('出ている予定を直したら 404 でも消された扱い', async () => {
    await expect(patchExisting(writer(apiError(404)).write, {}, true)).rejects.toBeInstanceOf(GoogleEventDeletedError)
    await expect(patchExisting(writer({ id: 'x', status: 'cancelled' }).write, {}, true)).rejects.toBeInstanceOf(GoogleEventDeletedError)
    expect(await patchExisting(writer({ id: 'x' }).write, {}, true)).toEqual({ id: 'x' })
  })
})

describe('splitDeleted', () => {
  it('消されたアプリの予定の ID だけ拾い、ほかの消された予定は捨てる', () => {
    const { live, deletedPushed } = splitDeleted<Item>([
      { id: 'a', status: 'confirmed' },
      { id: ID, status: 'cancelled', updated: '2026-10-19T00:00:00Z' },
      { id: 'other', status: 'cancelled' },
      { id: `${ID}_20261019`, status: 'cancelled', recurringEventId: ID },
      { id: 'b' },
    ])
    expect(live.map((e) => e.id)).toEqual(['a', 'b'])
    expect(deletedPushed).toEqual([{ id: ID, updated: '2026-10-19T00:00:00Z' }])
  })
})
