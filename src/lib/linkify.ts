/** URL 検出・Google Map リンク生成の小ユーティリティ。 */

const URL_REGEX = /(https?:\/\/[^\s<>"')]+)/gi

/** テキストを「通常文字列」と「URL」のセグメントに分割する。 */
export type LinkifySegment =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string }

export function linkifySegments(text: string): LinkifySegment[] {
  if (!text) return []
  const segments: LinkifySegment[] = []
  let lastIndex = 0
  for (const match of text.matchAll(URL_REGEX)) {
    const url = match[0]
    const start = match.index ?? 0
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) })
    }
    // 末尾の句読点などはリンクから外す
    const trimmed = url.replace(/[.,;:!?)]+$/, '')
    const trailing = url.slice(trimmed.length)
    segments.push({ type: 'url', value: trimmed })
    if (trailing) segments.push({ type: 'text', value: trailing })
    lastIndex = start + url.length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}

/** テキストに含まれる URL を重複なく抽出する。 */
export function extractUrls(text: string): string[] {
  if (!text) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(URL_REGEX)) {
    const url = match[0].replace(/[.,;:!?)]+$/, '')
    if (!seen.has(url)) {
      seen.add(url)
      out.push(url)
    }
  }
  return out
}

/** 場所文字列から Google Maps の検索 URL を生成する。URL 文字列ならそのまま返す。 */
export function googleMapsUrl(location: string): string {
  const trimmed = location.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`
}
