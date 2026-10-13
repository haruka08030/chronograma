import { isPrivateAddress } from './address.ts'

/**
 * 利用者が入れた宛先（Canvas・Moodle の学校のサイト）へ送る `fetch` の代わり。内部のサーバーへ届かせないため、
 * 名前を引いて公開のアドレスだけだと確かめ、**確かめたアドレスにそのままつなぐ**。
 *
 * `fetch` は自分でもう一度名前を引くので、確かめたあとで名前の向き先を内部へ替えられると（DNS rebinding）すり抜ける。
 * `Deno.createHttpClient` の `proxy: { transport: 'tcp' }` は接続先を固定できるが、TLS を張らずに平文の HTTP を送るので使えない。
 * そこで、確かめたアドレスへ TCP でつなぎ（`Deno.connect`）、元の名前で TLS を張って証明書を確かめ（`Deno.startTls`）、
 * その上で HTTP/1.1 を 1 回だけ送る（`Connection: close`）。
 *
 * - https だけ。リダイレクトは追わない（3xx をそのまま返す。追うかは呼び出し元が決め、行き先も同じように確かめる）
 * - 名前が引けない・どれか 1 つでも内部のアドレスを指す名前は送らない（`BlockedAddressError`）
 * - 応答は Content-Length・chunked・切断までの 3 通りで読む。gzip / deflate は戻す。それ以外の圧縮は断る
 * - 全体（つなぐ・送る・本文を読み終えるまで）に時間の上限（既定 30 秒）。過ぎたら接続を切る
 */

/** 双方向のストリーム（Deno の `TlsConn` と同じ形。テストでは手で作る） */
export type Conn = {
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
  close(): void
}

export type PinnedDeps = {
  /** 名前の A / AAAA を引く（引けなければ空） */
  resolve: (host: string) => Promise<string[]>
  /** `address` へつなぎ、`serverName` で TLS を張る（証明書も `serverName` で確かめる） */
  dial: (address: string, port: number, serverName: string) => Promise<Conn>
}

export type PinnedInit = {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
  /** 全体の時間の上限（ミリ秒） */
  timeoutMs?: number
}

export const DEFAULT_TIMEOUT_MS = 30_000
/** 応答の頭（状態行とヘッダー）の大きさの上限 */
const MAX_HEAD_BYTES = 64 * 1024

/** 名前が引けない・内部のアドレスを指す宛先 */
export class BlockedAddressError extends Error {
  constructor(
    public host: string,
    public reason: 'unresolvable' | 'private',
  ) {
    super(reason === 'private' ? 'Private address' : 'Unresolvable host')
    this.name = 'BlockedAddressError'
  }
}

/** 応答が HTTP/1.1 の形になっていない */
export class HttpProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HttpProtocolError'
  }
}

/** 名前（か IP の書き方）を引いて、つないでよいアドレスの並びを返す。1 つでも内部なら断る（混ぜて返す名前も断る） */
export async function resolvePublic(host: string, resolve: PinnedDeps['resolve']): Promise<string[]> {
  const literal = host.startsWith('[') ? host.slice(1, -1) : /^[\d.]+$/.test(host) ? host : null
  const addresses = literal ? [literal] : await resolve(host)
  if (addresses.length === 0) throw new BlockedAddressError(host, 'unresolvable')
  if (addresses.some(isPrivateAddress)) throw new BlockedAddressError(host, 'private')
  return addresses
}

/** Deno での名前解決と接続 */
export const denoDeps: PinnedDeps = {
  async resolve(host) {
    if (typeof Deno.resolveDns !== 'function') throw new Error('Deno.resolveDns is unavailable')
    const lookups = await Promise.all((['A', 'AAAA'] as const).map((type) => Deno.resolveDns(host, type).catch(() => [] as string[])))
    return lookups.flat()
  },
  async dial(address, port, serverName) {
    const tcp = await Deno.connect({ hostname: address, port })
    try {
      return await Deno.startTls(tcp, { hostname: serverName })
    } catch (e) {
      tcp.close()
      throw e
    }
  },
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/** 読んだ分をためながら、行・決まった長さ・届いた分を取り出す */
class ByteReader {
  private buf: Uint8Array = new Uint8Array(0)
  private ended = false

  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {}

  private async more(): Promise<boolean> {
    if (this.ended) return false
    const { done, value } = await this.reader.read()
    if (done) {
      this.ended = true
      return false
    }
    this.buf = concat(this.buf, value)
    return true
  }

  /** 改行（CRLF か LF）までの 1 行。終わりに来たら null */
  async line(max: number): Promise<string | null> {
    for (;;) {
      const i = this.buf.indexOf(10)
      if (i >= 0) {
        const raw = this.buf.subarray(0, i)
        this.buf = this.buf.subarray(i + 1)
        return new TextDecoder('latin1').decode(raw).replace(/\r$/, '')
      }
      if (this.buf.length > max) throw new HttpProtocolError('Line too long')
      if (!(await this.more())) {
        if (this.buf.length > 0) throw new HttpProtocolError('Connection closed mid-line')
        return null
      }
    }
  }

  /** ためた分か次に届いた分（`max` バイトまで）。終わりに来たら null */
  async chunk(max: number): Promise<Uint8Array | null> {
    if (this.buf.length === 0 && !(await this.more())) return null
    const out = this.buf.subarray(0, Math.min(max, this.buf.length))
    this.buf = this.buf.subarray(out.length)
    return out
  }
}

type Head = { status: number; statusText: string; headers: Headers }

async function readHead(r: ByteReader): Promise<Head> {
  for (;;) {
    const statusLine = await r.line(MAX_HEAD_BYTES)
    if (statusLine === null) throw new HttpProtocolError('No response')
    const m = /^HTTP\/1\.[01] (\d{3})(?: (.*))?$/.exec(statusLine)
    if (!m) throw new HttpProtocolError('Bad status line')
    const headers = new Headers()
    let size = statusLine.length
    for (;;) {
      const line = await r.line(MAX_HEAD_BYTES)
      if (line === null) throw new HttpProtocolError('Connection closed in headers')
      if (line === '') break
      size += line.length
      if (size > MAX_HEAD_BYTES) throw new HttpProtocolError('Headers too large')
      const colon = line.indexOf(':')
      if (colon <= 0) continue
      try {
        headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim())
      } catch {
        // 読めない名前・値のヘッダーは捨てる
      }
    }
    const status = Number(m[1])
    // 100 Continue・103 Early Hints などは読み飛ばして本当の応答を待つ
    if (status < 200) continue
    if (status > 599) throw new HttpProtocolError('Bad status')
    return { status, statusText: m[2] ?? '', headers }
  }
}

type Framing = { type: 'none' } | { type: 'length'; length: number } | { type: 'chunked' } | { type: 'close' }

function framing(method: string, head: Head): Framing {
  if (method === 'HEAD' || head.status === 204 || head.status === 304) return { type: 'none' }
  if (/(^|,)\s*chunked\s*$/i.test(head.headers.get('transfer-encoding') ?? '')) return { type: 'chunked' }
  const declared = head.headers.get('content-length')
  if (declared !== null) {
    if (!/^\d+$/.test(declared.trim())) throw new HttpProtocolError('Bad Content-Length')
    return { type: 'length', length: Number(declared) }
  }
  return { type: 'close' }
}

/** 本文のストリーム。読み終えた・失敗した・捨てたときに `finish`（接続を切る） */
function bodyStream(r: ByteReader, frame: Framing, finish: () => void): ReadableStream<Uint8Array> {
  let remaining = frame.type === 'length' ? frame.length : 0
  /** chunked の今のかたまりの残り */
  let left = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (frame.type === 'none' || (frame.type === 'length' && remaining === 0)) {
          finish()
          controller.close()
          return
        }
        if (frame.type === 'length') {
          const c = await r.chunk(remaining)
          if (!c) throw new HttpProtocolError('Connection closed before the body ended')
          remaining -= c.length
          controller.enqueue(c)
          return
        }
        if (frame.type === 'close') {
          const c = await r.chunk(Infinity)
          if (!c) {
            finish()
            controller.close()
            return
          }
          controller.enqueue(c)
          return
        }
        if (left === 0) {
          const sizeLine = await r.line(1024)
          const size = sizeLine?.split(';')[0].trim() ?? ''
          if (!/^[0-9a-fA-F]{1,8}$/.test(size)) throw new HttpProtocolError('Bad chunk size')
          left = parseInt(size, 16)
          if (left === 0) {
            // 最後のかたまりのあとのトレーラーを空行まで読み飛ばす
            for (;;) {
              const trailer = await r.line(MAX_HEAD_BYTES)
              if (trailer === null || trailer === '') break
            }
            finish()
            controller.close()
            return
          }
        }
        const c = await r.chunk(left)
        if (!c) throw new HttpProtocolError('Connection closed in a chunk')
        left -= c.length
        controller.enqueue(c)
        if (left === 0 && (await r.line(16)) !== '') throw new HttpProtocolError('Missing chunk terminator')
      } catch (e) {
        finish()
        controller.error(e)
      }
    },
    cancel() {
      finish()
    },
  })
}

function decoded(body: ReadableStream<Uint8Array>, headers: Headers): ReadableStream<Uint8Array> {
  const encoding = (headers.get('content-encoding') ?? 'identity').trim().toLowerCase()
  if (encoding === 'identity' || encoding === '') return body
  const format = encoding === 'gzip' || encoding === 'x-gzip' ? 'gzip' : encoding === 'deflate' ? 'deflate' : null
  if (!format) throw new HttpProtocolError(`Unsupported Content-Encoding ${encoding}`)
  // 戻したあとの長さは分からないので、本文の長さの印は外す（大きさの上限は読む側がストリームで数える）
  headers.delete('content-length')
  headers.delete('content-encoding')
  return body.pipeThrough(new DecompressionStream(format) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
}

/**
 * `input`（https の URL）へ 1 回だけ送り、応答を返す。名前は 1 回だけ引き、確かめたアドレスにつなぐ。
 * つなげなければ並びの次のアドレスを試す（どれも確かめたアドレス）
 */
export async function pinnedFetch(input: string, init: PinnedInit = {}, deps: PinnedDeps = denoDeps): Promise<Response> {
  const url = new URL(input)
  if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError('Only https URLs without credentials')
  const method = (init.method ?? 'GET').toUpperCase()
  if (init.signal?.aborted) throw init.signal.reason
  const addresses = await resolvePublic(url.hostname, deps.resolve)
  const port = url.port ? Number(url.port) : 443

  let conn: Conn | null = null
  let finished = false
  let rejectStop: (reason: unknown) => void = () => {}
  const stopped = new Promise<never>((_, reject) => (rejectStop = reject))
  stopped.catch(() => {})
  const finish = () => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', onAbort)
    try {
      conn?.close()
    } catch {
      // もう閉じている
    }
  }
  const stop = (reason: unknown) => {
    rejectStop(reason)
    finish()
  }
  const onAbort = () => stop(init.signal?.reason ?? new DOMException('The request was aborted', 'AbortError'))
  const timer = setTimeout(() => stop(new DOMException('The request timed out', 'TimeoutError')), init.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  init.signal?.addEventListener('abort', onAbort, { once: true })
  /** 止められたらすぐ投げる（つなぐ・送る・頭を読む間） */
  const guard = <T>(p: Promise<T>) => Promise.race([p, stopped])

  try {
    let lastError: unknown = new Error('No address')
    for (const address of addresses) {
      try {
        conn = await guard(deps.dial(address, port, url.hostname))
        break
      } catch (e) {
        if (finished) throw e
        lastError = e
      }
    }
    if (!conn) throw lastError
    if (finished) {
      conn.close()
      throw new DOMException('The request was aborted', 'AbortError')
    }

    const body = init.body !== undefined ? new TextEncoder().encode(init.body) : null
    const headers = new Headers(init.headers)
    headers.set('Host', url.host)
    headers.set('Connection', 'close')
    headers.set('Accept-Encoding', 'identity')
    if (!headers.has('User-Agent')) headers.set('User-Agent', 'Chronograma')
    if (body || method === 'POST' || method === 'PUT' || method === 'PATCH') headers.set('Content-Length', String(body?.length ?? 0))
    let request = `${method} ${url.pathname}${url.search} HTTP/1.1\r\n`
    headers.forEach((value, name) => (request += `${name}: ${value}\r\n`))
    const writer = conn.writable.getWriter()
    await guard(writer.write(new TextEncoder().encode(`${request}\r\n`)))
    if (body && body.length > 0) await guard(writer.write(body))
    writer.releaseLock()

    const reader = new ByteReader(conn.readable.getReader())
    const res = await guard(readHead(reader))
    const frame = framing(method, res)
    if (frame.type === 'none') {
      finish()
      return new Response(null, { status: res.status, statusText: res.statusText, headers: res.headers })
    }
    const stream = decoded(bodyStream(reader, frame, finish), res.headers)
    return new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers })
  } catch (e) {
    finish()
    throw e
  }
}
