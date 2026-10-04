/**
 * 外部サービスのトークン（Google のリフレッシュトークン・Notion / Canvas のトークン・Canvas のフィード URL）を
 * DB に置く前に暗号化する。DB の中身やバックアップが漏れても、鍵が無ければ使えないようにするため。
 *
 * - 鍵は secret `TOKEN_ENCRYPTION_KEY`（`openssl rand -base64 32` などの長い乱数）。SHA-256 で AES-256 の鍵にする
 * - 形は `enc:v1:<iv>:<暗号文>`（どちらも base64）。AES-GCM の追加データに「表・列・利用者」を入れ、
 *   別の人や別の列の行へ写しても開けないようにする
 * - `enc:v1:` で始まらない値は暗号化する前の行。そのまま返し、呼び出し元が暗号化して書き直す（`needsSeal`）
 * - 鍵が無いときは保存を拒む（`SecretKeyMissingError`。呼び出し元は 500 を返す）。平文では置かない
 */

const PREFIX = 'enc:v1:'

/** 暗号化の追加データ（表・列・利用者）。読み書きする関数どうしで同じものを使う */
export const secretContext = {
  google: (userId: string) => `google_oauth.refresh_token:${userId}`,
  notion: (userId: string) => `notion_connection.token:${userId}`,
  canvasToken: (userId: string, id: string) => `canvas_connection.token:${userId}:${id}`,
  canvasFeed: (userId: string, id: string) => `canvas_connection.feed_url:${userId}:${id}`,
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

const keyCache = new Map<string, Promise<CryptoKey>>()

function aesKey(material: string): Promise<CryptoKey> {
  let key = keyCache.get(material)
  if (!key) {
    key = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(material))
      .then((raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']))
    keyCache.set(material, key)
  }
  return key
}

export function isSealed(stored: string): boolean {
  return stored.startsWith(PREFIX)
}

/** `context` は「表.列:利用者 id」。開くときも同じものを渡す */
export async function sealWith(material: string, plain: string, context: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) },
    await aesKey(material),
    new TextEncoder().encode(plain),
  )
  return `${PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(data))}`
}

export async function openWith(material: string | undefined, stored: string, context: string): Promise<string> {
  if (!isSealed(stored)) return stored
  if (!material) throw new Error('TOKEN_ENCRYPTION_KEY is not set but the stored token is encrypted')
  const [iv, data] = stored.slice(PREFIX.length).split(':')
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv), additionalData: new TextEncoder().encode(context) },
    await aesKey(material),
    fromBase64(data),
  )
  return new TextDecoder().decode(plain)
}

/** `TOKEN_ENCRYPTION_KEY` が無いのにトークンを保存しようとした */
export class SecretKeyMissingError extends Error {
  constructor() {
    super('TOKEN_ENCRYPTION_KEY is not set; refusing to store the token unencrypted')
    this.name = 'SecretKeyMissingError'
  }
}

function keyMaterial(): string | undefined {
  return Deno.env.get('TOKEN_ENCRYPTION_KEY') || undefined
}

/** 鍵が無ければ `SecretKeyMissingError` */
export function assertSecretKey(material: string | undefined): string {
  if (!material) throw new SecretKeyMissingError()
  return material
}

/** 鍵が無ければ投げる。`sealSecret` の前に呼ぶと、外部サービスに触る前に止められる */
export function requireSecretKey(): string {
  return assertSecretKey(keyMaterial())
}

/** 保存する前に暗号化する。鍵が無ければ `SecretKeyMissingError` */
export async function sealSecret(plain: string, context: string): Promise<string> {
  return sealWith(requireSecretKey(), plain, context)
}

/** 読んだ値を開く。暗号化する前の行はそのまま返す */
export function openSecret(stored: string, context: string): Promise<string> {
  return openWith(keyMaterial(), stored, context)
}

/** 暗号化する前の行で、いまは鍵があるか（読んだついでに暗号化して書き直す） */
export function needsSeal(stored: string): boolean {
  return !isSealed(stored) && keyMaterial() !== undefined
}
