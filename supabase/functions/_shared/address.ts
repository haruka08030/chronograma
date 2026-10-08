/**
 * 外のサイトではないアドレス（内部・ループバック・リンクローカルなど）の判定。名前解決はしない純粋な判定だけ。
 * Canvas の学校のサイトへ送る前（`pinnedFetch.ts`）と、アカウント削除の Canvas の取り消しで使う
 */

function isPrivateV4(a: number, b: number, c: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // リンクローカル（クラウドのメタデータ）
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) || // ベンチマーク用
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) || // 文書用
    a >= 224
  ) // マルチキャスト・予約
}

/** IPv6 を 8 つの 16 ビットの数に広げる。形が違えば null */
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/%.*$/, '')
  // 末尾の IPv4 表記（::ffff:1.2.3.4 など）は 16 ビット 2 つにする
  const v4 = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) {
    const n = v4.slice(1).map(Number)
    if (n.some((x) => x > 255)) return null
    s = s.slice(0, -v4[0].length) + `${((n[0] << 8) | n[1]).toString(16)}:${((n[2] << 8) | n[3]).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const parse = (part: string) => (part ? part.split(':').map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN)) : [])
  const head = parse(halves[0])
  const tail = halves.length === 2 ? parse(halves[1]) : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  const out = [...head, ...Array(Math.max(fill, 0)).fill(0), ...tail]
  return out.length === 8 && out.every((x) => Number.isInteger(x)) && fill >= 0 ? out : null
}

/** IPv4 / IPv6 の内部・ループバック・リンクローカルなど、外のサイトではないアドレスか（読めない形も内部扱い） */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) {
    const n = v4.slice(1).map(Number)
    return n.some((x) => x > 255) || isPrivateV4(n[0], n[1], n[2])
  }
  const w = expandV6(ip)
  if (!w) return true
  const embeddedV4 = () => isPrivateV4(w[6] >> 8, w[6] & 255, w[7] >> 8)
  // ::（未指定）・::1（ループバック）・::a.b.c.d（IPv4 互換）
  if (w.slice(0, 6).every((x) => x === 0)) return true
  // ::ffff:a.b.c.d（IPv4 射影）
  if (w.slice(0, 5).every((x) => x === 0) && w[5] === 0xffff) return embeddedV4()
  // 64:ff9b::a.b.c.d（NAT64）
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0)) return embeddedV4()
  // 2002:aabb:ccdd::（6to4。中の IPv4 で決める）
  if (w[0] === 0x2002) return isPrivateV4(w[1] >> 8, w[1] & 255, w[2] >> 8)
  return (
    (w[0] & 0xfe00) === 0xfc00 || // ユニークローカル fc00::/7
    (w[0] & 0xffc0) === 0xfe80 || // リンクローカル fe80::/10
    (w[0] & 0xffc0) === 0xfec0 || // サイトローカル（廃止）
    (w[0] & 0xff00) === 0xff00 || // マルチキャスト
    (w[0] === 0x2001 && w[1] === 0x0db8)
  ) // 文書用
}
