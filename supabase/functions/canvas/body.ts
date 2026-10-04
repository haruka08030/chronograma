/**
 * 学校のサイトの応答を大きさの上限つきで読む。巨大な応答でメモリを使い切らせないため。
 * Content-Length が上限を超えていれば読まずに断り、無い・偽っている場合もストリームで数えて上限で打ち切る。
 */

/** .ics・JSON とも、ふつうは数百 KB。これを超えたら読まない */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024

export class ResponseTooLargeError extends Error {
  constructor(public limit: number) {
    super(`Response larger than ${limit} bytes`)
    this.name = 'ResponseTooLargeError'
  }
}

/** 本文を文字列で読む。上限を超えたら `ResponseTooLargeError`（読みかけの本文は捨てる） */
export async function readTextCapped(res: Response, limit = MAX_RESPONSE_BYTES): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    await res.body?.cancel().catch(() => {})
    throw new ResponseTooLargeError(limit)
  }
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => {})
      throw new ResponseTooLargeError(limit)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(out)
}

/** 本文を JSON で読む。上限を超えたら `ResponseTooLargeError`、JSON でなければ SyntaxError */
export async function readJsonCapped<T = unknown>(res: Response, limit = MAX_RESPONSE_BYTES): Promise<T> {
  return JSON.parse(await readTextCapped(res, limit)) as T
}
