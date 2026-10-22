/**
 * 最初から作る名前（「やりたいこと」「買い物」のリストと初期のラベル）。翻訳の文言（`ja.ts` / `en.ts`）もここから取る。
 * 文言は表示する言語の分だけ後から読む（#268）ので、読む前に作るストアの初期値と、どの言語で作られたかを見分ける同期はこちらを使う
 */
export const BUILTIN_NAMES = {
  ja: {
    someday: 'やりたいこと',
    shopping: '買い物',
    logCategories: ['勉強', '課題', '就活', 'バイト', '運動', '生活', '休憩'],
  },
  en: {
    someday: 'Bucket list',
    shopping: 'Shopping',
    logCategories: ['Study', 'Assignments', 'Job hunting', 'Work', 'Exercise', 'Chores', 'Break'],
  },
} as const

/** 前の版で最初に作っていたリストの名前（同期で初期リストを見分けるのに使う） */
export const LEGACY_BUILTIN_LIST_NAMES = ['いつか', 'Someday'] as const

export type AppLanguage = keyof typeof BUILTIN_NAMES

/** 言語のコード（`ja-JP` など）をアプリの言語に。どちらでもなければ null */
export function toAppLanguage(code: string | null | undefined): AppLanguage | null {
  const c = code?.toLowerCase()
  if (!c) return null
  if (c === 'ja' || c.startsWith('ja-')) return 'ja'
  if (c === 'en' || c.startsWith('en-')) return 'en'
  return null
}
