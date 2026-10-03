import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import { parseQuickAddTitle } from './parseQuickAdd'
import { findListByName } from './listKind'
import { displayListName } from './displayListName'
import { appTodayKey } from './timeZone'

export interface QuickAddOptions {
  /** リストを書かなかったときに入れるリスト。省略すると選んでいるリスト（無ければ未分類） */
  defaultListId?: string
  /** いま見ているリスト。`@リスト` がこれと違えば「○○に追加しました」と知らせる */
  currentListId?: string | null
  /**
   * 日付を書かなかったときの「やる日」（今日の計画で見ている日）。
   * 省略すると日付なし（時刻だけ書いたときは今日）
   */
  defaultDate?: string
  /** 色（ラベル）を開いて追加したとき、その色を付ける（そのラベルの一覧に残るように） */
  color?: string
}

/**
 * クイック追加の 1 行（「15時 ES 1時間」「明日まで 課題」「@買い物 牛乳」）からタスクを作る。
 * どの入力欄でも同じ書き方なら同じ結果になるよう、解釈はここ 1 か所で行う。
 * - 日付だけ → やる日（scheduledDate）
 * - 「まで」「by」つき → 締切（dueDate）
 * - 時刻つき → その日のタイムラインの予定
 * - いつか・チェックリストのリストには日付を付けない
 */
export function addTaskFromQuickText(raw: string, opts: QuickAddOptions = {}): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const state = useTaskStore.getState()
  const parsed = parseQuickAddTitle(trimmed, Boolean(i18n.resolvedLanguage?.startsWith('ja')), undefined, {
    tags: state.tagsEnabled,
  })
  const target = parsed.listName
    ? findListByName(state.lists, parsed.listName, (l) => displayListName(l.id, l.name))
    : null
  const listId = target?.id ?? opts.defaultListId
  const id = state.addTask(parsed.title, listId)
  if (!id) return undefined

  if (target && target.id !== opts.currentListId) {
    state.showMoveBanner(i18n.t('toast.addedToList', { name: displayListName(target.id, target.name) }))
  }

  // 入ったリスト（省略時は addTask が選ぶ）の種類で日付を付けるか決める
  const after = useTaskStore.getState()
  const addedListId = after.tasks.find((t) => t.id === id)?.listId
  const kind = after.lists.find((l) => l.id === addedListId)?.kind ?? 'tasks'
  const patch: Partial<Pick<Task, 'dueDate' | 'scheduledDate' | 'startTime' | 'endTime' | 'tags' | 'color'>> = {}
  if (parsed.tags.length) patch.tags = parsed.tags
  if (opts.color) patch.color = opts.color
  // いつか・チェックリストには日付を付けない（付けると期限のビューに戻ってきてしまう）
  if (kind === 'tasks') {
    if (parsed.startTime) {
      patch.scheduledDate = (parsed.dateIsDeadline ? null : parsed.date) ?? opts.defaultDate ?? appTodayKey()
      patch.startTime = parsed.startTime
      patch.endTime = parsed.endTime
      if (parsed.dateIsDeadline) patch.dueDate = parsed.date
    } else if (parsed.dateIsDeadline) {
      patch.dueDate = parsed.date
      if (opts.defaultDate) patch.scheduledDate = opts.defaultDate
    } else {
      const day = parsed.date ?? opts.defaultDate
      if (day) patch.scheduledDate = day
    }
  }
  if (Object.keys(patch).length > 0) state.updateTask(id, patch)
  return id
}
