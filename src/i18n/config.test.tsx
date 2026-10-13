import { afterEach, describe, expect, it } from 'vitest'
import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { i18nOptions, lazyLocales } from './config'
import { dateFnsLocale } from '../lib/dateKey'

/**
 * 言語の文言は表示する言語の分だけ読む（#268）。アプリと同じ設定で新しい入れ物を作って確かめる
 * （アプリの入れ物はテストの準備（setup.ts）が両方の言語を読んでいる）
 */
async function freshI18n(lang: string) {
  localStorage.setItem('chronograma-lang', lang)
  const i18n = i18next.createInstance().use(lazyLocales).use(LanguageDetector)
  const i18nReady = i18n.init(i18nOptions)
  return { default: i18n, i18nReady, dateFnsLocale }
}

afterEach(() => {
  localStorage.removeItem('chronograma-lang')
})

describe('i18n: 表示する言語の分だけ読む', () => {
  it('日本語なら日本語（と date-fns の日本語）だけ読み、英語は読まない。言語は読む前から決まっている', async () => {
    const { default: i18n, i18nReady, dateFnsLocale } = await freshI18n('ja')
    // ストアの初期値（「いつか」「買い物」）が読む前の言語を使う
    expect(i18n.language).toBe('ja')
    await i18nReady
    expect(i18n.hasResourceBundle('ja', 'translation')).toBe(true)
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(false)
    expect(i18n.t('lists.defaultSomeday')).toBe('いつか')
    expect(dateFnsLocale('ja').code).toBe('ja')

    // 切り替えたときにもう一方を読む
    await i18n.changeLanguage('en')
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true)
    expect(i18n.t('lists.defaultSomeday')).toBe('Someday')
  })

  it('英語なら英語だけ読む', async () => {
    const { default: i18n, i18nReady, dateFnsLocale } = await freshI18n('en')
    await i18nReady
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true)
    expect(i18n.hasResourceBundle('ja', 'translation')).toBe(false)
    expect(dateFnsLocale('en').code).toBe('en-US')
  })

  it('ほかの言語のブラウザは英語', async () => {
    const { default: i18n, i18nReady } = await freshI18n('fr')
    await i18nReady
    expect(i18n.resolvedLanguage).toBe('en')
    expect(i18n.hasResourceBundle('ja', 'translation')).toBe(false)
  })
})
