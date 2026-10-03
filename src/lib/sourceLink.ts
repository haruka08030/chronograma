/**
 * メモが URL 1 つだけのタスク（Canvas・Notion から取り込んだもの、自分で URL だけ貼ったもの）は、
 * 一覧の行に URL の文字列を出さず「開く」アイコンにする。そのための判定。
 */
export type SourceLink = { url: string; service: 'canvas' | 'notion' | null }

export function sourceLinkOf(description: string): SourceLink | null {
  const text = description.trim()
  if (!/^https?:\/\/\S+$/i.test(text)) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  const service =
    host === 'notion.so' || host.endsWith('.notion.so') || host.endsWith('.notion.site')
      ? 'notion'
      : host.endsWith('.instructure.com') || /^\/courses\/\d+\//.test(url.pathname)
        ? 'canvas'
        : null
  return { url: url.toString(), service }
}
