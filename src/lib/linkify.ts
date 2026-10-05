/** URL 検出・Google Map リンク生成の小ユーティリティ。 */

const URL_REGEX = /(https?:\/\/[^\s<>"')]+)/gi

/** テキストを「通常文字列」と「URL」のセグメントに分割する。 */
export type LinkifySegment = { type: 'text'; value: string } | { type: 'url'; value: string }

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

/**
 * メモの中で見せるリンクの文字。`https://` と `www.` を外し、長ければ最初の階層までにして「…」を付ける。
 * 例: `https://docs.google.com/document/d/1AbC/edit` → `docs.google.com/document/…`
 */
export function shortUrlLabel(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  const host = parsed.hostname.replace(/^www\./i, '')
  const full = `${host}${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/\/$/, '')
  if (full.length <= 40) return full
  const first = parsed.pathname.split('/').find(Boolean)
  if (!first) return `${host}/…`
  return `${host}/${first.length > 20 ? `${first.slice(0, 20)}…` : first}/…`
}

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * Google カレンダーの説明（HTML のことがある）をメモと同じテキストに直す。
 * 改行（`<br>`・段落・リスト）は残し、`<a href>` は URL を残して押せるようにする。
 */
export function htmlToPlainText(html: string): string {
  if (!/<[a-z!/][^>]*>|&[a-z#0-9]+;/i.test(html)) return html.trim()
  return html
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]*>/g, '').trim()
      return !text || text === href || href.includes(text) ? href : `${text} ${href}`
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n・')
    .replace(/<\/(p|div|ul|ol|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === '#') {
        const n = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : m
      }
      return HTML_ENTITIES[code.toLowerCase()] ?? m
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
