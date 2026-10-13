import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { BlockedAddressError, HttpProtocolError, pinnedFetch, resolvePublic, type Conn, type PinnedDeps } from './pinnedFetch.ts'

const enc = new TextEncoder()

/** 応答のバイト列（いくつかに分けて届く）を返し、送られたバイト列を覚える接続 */
function fakeConn(chunks: (string | Uint8Array)[], { hang = false } = {}) {
  const written: Uint8Array[] = []
  let closed = false
  let i = 0
  const conn: Conn = {
    readable: new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (closed) return controller.error(new Error('closed'))
        if (i < chunks.length) {
          const c = chunks[i++]
          controller.enqueue(typeof c === 'string' ? enc.encode(c) : c)
          return
        }
        if (hang) return new Promise<void>(() => {})
        controller.close()
      },
    }),
    writable: new WritableStream<Uint8Array>({
      write(chunk) {
        written.push(chunk)
      },
    }),
    close() {
      closed = true
    },
  }
  return {
    conn,
    request: () => new TextDecoder().decode(Uint8Array.from(written.flatMap((w) => [...w]))),
    isClosed: () => closed,
  }
}

/** 名前を引いた結果と、つないだ先を覚える */
function deps(addresses: string[], conn: Conn | (() => Promise<Conn>)) {
  const dialed: { address: string; port: number; serverName: string }[] = []
  const d: PinnedDeps = {
    resolve: async () => addresses,
    dial: async (address, port, serverName) => {
      dialed.push({ address, port, serverName })
      return typeof conn === 'function' ? conn() : conn
    },
  }
  return { d, dialed }
}

describe('resolvePublic', () => {
  it('公開のアドレスだけならその並びを返す', async () => {
    expect(await resolvePublic('canvas.example.edu', async () => ['93.184.216.34', '2606:2800:220:1::1'])).toEqual([
      '93.184.216.34',
      '2606:2800:220:1::1',
    ])
  })

  it('1 つでも内部を指す名前・引けない名前は断る', async () => {
    await expect(resolvePublic('evil.example', async () => ['93.184.216.34', '127.0.0.1'])).rejects.toThrow(BlockedAddressError)
    await expect(resolvePublic('evil.example', async () => ['169.254.169.254'])).rejects.toThrow(BlockedAddressError)
    await expect(resolvePublic('evil.example', async () => ['::ffff:10.0.0.1'])).rejects.toThrow(BlockedAddressError)
    await expect(resolvePublic('gone.example', async () => [])).rejects.toThrow(BlockedAddressError)
  })

  it('IP の書き方の宛先は名前を引かずにそのアドレスで決める', async () => {
    const resolve = async () => {
      throw new Error('should not resolve')
    }
    await expect(resolvePublic('127.0.0.1', resolve)).rejects.toThrow(BlockedAddressError)
    await expect(resolvePublic('[::1]', resolve)).rejects.toThrow(BlockedAddressError)
    expect(await resolvePublic('8.8.8.8', resolve)).toEqual(['8.8.8.8'])
  })
})

describe('pinnedFetch', () => {
  it('確かめたアドレスにつなぎ、元の名前で TLS を張って 1 回だけ送る', async () => {
    const c = fakeConn(['HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n', '{"ok":true}'])
    const { d, dialed } = deps(['93.184.216.34'], c.conn)
    const res = await pinnedFetch(
      'https://canvas.example.edu/api/v1/users/self?per_page=100',
      { headers: { Authorization: 'Bearer t', Accept: 'application/json' } },
      d,
    )
    expect(dialed).toEqual([{ address: '93.184.216.34', port: 443, serverName: 'canvas.example.edu' }])
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const req = c.request()
    expect(req.startsWith('GET /api/v1/users/self?per_page=100 HTTP/1.1\r\n')).toBe(true)
    expect(req).toMatch(/\r\nhost: canvas\.example\.edu\r\n/i)
    expect(req).toMatch(/\r\nconnection: close\r\n/i)
    expect(req).toMatch(/\r\nauthorization: Bearer t\r\n/i)
    expect(req.endsWith('\r\n\r\n')).toBe(true)
    expect(c.isClosed()).toBe(true)
  })

  it('名前が内部を指すときは、つながずに断る（確かめたあとの引き直しも無い）', async () => {
    const c = fakeConn([])
    let lookups = 0
    const d: PinnedDeps = {
      resolve: async () => (++lookups === 1 ? ['10.0.0.5'] : ['93.184.216.34']),
      dial: async () => c.conn,
    }
    await expect(pinnedFetch('https://rebind.example/', {}, d)).rejects.toThrow(BlockedAddressError)
    expect(lookups).toBe(1)
  })

  it('名前は 1 回だけ引く（つなぐ先を fetch に引き直させない）', async () => {
    const c = fakeConn(['HTTP/1.1 204 No Content\r\n\r\n'])
    let lookups = 0
    const dialed: string[] = []
    const d: PinnedDeps = {
      resolve: async () => (++lookups === 1 ? ['93.184.216.34'] : ['127.0.0.1']),
      dial: async (address) => {
        dialed.push(address)
        return c.conn
      },
    }
    const res = await pinnedFetch('https://school.example/', {}, d)
    expect(res.status).toBe(204)
    expect(lookups).toBe(1)
    expect(dialed).toEqual(['93.184.216.34'])
  })

  it('つなげなければ次の確かめたアドレスを試す', async () => {
    const c = fakeConn(['HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok'])
    let n = 0
    const { d, dialed } = deps(['93.184.216.34', '2606:2800:220:1::1'], async () => {
      if (n++ === 0) throw new Error('ECONNREFUSED')
      return c.conn
    })
    const res = await pinnedFetch('https://school.example/', {}, d)
    expect(await res.text()).toBe('ok')
    expect(dialed.map((x) => x.address)).toEqual(['93.184.216.34', '2606:2800:220:1::1'])
  })

  it('リダイレクトは追わずに 3xx と行き先を返す', async () => {
    const c = fakeConn(['HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1/admin\r\nContent-Length: 0\r\n\r\n'])
    const { d, dialed } = deps(['93.184.216.34'], c.conn)
    const res = await pinnedFetch('https://school.example/feeds/calendars/user_x.ics', {}, d)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://127.0.0.1/admin')
    expect(dialed).toHaveLength(1)
  })

  it('chunked の本文をつなげて読む（かたまりが分かれて届いても）', async () => {
    const c = fakeConn([
      'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nLink: <https://school.example/api?page=2>; rel="next"\r\n\r\n',
      '5\r\nBEG',
      'IN\r\n7;ext=1\r\n:VCALEN\r\n',
      '5\r\nDAR\r\n\r\n',
      '0\r\nX-Trailer: 1\r\n\r\n',
    ])
    const { d } = deps(['93.184.216.34'], c.conn)
    const res = await pinnedFetch('https://school.example/', {}, d)
    expect(res.headers.get('link')).toContain('rel="next"')
    expect(await res.text()).toBe('BEGIN:VCALENDAR\r\n')
    expect(c.isClosed()).toBe(true)
  })

  it('Content-Length も chunked も無ければ、切断までを本文にする', async () => {
    const c = fakeConn(['HTTP/1.0 200 OK\r\n\r\nhello ', 'world'])
    const { d } = deps(['93.184.216.34'], c.conn)
    expect(await (await pinnedFetch('https://school.example/', {}, d)).text()).toBe('hello world')
  })

  it('gzip の本文は戻す', async () => {
    const body = gzipSync(Buffer.from('BEGIN:VCALENDAR'))
    const c = fakeConn([`HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: ${body.length}\r\n\r\n`, new Uint8Array(body)])
    const { d } = deps(['93.184.216.34'], c.conn)
    const res = await pinnedFetch('https://school.example/', {}, d)
    expect(res.headers.get('content-length')).toBeNull()
    expect(await res.text()).toBe('BEGIN:VCALENDAR')
  })

  it('100 Continue は読み飛ばす', async () => {
    const c = fakeConn(['HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok'])
    const { d } = deps(['93.184.216.34'], c.conn)
    const res = await pinnedFetch('https://school.example/', {}, d)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('本文を送るときは Content-Length を付ける', async () => {
    const c = fakeConn(['HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}'])
    const { d } = deps(['93.184.216.34'], c.conn)
    await pinnedFetch('https://school.example/api/v1/planner/overrides/1', { method: 'PUT', body: '{"marked_complete":true}' }, d)
    const req = c.request()
    expect(req.startsWith('PUT /api/v1/planner/overrides/1 HTTP/1.1\r\n')).toBe(true)
    expect(req).toMatch(/\r\ncontent-length: 24\r\n/i)
    expect(req.endsWith('\r\n\r\n{"marked_complete":true}')).toBe(true)
  })

  it('本文が途中で切れたら失敗にする', async () => {
    const c = fakeConn(['HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nshort'])
    const { d } = deps(['93.184.216.34'], c.conn)
    const res = await pinnedFetch('https://school.example/', {}, d)
    await expect(res.text()).rejects.toThrow(HttpProtocolError)
  })

  it('HTTP でない応答は失敗にする', async () => {
    const c = fakeConn(['SSH-2.0-OpenSSH\r\n'])
    const { d } = deps(['93.184.216.34'], c.conn)
    await expect(pinnedFetch('https://school.example/', {}, d)).rejects.toThrow(HttpProtocolError)
  })

  it('時間の上限を過ぎたら接続を切って失敗にする', async () => {
    const c = fakeConn([], { hang: true })
    const { d } = deps(['93.184.216.34'], c.conn)
    await expect(pinnedFetch('https://school.example/', { timeoutMs: 20 }, d)).rejects.toThrow(/timed out/)
    expect(c.isClosed()).toBe(true)
  })

  it('https 以外・ユーザー情報付きの URL は送らない', async () => {
    const { d, dialed } = deps(['93.184.216.34'], fakeConn([]).conn)
    await expect(pinnedFetch('http://school.example/', {}, d)).rejects.toThrow(TypeError)
    await expect(pinnedFetch('https://u:p@school.example/', {}, d)).rejects.toThrow(TypeError)
    expect(dialed).toEqual([])
  })
})
