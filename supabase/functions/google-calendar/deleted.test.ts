import { describe, expect, it, vi } from 'vitest'
import { GoogleApiError } from './googleError.ts'
import { GoogleEventDeletedError, patchExisting, skippedCandidates, splitDeleted, upsertEvent } from './deleted.ts'

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

describe('skippedCandidates', () => {
  const TZ = 'Asia/Tokyo'
  const gym = {
    id: 'gym1',
    status: 'cancelled',
    summary: 'gym',
    start: { dateTime: '2026-10-20T18:00:00+09:00' },
    end: { dateTime: '2026-10-20T19:30:00+09:00' },
  }

  it('開始を過ぎてから消した予定はやらなかった予定', () => {
    const [s] = skippedCandidates([{ ...gym, updated: '2026-10-20T22:00:00+09:00' }], new Map(), TZ)
    expect(s).toMatchObject({ id: 'gym1', summary: 'gym', start: gym.start, end: gym.end })
    expect(s.skippedAt).toBe('2026-10-20T13:00:00.000Z')
  })

  it('開始より前に消した・ずっと後で片付けた予定は数えない', () => {
    expect(skippedCandidates([{ ...gym, updated: '2026-10-20T17:59:00+09:00' }], new Map(), TZ)).toEqual([])
    expect(skippedCandidates([{ ...gym, updated: '2026-10-28T18:01:00+09:00' }], new Map(), TZ)).toEqual([])
    expect(skippedCandidates([{ ...gym, updated: undefined }], new Map(), TZ)).toEqual([])
  })

  it('繰り返しの回は親から題名と長さを補う。親が消えている・分からないなら数えない', () => {
    const instance = {
      id: 'class_20261020T090000Z',
      status: 'cancelled',
      recurringEventId: 'class',
      originalStartTime: { dateTime: '2026-10-20T18:00:00+09:00' },
      updated: '2026-10-20T20:00:00+09:00',
    }
    const parent = {
      id: 'class',
      summary: '英語',
      colorId: '5',
      start: { dateTime: '2026-04-07T18:00:00+09:00' },
      end: { dateTime: '2026-04-07T19:30:00+09:00' },
    }
    const [s] = skippedCandidates([instance], new Map([['class', parent]]), TZ)
    expect(s).toMatchObject({
      summary: '英語',
      colorId: '5',
      start: instance.originalStartTime,
      end: { dateTime: '2026-10-20T10:30:00.000Z' },
    })
    expect(skippedCandidates([instance], new Map([['class', { ...parent, status: 'cancelled' }]]), TZ)).toEqual([])
    expect(skippedCandidates([instance], new Map(), TZ)).toEqual([])
  })

  it('終日の予定は、その日になってから消したら', () => {
    const allDay = { id: 'fes', status: 'cancelled', summary: '学祭', start: { date: '2026-10-20' }, end: { date: '2026-10-21' } }
    expect(skippedCandidates([{ ...allDay, updated: '2026-10-20T00:30:00+09:00' }], new Map(), TZ)).toHaveLength(1)
    expect(skippedCandidates([{ ...allDay, updated: '2026-10-19T23:30:00+09:00' }], new Map(), TZ)).toEqual([])
  })
})

describe('splitDeleted（ほかの消された予定）', () => {
  it('アプリの予定とほかの消された予定に分ける', () => {
    const r = splitDeleted([
      { id: 'a' },
      { id: ID, status: 'cancelled', updated: 'u' },
      { id: 'b', status: 'cancelled' },
      { id: `${ID}_r`, status: 'cancelled', recurringEventId: ID },
    ])
    expect(r.live.map((x) => x.id)).toEqual(['a'])
    expect(r.deletedPushed).toEqual([{ id: ID, updated: 'u' }])
    expect(r.deletedOthers.map((x) => x.id)).toEqual(['b'])
  })
})
