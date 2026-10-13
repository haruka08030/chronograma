import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { japaneseHolidayName } from '../lib/japaneseHolidays'

/**
 * その日の祝日の名前を引く関数（祝日でない日・出さないときは null）。
 * 日本の祝日は画面の言語が日本語のときだけ出す（英語の画面では祝日名が読めず、ほかの国の人には要らない）
 */
export function useHolidayName(): (dateKey: string) => string | null {
  const { i18n } = useTranslation()
  const show = i18n.resolvedLanguage?.startsWith('ja') ?? false
  return useCallback((dateKey: string) => (show ? japaneseHolidayName(dateKey) : null), [show])
}
