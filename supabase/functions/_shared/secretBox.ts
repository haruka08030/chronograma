/**
 * 外部サービスのトークン（Google のリフレッシュトークン・Notion / Canvas のトークン・Canvas のフィード URL）を
 * DB に置く前に暗号化する。DB の中身やバックアップが漏れても、鍵が無ければ使えないようにするため。
 *
 * - 今の鍵は secret `TOKEN_ENCRYPTION_KEY`（`openssl rand -base64 32` などの長い乱数）。SHA-256 で AES-256 の鍵にする
 * - 前の鍵は secret `TOKEN_ENCRYPTION_PREVIOUS_KEYS`（カンマか空白で区切る。開くときだけ使う）。鍵を替えても連携は切れない
 * - 形は `enc:v2:<鍵の名前>:<iv>:<暗号文>`（iv・暗号文は base64）。鍵の名前は鍵から決まる 8 桁の 16 進（`keyId`）。
 *   AES-GCM の追加データに「表・列・利用者」を入れ、別の人や別の列の行へ写しても開けないようにする
 * - 前の形 `enc:v1:<iv>:<暗号文>`（鍵の名前なし）は、今の鍵・前の鍵の順に試して開く
 * - 今の鍵の `enc:v2:` でない値（前の鍵・前の形）は、読んだついでに今の鍵で閉じ直す（`needsReseal`）。
 *   読まれない行は `daily-reminders` が少しずつ閉じ直す（`tokenSweep.ts`）
 * - 暗号化されていない値は開かない（`PlaintextSecretError`）。閉じ直す処理（`resealStored`）だけが平文を受け取る
 * - 鍵が無いときは保存を拒む（`SecretKeyMissingError`。呼び出し元は 500 を返す）。平文では置かない
 */

const V1 = 'enc:v1:'
const V2 = 'enc:v2:'

/** 開くときに使う鍵の組。`current` で閉じ、`current` と `previous` で開く */
export type KeyRing = { current: string | undefined; previous: readonly string[] }

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
const idCache = new Map<string, Promise<string>>()

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

/**
 * 鍵の名前（8 桁の 16 進）。暗号の鍵（SHA-256(鍵)）とは別の前置きでハッシュするので、名前から鍵は分からない。
 * どの鍵で閉じたかを暗号文に残し、鍵を替えたあとも前の鍵で開けるようにする
 */
export function keyId(material: string): Promise<string> {
  let id = idCache.get(material)
  if (!id) {
    id = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(`chronograma-token-key-id:${material}`))
      .then((h) => [...new Uint8Array(h).slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join(''))
    idCache.set(material, id)
  }
  return id
}

/** 鍵 1 つだけの組（テスト・前の呼び方） */
function asRing(keys: KeyRing | string | undefined): KeyRing {
  return typeof keys === 'object' ? keys : { current: keys || undefined, previous: [] }
}

/** 暗号化した値か（版は問わない） */
export function isSealed(stored: string): boolean {
  return stored.startsWith(V1) || stored.startsWith(V2)
}

/** 暗号化されていない値を開こうとした（閉じ直す処理のほかでは受け取らない） */
export class PlaintextSecretError extends Error {
  constructor() {
    super('The stored token is not encrypted')
    this.name = 'PlaintextSecretError'
  }
}

/** `context` は「表.列:利用者 id」。開くときも同じものを渡す。今の鍵の名前を付けて閉じる */
export async function sealWith(keys: KeyRing | string, plain: string, context: string): Promise<string> {
  const material = assertSecretKey(asRing(keys).current)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) },
    await aesKey(material),
    new TextEncoder().encode(plain),
  )
  return `${V2}${await keyId(material)}:${toBase64(iv)}:${toBase64(new Uint8Array(data))}`
}

async function decrypt(material: string, iv: string, data: string, context: string): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv), additionalData: new TextEncoder().encode(context) },
    await aesKey(material),
    fromBase64(data),
  )
  return new TextDecoder().decode(plain)
}

/**
 * 読んだ値を開く。`enc:v2:` は名前の合う鍵で、`enc:v1:` は今の鍵・前の鍵の順に試す（違う鍵では AES-GCM の検査で失敗する）。
 * 暗号化されていない値は `PlaintextSecretError`（`allowPlaintext` のときだけそのまま返す）
 */
export async function openWith(
  keys: KeyRing | string | undefined,
  stored: string,
  context: string,
  { allowPlaintext = false }: { allowPlaintext?: boolean } = {},
): Promise<string> {
  if (!isSealed(stored)) {
    if (allowPlaintext) return stored
    throw new PlaintextSecretError()
  }
  const ring = asRing(keys)
  const materials = [ring.current, ...ring.previous].filter((m): m is string => Boolean(m))
  if (materials.length === 0) throw new Error('TOKEN_ENCRYPTION_KEY is not set but the stored token is encrypted')
  if (stored.startsWith(V2)) {
    const [kid, iv, data] = stored.slice(V2.length).split(':')
    for (const material of materials) {
      if ((await keyId(material)) === kid) return decrypt(material, iv, data, context)
    }
    throw new Error(`No key for the stored token (key id ${kid})`)
  }
  const [iv, data] = stored.slice(V1.length).split(':')
  let lastError: unknown
  for (const material of materials) {
    try {
      return await decrypt(material, iv, data, context)
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

/** 今の鍵で閉じた `enc:v2:` でなければ true（前の鍵・前の形・平文）。今の鍵が無ければ閉じ直せないので false */
export async function needsResealWith(keys: KeyRing | string | undefined, stored: string): Promise<boolean> {
  const current = asRing(keys).current
  if (!current) return false
  return !stored.startsWith(`${V2}${await keyId(current)}:`)
}

/** `TOKEN_ENCRYPTION_KEY` が無いのにトークンを保存しようとした */
export class SecretKeyMissingError extends Error {
  constructor() {
    super('TOKEN_ENCRYPTION_KEY is not set; refusing to store the token unencrypted')
    this.name = 'SecretKeyMissingError'
  }
}

/** `TOKEN_ENCRYPTION_PREVIOUS_KEYS` を鍵の並びにする（カンマ・空白・改行で区切る） */
export function parsePreviousKeys(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((k) => k.trim())
    .filter(Boolean)
}

/** 環境変数の鍵の組 */
export function keyRing(): KeyRing {
  return {
    current: Deno.env.get('TOKEN_ENCRYPTION_KEY') || undefined,
    previous: parsePreviousKeys(Deno.env.get('TOKEN_ENCRYPTION_PREVIOUS_KEYS')),
  }
}

/** 鍵が無ければ `SecretKeyMissingError` */
export function assertSecretKey(material: string | undefined): string {
  if (!material) throw new SecretKeyMissingError()
  return material
}

/** 鍵が無ければ投げる。`sealSecret` の前に呼ぶと、外部サービスに触る前に止められる */
export function requireSecretKey(): string {
  return assertSecretKey(keyRing().current)
}

/** 保存する前に暗号化する。鍵が無ければ `SecretKeyMissingError` */
export function sealSecret(plain: string, context: string): Promise<string> {
  return sealWith(keyRing(), plain, context)
}

/** 読んだ値を開く。暗号化されていない値は `PlaintextSecretError` */
export function openSecret(stored: string, context: string): Promise<string> {
  return openWith(keyRing(), stored, context)
}

/** 前の鍵・前の形の値で、いまは今の鍵があるか（読んだついでに今の鍵で閉じ直す） */
export function needsReseal(stored: string): Promise<boolean> {
  return needsResealWith(keyRing(), stored)
}

/**
 * 閉じ直す処理（`tokenSweep.ts`）用。平文・前の鍵・前の形の値を開き、今の鍵で閉じ直す。
 * 平文を受け取るのはここだけ（一度すべての行を閉じ直したあと、ほかの読み込みは平文を断る）
 */
export async function resealWith(keys: KeyRing, stored: string, context: string): Promise<string> {
  const plain = await openWith(keys, stored, context, { allowPlaintext: true })
  return sealWith(keys, plain, context)
}
