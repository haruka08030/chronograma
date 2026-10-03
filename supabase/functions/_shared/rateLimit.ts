/**
 * Edge Function の呼び出し回数の上限（利用者ごと・機能ごと）。数えるのは DB の `hit_rate_limit`（migrations/009）。
 * ふつうの使い方（数分おきの同期・画面の切り替え）では届かない数にしてある。
 */

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export type RateLimit = { bucket: string; limit: number; windowSeconds: number }

/** 10 分あたり。Google はカレンダーを行き来するたびに予定を読むので多め */
export const RATE_LIMITS = {
  google: { bucket: 'google-calendar', limit: 600, windowSeconds: 600 },
  notion: { bucket: 'notion', limit: 300, windowSeconds: 600 },
  canvas: { bucket: 'canvas', limit: 300, windowSeconds: 600 },
  /** 学校のサイトを新しく確かめに行く（connect）。1 時間あたり */
  canvasConnect: { bucket: 'canvas-connect', limit: 20, windowSeconds: 3600 },
  /** アカウントの削除。1 時間あたり */
  account: { bucket: 'account', limit: 10, windowSeconds: 3600 },
} satisfies Record<string, RateLimit>

/**
 * 1 回数え、上限以内なら true。数えられなかった（009 を流す前など）ときは止めずに通し、ログに残す
 */
export async function withinRateLimit(admin: RpcClient, userId: string, rule: RateLimit): Promise<boolean> {
  const { data, error } = await admin.rpc('hit_rate_limit', {
    p_user: userId,
    p_bucket: rule.bucket,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  })
  if (error) {
    console.error('[rate-limit]', rule.bucket, error.message)
    return true
  }
  return data !== false
}
