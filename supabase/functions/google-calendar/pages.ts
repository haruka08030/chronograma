/** Calendar API の events.list の 1 ページ */
export type EventPage<T> = { items?: T[]; nextPageToken?: string }

/**
 * 1 回の取得でたどるページの上限。1 ページ最大 2500 件なので、これを超えるのはふつうの範囲ではありえない
 * （止まらないページ送りで関数が時間切れにならないための歯止め）
 */
export const MAX_EVENT_PAGES = 10

/**
 * `nextPageToken` をたどって範囲内の予定をすべて集める。1 ページ（250 件など）で止めると、
 * `orderBy: startTime` なので範囲の後ろの日の予定が黙って欠ける（#322）。
 * 上限までたどっても続きがあれば `truncated: true`（欠けたことをクライアントに伝える）
 */
export async function collectEventPages<T>(
  loadPage: (pageToken: string | undefined) => Promise<EventPage<T>>,
  maxPages: number = MAX_EVENT_PAGES,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = []
  let pageToken: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const page = await loadPage(pageToken)
    items.push(...(page.items ?? []))
    pageToken = page.nextPageToken || undefined
    if (!pageToken) return { items, truncated: false }
  }
  return { items, truncated: true }
}
