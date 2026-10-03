import { describe, expect, it } from 'vitest'
import { isSealed, openWith, sealWith } from './secretBox.ts'

const KEY = 'test-key-material-0123456789'

describe('secretBox', () => {
  it('暗号化したものは同じ鍵と同じ context で元に戻る', async () => {
    const sealed = await sealWith(KEY, 'ntn_secret', 'notion_connection.token:user-a')
    expect(isSealed(sealed)).toBe(true)
    expect(sealed).not.toContain('ntn_secret')
    expect(await openWith(KEY, sealed, 'notion_connection.token:user-a')).toBe('ntn_secret')
  })

  it('同じ値でも毎回違う暗号文になる', async () => {
    expect(await sealWith(KEY, 'x', 'c')).not.toBe(await sealWith(KEY, 'x', 'c'))
  })

  it('別の人・別の列に写した暗号文は開けない', async () => {
    const sealed = await sealWith(KEY, 'token', 'notion_connection.token:user-a')
    await expect(openWith(KEY, sealed, 'notion_connection.token:user-b')).rejects.toThrow()
    await expect(openWith(KEY, sealed, 'canvas_connection.token:user-a')).rejects.toThrow()
  })

  it('別の鍵では開けず、鍵が無ければ失敗する', async () => {
    const sealed = await sealWith(KEY, 'token', 'c')
    await expect(openWith('other-key', sealed, 'c')).rejects.toThrow()
    await expect(openWith(undefined, sealed, 'c')).rejects.toThrow()
  })

  it('暗号化する前の値はそのまま返す', async () => {
    expect(await openWith(KEY, 'plain-token', 'c')).toBe('plain-token')
    expect(await openWith(undefined, 'plain-token', 'c')).toBe('plain-token')
  })
})
