/**
 * 表示言語（i18n）に依存するストアの初期値と、文言を渡して純粋な関数（`taskHelpers.ts`）を呼ぶ薄い包み
 */
import type { TaskList } from '../types/list'
import i18n from '../i18n/config'
import { newId } from '../lib/id'
import { CATEGORY_COLOR_KEYS } from '../lib/logCategoryColors'
import { INBOX_COLOR, INBOX_ID } from './storeConstants'
import { inferCategoryTags, type CategoryInferenceState } from './taskHelpers'

export const defaultInbox: TaskList = {
  id: INBOX_ID,
  name: '未分類',
  // 予定はリストの色で塗るので、いちばん多い未分類は落ち着いたラベンダーに
  color: INBOX_COLOR,
  order: 0,
}

export function defaultLogCategories(): string[] {
  return i18n.t('logCategories.defaults', { returnObjects: true }) as string[]
}

/** 色の名前（表示言語）。分類名が色の名前だけのときは推定に使わない */
export function logColorNames(): Set<string> {
  return new Set(CATEGORY_COLOR_KEYS.map((k) => i18n.t(`googleColors.${k}`)))
}

/** 分類が空なら推定で補う（`inferCategoryTags`） */
export function withInferredCategory(
  tags: string[],
  state: CategoryInferenceState,
  title: string,
  opts: { taskId?: string | null; colorHex?: string | null } = {},
): string[] {
  if (tags.length > 0) return tags
  return inferCategoryTags(tags, state, title, logColorNames(), opts)
}

/**
 * 新規ユーザーの初期リスト。「未分類」だけだと Wish も買い物も全部そこに入って混ざるので、
 * 最初から「いつか」「買い物」を分けておく（既存ユーザーは永続化データが優先されるので作られない）
 */
export function initialLists(): TaskList[] {
  return [
    defaultInbox,
    { id: newId(), name: i18n.t('lists.defaultSomeday'), color: '#F6BF26', order: 1, kind: 'someday' },
    { id: newId(), name: i18n.t('lists.defaultShopping'), color: '#33B679', order: 2, kind: 'checklist' },
  ]
}
