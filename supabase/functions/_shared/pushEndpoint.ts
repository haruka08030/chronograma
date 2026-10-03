/**
 * ブラウザのプッシュサービスの URL か。Chrome 系（FCM）・Firefox（Mozilla）・Safari（Apple）・旧 Edge（Windows）。
 * DB の制約 `push_subscriptions_endpoint_host_check`（migrations/007）と同じ形にそろえる。
 */
export const PUSH_ENDPOINT_PATTERN =
  /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)\//

export function isKnownPushEndpoint(endpoint: string): boolean {
  return PUSH_ENDPOINT_PATTERN.test(endpoint)
}
