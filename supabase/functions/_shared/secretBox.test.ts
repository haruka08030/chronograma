import { describe, expect, it } from 'vitest'
import {
  assertSecretKey,
  isSealed,
  keyId,
  needsResealWith,
  openWith,
  parsePreviousKeys,
  PlaintextSecretError,
  resealWith,
  SecretKeyMissingError,
  sealWith,
} from './secretBox.ts'

const KEY = 'test-key-material-0123456789'
const NEW_KEY = 'new-key-material-9876543210'

/** 前の形（enc:v1:、鍵の名前なし）で閉じる。鍵を替える前に DB に入った値 */
async function sealV1(material: string, plain: string, context: string): Promise<string> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material))
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) },
    key,
    new TextEncoder().encode(plain),
  )
  const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
  return `enc:v1:${b64(iv)}:${b64(new Uint8Array(data))}`
}

describe('secretBox', () => {
  it('暗号化したものは同じ鍵と同じ context で元に戻る', async () => {
    const sealed = await sealWith(KEY, 'ntn_secret', 'notion_connection.token:user-a')
    expect(isSealed(sealed)).toBe(true)
    expect(sealed).not.toContain('ntn_secret')
    expect(await openWith(KEY, sealed, 'notion_connection.token:user-a')).toBe('ntn_secret')
  })

  it('閉じた値には鍵の名前が付く（鍵そのものは含まない）', async () => {
    const sealed = await sealWith(KEY, 'x', 'c')
    const kid = await keyId(KEY)
    expect(kid).toMatch(/^[0-9a-f]{8}$/)
    expect(sealed.startsWith(`enc:v2:${kid}:`)).toBe(true)
    expect(sealed).not.toContain(KEY)
    expect(await keyId(NEW_KEY)).not.toBe(kid)
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

  it('暗号化されていない値は開かない（閉じ直す処理だけが受け取る）', async () => {
    await expect(openWith(KEY, 'plain-token', 'c')).rejects.toThrow(PlaintextSecretError)
    await expect(openWith(undefined, 'plain-token', 'c')).rejects.toThrow(PlaintextSecretError)
    expect(await openWith(KEY, 'plain-token', 'c', { allowPlaintext: true })).toBe('plain-token')
  })

  it('鍵が無いときは保存を拒む（平文で置かない）', async () => {
    expect(() => assertSecretKey(undefined)).toThrow(SecretKeyMissingError)
    expect(() => assertSecretKey('')).toThrow(SecretKeyMissingError)
    expect(assertSecretKey(KEY)).toBe(KEY)
    await expect(sealWith({ current: undefined, previous: [KEY] }, 'x', 'c')).rejects.toThrow(SecretKeyMissingError)
  })
})

describe('鍵の入れ替え', () => {
  const rotated = { current: NEW_KEY, previous: [KEY] }

  it('鍵を替えても、前の鍵で閉じた値（v2）は前の鍵で開ける', async () => {
    const old = await sealWith(KEY, 'refresh-token', 'google_oauth.refresh_token:u')
    expect(await openWith(rotated, old, 'google_oauth.refresh_token:u')).toBe('refresh-token')
  })

  it('前の形（v1）は今の鍵・前の鍵の順に試して開く', async () => {
    const v1Old = await sealV1(KEY, 'canvas-token', 'canvas_connection.token:u:x')
    const v1New = await sealV1(NEW_KEY, 'canvas-token-2', 'canvas_connection.token:u:x')
    expect(await openWith(rotated, v1Old, 'canvas_connection.token:u:x')).toBe('canvas-token')
    expect(await openWith(rotated, v1New, 'canvas_connection.token:u:x')).toBe('canvas-token-2')
    await expect(openWith({ current: NEW_KEY, previous: [] }, v1Old, 'canvas_connection.token:u:x')).rejects.toThrow()
  })

  it('前の鍵を外すと、前の鍵の値は開けない（鍵の名前が合わない）', async () => {
    const old = await sealWith(KEY, 't', 'c')
    await expect(openWith({ current: NEW_KEY, previous: [] }, old, 'c')).rejects.toThrow(/No key/)
  })

  it('今の鍵の v2 でない値だけ閉じ直しが要る', async () => {
    const fresh = await sealWith(rotated, 't', 'c')
    expect(await needsResealWith(rotated, fresh)).toBe(false)
    expect(await needsResealWith(rotated, await sealWith(KEY, 't', 'c'))).toBe(true)
    expect(await needsResealWith(rotated, await sealV1(NEW_KEY, 't', 'c'))).toBe(true)
    expect(await needsResealWith(rotated, 'plain')).toBe(true)
    // 今の鍵が無ければ閉じ直せない
    expect(await needsResealWith({ current: undefined, previous: [KEY] }, 'plain')).toBe(false)
  })

  it('閉じ直すと今の鍵の v2 になり、前の鍵を外しても開ける', async () => {
    for (const stored of [await sealWith(KEY, 'tok', 'c'), await sealV1(KEY, 'tok', 'c'), 'tok']) {
      const resealed = await resealWith(rotated, stored, 'c')
      expect(resealed.startsWith(`enc:v2:${await keyId(NEW_KEY)}:`)).toBe(true)
      expect(await openWith({ current: NEW_KEY, previous: [] }, resealed, 'c')).toBe('tok')
    }
  })

  it('前の鍵の並びはカンマ・空白で区切る', () => {
    expect(parsePreviousKeys(undefined)).toEqual([])
    expect(parsePreviousKeys('')).toEqual([])
    expect(parsePreviousKeys(' a, b\nc ,')).toEqual(['a', 'b', 'c'])
  })
})
