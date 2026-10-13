/**
 * 最初から作る名前（「いつか」「買い物」のリストと初期のラベル）。翻訳の文言（`ja.ts` / `en.ts`）もここから取る。
 * 文言は表示する言語の分だけ後から読む（#268）ので、読む前に作るストアの初期値と、どの言語で作られたかを見分ける同期はこちらを使う
 */
export const BUILTIN_NAMES = {
  ja: {
    someday: 'いつか',
    shopping: '買い物',
    logCategories: ['勉強', '課題', '就活', 'バイト', '運動', '生活', '休憩'],
  },
  en: {
    someday: 'Someday',
    shopping: 'Shopping',
    logCategories: ['Study', 'Assignments', 'Job hunting', 'Work', 'Exercise', 'Chores', 'Break'],
  },
} as const

export type AppLanguage = keyof typeof BUILTIN_NAMES

/** 言語のコード（`ja-JP` など）をアプリの言語に。どちらでもなければ null */
export function toAppLanguage(code: string | null | undefined): AppLanguage | null {
  const c = code?.toLowerCase()
  if (!c) return null
  if (c === 'ja' || c.startsWith('ja-')) return 'ja'
  if (c === 'en' || c.startsWith('en-')) return 'en'
  return null
}
