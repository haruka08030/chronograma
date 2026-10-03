import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import ja from '../locales/ja'
import en from '../locales/en'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
    },
    // ja-JP などは ja に寄せ、それ以外の言語のブラウザは英語で出す
    fallbackLng: 'en',
    supportedLngs: ['ja', 'en'],
    react: { useSuspense: false },
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'chronograma-lang',
    },
  })

// 読み上げ・自動翻訳・フォント選びが表示中の言語に合うよう、<html lang> を揃える
function syncDocumentLang(lng: string | undefined) {
  if (typeof document === 'undefined' || !lng) return
  document.documentElement.lang = lng
}
syncDocumentLang(i18n.resolvedLanguage)
i18n.on('languageChanged', () => syncDocumentLang(i18n.resolvedLanguage))

export default i18n
