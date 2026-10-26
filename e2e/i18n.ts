import { test as base } from '@playwright/test'
import en from '../src/locales/en'
import ja from '../src/locales/ja'

type Dict = { [key: string]: unknown }

/**
 * 画面の文言を、その回の言語（`playwright.config.ts` の `locale`）の鍵から引く。
 * 英語の回と日本語の回で同じテストを流せるように、文字を直に書かず `t('quickAdd.placeholder')` のように書く
 */
function translator(locale: string | undefined) {
  const dict = (locale?.startsWith('ja') ? ja : en) as unknown as Dict
  return (key: string, params: Record<string, string | number> = {}): string => {
    const value = key.split('.').reduce<unknown>((node, k) => (node as Dict | undefined)?.[k], dict)
    if (typeof value !== 'string') throw new Error(`no string for ${key}`)
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? `{{${name}}}`))
  }
}

export const test = base.extend<{ t: ReturnType<typeof translator>; ja: boolean }>({
  // Playwright の fixture の `use`（React の `use` と同じ名前なので別名にする）
  t: async ({ locale }, provide) => provide(translator(locale)),
  ja: async ({ locale }, provide) => provide(Boolean(locale?.startsWith('ja'))),
})

export { expect } from '@playwright/test'
