import { format, parseISO, type Locale } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'

/** 日付キー（`yyyy-MM-dd`）。その日の予定・記録・習慣を引く鍵 */
export function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** 日付キー → その日の正午の Date（夏時間・タイムゾーン差で前後の日にずれないよう正午にする） */
export function fromDateKey(key: string): Date {
  return parseISO(`${key}T12:00:00`)
}

/** date-fns の日本語。日本語で表示するときだけ、文言と一緒に後から読む（`i18n/config.ts`、#268） */
let jaLocale: Locale | null = null
export function setDateFnsJa(locale: Locale): void {
  jaLocale = locale
}

/** 画面の言語に合わせた date-fns の locale（日本語は読み終えてから。画面は読み終えてから描く） */
export function dateFnsLocale(language: string | undefined): Locale {
  return language?.startsWith('ja') ? (jaLocale ?? enUS) : enUS
}
