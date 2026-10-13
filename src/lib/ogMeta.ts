/**
 * リンクのプレビュー（OGP）の URL を絶対 URL にする（vite.config.ts の ogAbsoluteUrls がビルドで使う）。
 * SNS やチャットの読み取りは `og:image` などの相対パスを解決しないことがあるので、公開の URL を前に付ける。
 */

/** 公開の URL（末尾の / なし）。`SITE_URL`、無ければ Vercel の本番ドメイン（独自ドメインを足せばそれになる）。どちらも無ければ null */
export function siteOrigin(env: Record<string, string | undefined>): string | null {
  const raw =
    env.SITE_URL?.trim() || (env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL.trim()}` : '')
  return raw ? raw.replace(/\/+$/, '') : null
}

/** `og:url`・`og:image`・`twitter:image` の `content="/..."` に公開の URL を付ける。URL が無ければそのまま */
export function absolutizeOgUrls(html: string, origin: string | null): string {
  if (!origin) return html
  return html.replace(/(<meta (?:property="og:(?:url|image)"|name="twitter:image") content=")\//g, `$1${origin}/`)
}
