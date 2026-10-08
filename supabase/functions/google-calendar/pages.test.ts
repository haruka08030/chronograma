import { describe, expect, it } from 'vitest'
import { collectEventPages, MAX_EVENT_PAGES, type EventPage } from './pages.ts'

type Item = { id: string; date: string }

/** 範囲の予定を、Google のように pageSize 件ずつ nextPageToken で返す */
function pagedCalendar(all: Item[], pageSize: number) {
  const tokens: Array<string | undefined> = []
  const loadPage = async (pageToken: string | undefined): Promise<EventPage<Item>> => {
    tokens.push(pageToken)
    const start = pageToken ? Number(pageToken.replace('p', '')) : 0
    const end = start + pageSize
    return { items: all.slice(start, end), nextPageToken: end < all.length ? `p${end}` : undefined }
  }
  return { loadPage, tokens }
}

function events(n: number): Item[] {
  // 6 週間（42 日）に散らした n 件。後ろほど日付が先
  return Array.from({ length: n }, (_, i) => ({ id: `e${i}`, date: `day-${String(Math.floor((i * 42) / n)).padStart(2, '0')}` }))
}

describe('collectEventPages', () => {
  it('follows nextPageToken so a range with more than 250 events keeps the last day (#322)', async () => {
    const all = events(260)
    const { loadPage, tokens } = pagedCalendar(all, 250)
    const r = await collectEventPages(loadPage)
    expect(r.truncated).toBe(false)
    expect(r.items).toHaveLength(260)
    expect(r.items.at(-1)).toEqual(all.at(-1))
    expect(r.items.at(-1)?.date).toBe('day-41')
    expect(tokens).toEqual([undefined, 'p250'])
  })

  it('makes a single request when everything fits in one page', async () => {
    const { loadPage, tokens } = pagedCalendar(events(3), 250)
    const r = await collectEventPages(loadPage)
    expect(r).toEqual({ items: events(3), truncated: false })
    expect(tokens).toEqual([undefined])
  })

  it('treats a page without items as empty and an empty token as the end', async () => {
    const r = await collectEventPages(async () => ({ nextPageToken: '' }))
    expect(r).toEqual({ items: [], truncated: false })
  })

  it('stops at the page limit and reports that events were left out', async () => {
    const { loadPage, tokens } = pagedCalendar(events(50), 2)
    const r = await collectEventPages(loadPage, 3)
    expect(r.items).toHaveLength(6)
    expect(r.truncated).toBe(true)
    expect(tokens).toHaveLength(3)
    expect(MAX_EVENT_PAGES).toBeGreaterThan(1)
  })

  it('passes a page error through (no partial result)', async () => {
    let calls = 0
    const loadPage = async (): Promise<EventPage<Item>> => {
      calls++
      if (calls === 2) throw new Error('boom')
      return { items: events(1), nextPageToken: 'next' }
    }
    await expect(collectEventPages(loadPage)).rejects.toThrow('boom')
  })
})
