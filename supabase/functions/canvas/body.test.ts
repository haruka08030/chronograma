import { describe, expect, it } from 'vitest'
import { readJsonCapped, readTextCapped, ResponseTooLargeError } from './body.ts'

/** Content-Length を付けずに、決まった大きさの塊を流す応答 */
function streamed(chunks: number, chunkSize: number): Response {
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunks) return controller.close()
      sent++
      controller.enqueue(new Uint8Array(chunkSize).fill(97))
    },
  })
  return new Response(body)
}

describe('readTextCapped', () => {
  it('上限以内なら全部読む', async () => {
    expect(await readTextCapped(new Response('BEGIN:VCALENDAR'), 100)).toBe('BEGIN:VCALENDAR')
    expect(await readTextCapped(streamed(3, 10), 30)).toBe('a'.repeat(30))
  })

  it('Content-Length が上限を超えていれば読まずに断る', async () => {
    const res = new Response('small', { headers: { 'Content-Length': '999999999' } })
    await expect(readTextCapped(res, 100)).rejects.toBeInstanceOf(ResponseTooLargeError)
  })

  it('Content-Length が無くても、読んだ量が上限を超えたら打ち切る', async () => {
    await expect(readTextCapped(streamed(1000, 1024), 10 * 1024)).rejects.toBeInstanceOf(ResponseTooLargeError)
  })

  it('JSON も同じ上限で読む', async () => {
    expect(await readJsonCapped(new Response('[1,2]'), 100)).toEqual([1, 2])
    await expect(readJsonCapped(streamed(20, 10), 100)).rejects.toBeInstanceOf(ResponseTooLargeError)
    await expect(readJsonCapped(new Response('<html>'), 100)).rejects.toThrow(SyntaxError)
  })
})
