declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined

/** 応答を返したあとも続ける（Supabase の EdgeRuntime.waitUntil）。無い環境ではそのまま流す */
export function runInBackground(p: Promise<unknown>): void {
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(p)
}
