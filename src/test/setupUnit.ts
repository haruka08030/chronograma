import { beforeAll } from 'vitest'

// 文言は後から読む（i18n/config.ts）。i18n を使う unit テストのために、両方の言語を先に読んでおく。
// i18n を読み込んでいない（モックした）テストでは何もしない
beforeAll(async () => {
  const mod = await import('../i18n/config')
  const i18n = mod.default
  if (typeof i18n?.loadLanguages !== 'function') return
  await mod.i18nReady
  await i18n.loadLanguages(['ja', 'en'])
})
