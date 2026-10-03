import { format, parseISO, type Locale } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'

/** 日付キー（`yyyy-MM-dd`）。その日の予定・記録・習慣を引く鍵 */
export function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** 日付キー → その日の正午の Date（夏時間・タイムゾーン差で前後の日にずれないよう正午にする） */
export function fromDateKey(key: string): Date {
  return parseISO(`${key}T12:00:00`)
}

/** 画面の言語に合わせた date-fns の locale */
export function dateFnsLocale(language: string | undefined): Locale {
  return language?.startsWith('ja') ? ja : enUS
}
