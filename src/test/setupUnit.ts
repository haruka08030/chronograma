import { afterAll, beforeAll, vi } from 'vitest'

// 文言は後から読む（i18n/config.ts）。i18n を使う unit テストのために、両方の言語を先に読んでおく。
// テストのファイルが i18n/config を読み込んだ（読み込むと i18next の init が済む）ときだけ。
// 読み込んでいない・モックしたテストでは訳文を読まない
beforeAll(async () => {
  const { default: i18next } = await import('i18next')
  if (!i18next.isInitialized) return
  const mod = await import('../i18n/config')
  const i18n = mod.default
  if (typeof i18n?.loadLanguages !== 'function') return
  await mod.i18nReady
  await i18n.loadLanguages(['ja', 'en'])
})

// プロセスはファイルをまたいで使い回す（vmForks）。ファイルで替えた環境変数（TZ など）を次のファイルへ持ち越さない
afterAll(() => {
  vi.unstubAllEnvs()
})
