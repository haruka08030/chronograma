import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import { parseQuickAddTitle, type ParsedQuickAdd } from './parseQuickAdd'
import { findListByName } from './listKind'
import { displayListName } from './displayListName'
import { appTodayKey } from './timeZone'
import { formatDate } from './dateFormat'

export interface QuickAddOptions {
  /** リストを書かなかったときに入れるリスト。省略すると選んでいるリスト（無ければ未分類） */
  defaultListId?: string
  /** いま見ているリスト。`@リスト` がこれと違えば「○○に追加しました」と知らせる */
  currentListId?: string | null
  /**
   * 日付を書かなかったときの「やる日」（今日の計画・カレンダーのセル・予定作成カードの日）。
   * 省略すると日付なし（時刻だけ書いたときは今日）
   */
  defaultDate?: string
  /**
   * 時刻を書かなかったときの時間帯（予定作成カードでドラッグした枠）。
   * 「15時」のように書けば書いた時刻が勝つ
   */
  defaultTime?: { startTime: string; endTime: string }
  /**
   * サブタスクとして足す親。リストは親と同じに固定し、`@…` はリスト指定として読まず題名に残す。
   * 日付・時刻・締切は読む
   */
  parentId?: string
  /** 色（ラベル）を開いて追加したとき、その色を付ける（そのラベルの一覧に残るように） */
  color?: string
}

type SchedulePatch = Partial<Pick<Task, 'dueDate' | 'scheduledDate' | 'startTime' | 'endTime'>>

/**
 * 読み取った日時から、やる日・締切・予定の時間帯を決める（純粋な計算。テスト用に分けている）。
 * - 日付だけ → やる日。「まで」「by」つき → 締切（やる日は `defaultDate`）
 * - 時刻つき（書いた時刻、無ければ `defaultTime`）→ その日のタイムラインの予定
 */
export function quickAddSchedule(
  parsed: Pick<ParsedQuickAdd, 'date' | 'dateIsDeadline' | 'startTime' | 'endTime'>,
  opts: Pick<QuickAddOptions, 'defaultDate' | 'defaultTime'>,
  todayKey: string,
): SchedulePatch {
  const patch: SchedulePatch = {}
  const typedTime = parsed.startTime != null
  const startTime = typedTime ? parsed.startTime : opts.defaultTime?.startTime
  const endTime = typedTime ? parsed.endTime : opts.defaultTime?.endTime
  const doDate = parsed.dateIsDeadline ? null : parsed.date
  if (startTime) {
    patch.scheduledDate = doDate ?? opts.defaultDate ?? todayKey
    patch.startTime = startTime
    patch.endTime = endTime ?? null
  } else {
    const day = doDate ?? opts.defaultDate
    if (day) patch.scheduledDate = day
  }
  if (parsed.dateIsDeadline) patch.dueDate = parsed.date
  return patch
}

/**
 * クイック追加の 1 行（「15時 ES 1時間」「明日まで 課題」「@買い物 牛乳」）からタスクを作る。
 * どの入力欄（上部の追加欄・今日の計画・カレンダーのセル・予定作成カード・サブタスク）でも
 * 同じ書き方なら同じ結果になるよう、解釈はここ 1 か所で行う。
 * 欄ごとの違いは「書かなかったときの既定値」（`defaultDate` / `defaultTime` / `defaultListId` / `parentId`）だけ。
 * - いつか・チェックリストのリストには日付を付けない
 */
export function addTaskFromQuickText(raw: string, opts: QuickAddOptions = {}): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const state = useTaskStore.getState()
  const isSubtask = opts.parentId != null
  const parsed = parseQuickAddTitle(trimmed, Boolean(i18n.resolvedLanguage?.startsWith('ja')), undefined, {
    tags: state.tagsEnabled,
    lists: !isSubtask,
  })
  const target = parsed.listName
    ? findListByName(state.lists, parsed.listName, (l) => displayListName(l.id, l.name))
    : null
  const listId = target?.id ?? opts.defaultListId
  let id: string | undefined
  // 作成と日付付けは 1 回の取り消しで戻す（呼び出し側の asOneUndo の中でもよい）
  state.asOneUndo(() => {
    // サブタスクのリストは addTask が親のリストにそろえる
    id = state.addTask(parsed.title, listId, opts.parentId)
    if (!id) return
    // 入ったリスト（省略時は addTask が選ぶ）の種類で日付を付けるか決める
    const after = useTaskStore.getState()
    const addedListId = after.tasks.find((t) => t.id === id)?.listId
    const kind = after.lists.find((l) => l.id === addedListId)?.kind ?? 'tasks'
    const patch: Partial<Pick<Task, 'dueDate' | 'scheduledDate' | 'startTime' | 'endTime' | 'tags' | 'color'>> = {}
    if (parsed.tags.length) patch.tags = parsed.tags
    if (opts.color) patch.color = opts.color
    // いつか・チェックリストには日付を付けない（付けると期限のビューに戻ってきてしまう）
    if (kind === 'tasks') Object.assign(patch, quickAddSchedule(parsed, opts, appTodayKey()))
    if (Object.keys(patch).length > 0) state.updateTask(id, patch)
  })
  if (!id) return undefined

  if (target && target.id !== opts.currentListId) {
    state.showMoveBanner(i18n.t('toast.addedToList', { name: displayListName(target.id, target.name) }))
  } else {
    // 見ている日と違う日に入ったら、その欄から消えて「入らなかった」と見えないよう知らせる
    const scheduledDate = useTaskStore.getState().tasks.find((t) => t.id === id)?.scheduledDate
    if (opts.defaultDate && scheduledDate && scheduledDate !== opts.defaultDate) {
      state.showMoveBanner(i18n.t('toast.addedToDay', { date: formatDate(scheduledDate, 'monthDayWeekday') }))
    }
  }

  return id
}
