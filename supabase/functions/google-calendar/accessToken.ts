import { GoogleApiError } from './googleError.ts'

/**
 * Google のアクセストークン（1 時間ほど使える）の使い回し（#421）。関数はほぼ毎回新しいインスタンスで動くので、
 * メモリではなく `google_oauth` の行に（リフレッシュトークンと同じく暗号にして）置く。
 * 残りが少ない・無い・開けないときだけリフレッシュトークンから作り直し、作ったものを保存する
 */

/** 残りがこれより少なければ作り直す（使っている途中で切れないように） */
export const TOKEN_MARGIN_MS = 2 * 60_000

export type AccessTokenDeps = {
  /** 保存してあるトークン（暗号）と期限。無ければ null */
  cached: { sealed: string | null; expiresAt: string | null }
  open: (sealed: string) => Promise<string>
  /** リフレッシュトークンから作り直す。`expiresIn` は秒 */
  refresh: () => Promise<{ accessToken: string; expiresIn: number }>
  /** 作り直したトークンを保存する（待たない。失敗しても次に作り直すだけ） */
  save: (accessToken: string, expiresAt: Date) => void
  now?: () => number
}

/** 保存してあったトークンを Google が受け付けなかった（期限前に取り消された・作り直された） */
function isRejectedToken(e: unknown): boolean {
  return e instanceof GoogleApiError && e.source === 'calendar' && e.status === 401
}

/**
 * アクセストークンを用意して `call` を呼ぶ。保存してあったトークンが断られたら、作り直して 1 回だけやり直す
 * （作り直しも断られるなら、リフレッシュトークンが取り消されている＝ `refresh` のエラーをそのまま投げる）
 */
export async function withAccessToken<T>(deps: AccessTokenDeps, call: (accessToken: string) => Promise<T>): Promise<T> {
  const now = deps.now ?? Date.now
  const fresh = async () => {
    const { accessToken, expiresIn } = await deps.refresh()
    deps.save(accessToken, new Date(now() + expiresIn * 1000))
    return accessToken
  }

  const { sealed, expiresAt } = deps.cached
  let cached: string | null = null
  if (sealed && expiresAt && Date.parse(expiresAt) - now() > TOKEN_MARGIN_MS) {
    try {
      cached = await deps.open(sealed)
    } catch {
      // 鍵を替えた・壊れた値は、作り直すだけ
    }
  }
  if (!cached) return call(await fresh())

  try {
    return await call(cached)
  } catch (e) {
    if (!isRejectedToken(e)) throw e
    return call(await fresh())
  }
}
