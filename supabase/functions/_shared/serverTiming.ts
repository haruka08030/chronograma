/**
 * 応答の `Server-Timing` ヘッダー。関数の中のどの段階（ログイン確認・DB・外のサービス）で何 ms 待ったかを返し、
 * ブラウザの開発者ツール（Network → Timing）や `performance.getEntriesByType('resource')` で見られるようにする。
 * 値は時間と段階の名前だけ（中身は出さない）
 */

export type ServerTiming = {
  /** `fn` にかかった時間を `name` で記録する（失敗しても記録する） */
  time: <T>(name: string, fn: () => Promise<T>) => Promise<T>
  /** `Server-Timing` の値。最後に関数全体の `total` を足す */
  header: () => string
}

/** このインスタンスが最初のリクエストか（コールドスタート。関数の読み込みの時間は total に入らない） */
let warm = false

export function createServerTiming(now: () => number = () => performance.now()): ServerTiming {
  const started = now()
  const cold = !warm
  warm = true
  const entries: string[] = []
  return {
    async time(name, fn) {
      const t0 = now()
      try {
        return await fn()
      } finally {
        entries.push(`${name};dur=${(now() - t0).toFixed(1)}`)
      }
    },
    header() {
      return [...entries, ...(cold ? ['cold'] : []), `total;dur=${(now() - started).toFixed(1)}`].join(', ')
    },
  }
}

/** ハンドラーに計測を渡し、応答に `Server-Timing` を付ける */
export function withServerTiming(handler: (req: Request, timing: ServerTiming) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    const timing = createServerTiming()
    const res = await handler(req, timing)
    const headers = new Headers(res.headers)
    headers.set('Server-Timing', timing.header())
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  }
}
