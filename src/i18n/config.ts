import i18n, { type BackendModule, type InitOptions, type ResourceKey } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { toAppLanguage, type AppLanguage } from '../locales/builtinNames'
import { setDateFnsJa } from '../lib/dateKey'

/**
 * 言語の文言は、表示する言語の分だけ後から読む（#268。2 つで約 97 kB）。切り替えたときにもう一方を読む。
 * date-fns の日本語（曜日・月の名前）も日本語のときだけ一緒に読む。
 * 画面は読み終わってから描く（`i18nReady`、main.tsx）
 */
function loadLocale(language: AppLanguage): Promise<ResourceKey> {
  if (language === 'ja') {
    return Promise.all([import('../locales/ja'), import('date-fns/locale/ja').then(({ ja }) => setDateFnsJa(ja))]).then(([m]) => m.default)
  }
  return import('../locales/en').then((m) => m.default)
}

export const lazyLocales: BackendModule = {
  type: 'backend',
  init() {},
  read(language, _namespace, callback) {
    loadLocale(toAppLanguage(language) ?? 'en').then(
      (resources) => callback(null, resources),
      (err: unknown) => callback(err instanceof Error ? err : new Error(String(err)), false),
    )
  },
}

export const i18nOptions: InitOptions = {
  // ja-JP などは ja に寄せ、それ以外の言語のブラウザは英語で出す。日本語のときに英語を読まないよう、ja の代わりは ja だけ
  fallbackLng: (code) => (toAppLanguage(code) === 'ja' ? ['ja'] : ['en']),
  supportedLngs: ['ja', 'en'],
  // 言語を決めるのはすぐ（ストアの初期値が `i18n.language` を読む、storeDefaults.ts）。文言の読み込みは後から
  initAsync: false,
  react: { useSuspense: false },
  interpolation: { escapeValue: false },
  detection: {
    order: ['localStorage', 'navigator'],
    caches: ['localStorage'],
    lookupLocalStorage: 'chronograma-lang',
  },
}

/** 文言を読み終えた（読めなかったときも進む。そのときは鍵のまま出る） */
export const i18nReady: Promise<unknown> = i18n
  .use(lazyLocales)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init(i18nOptions)
  .catch((err: unknown) => {
    console.error('[i18n] could not load strings', err)
  })

// 読み上げ・自動翻訳・フォント選びが表示中の言語に合うよう、<html lang> を揃える
function syncDocumentLang(lng: string | undefined) {
  if (typeof document === 'undefined' || !lng) return
  document.documentElement.lang = lng
}
syncDocumentLang(i18n.resolvedLanguage)
i18n.on('languageChanged', () => syncDocumentLang(i18n.resolvedLanguage))

export default i18n
