/**
 * Canvas の宛先の検査。サーバーから学校のサイトへトークン付きで送るので、内部のサーバーへ届かせない。
 * 名前解決はしない純粋な判定だけをここに置く（名前解決と接続先の固定は `_shared/pinnedFetch.ts`）。
 */

/** 内部向けの名前か（localhost・.local・.internal など、ドットの無い名前も） */
export function isInternalName(name: string): boolean {
  const n = name.toLowerCase().replace(/\.$/, '')
  return n === 'localhost' || /\.(localhost|local|internal|intranet|lan|home|corp)$/.test(n) || !n.includes('.')
}

/**
 * 学校の Canvas の URL（`xxx.instructure.com` やダッシュボードのリンク）から origin を取り出す。
 * サーバーから任意の宛先へトークンを送らないよう、https のドメイン名だけを受け付ける。
 */
export function parseBaseUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null
  if (/^[\d.]+$/.test(host) || host.startsWith('[') || isInternalName(host)) return null
  return `https://${host}`
}

export { isPrivateAddress } from '../_shared/address.ts'
