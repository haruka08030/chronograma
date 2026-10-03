import type { TFunction } from 'i18next'
import type { ToastText } from '../store/storeTypes'

/** トーストの文を、いまの言語の文字列にする（ストアは鍵と値、画面は訳した文字列を渡す） */
export function toastText(t: TFunction, text: ToastText): string {
  return typeof text === 'string' ? text : t(text.key, text.params)
}
