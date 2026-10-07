import type { TaskReminder } from '../../supabase/functions/daily-reminders/schedule.ts'

export type Priority = 'none' | 'low' | 'medium' | 'high'

export interface Recurrence {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  /**
   * 毎週の曜日（1=月 … 7=日。習慣の `HabitWeekday` と同じ）。`weekly` のときだけ。
   * 未設定は締切の曜日で回る。次の回は選んだ曜日のうち次に来る日（`taskRecurrence.ts`）
   */
  weekdays?: number[]
  /**
   * 毎月・毎年の元の日（1〜31）。31 日・2/29 のように無い月は月末に寄せ、ある月では元の日に戻す。
   * 未設定は締切の日。完了で次の回を作るときに覚える（`taskRecurrence.ts`）
   */
  monthDay?: number
}

/**
 * タスクの種類。
 * - `todo`: To-Do（やること）
 * - `event`: 予定（バイト・授業など、時刻のある予定）。完了の丸が無く、時間が過ぎたらグレー（Google の予定と同じ）。
 *   To-Do の一覧・今日の計画（To-Do・やり残し・予定の時間）・完了数・予定と記録の突き合わせには入れない。
 *   カレンダー・ふさがっている時間・通知（予定の前）は To-Do の予定と同じ
 * - `log`: 記録（実際にやった時間）
 * - `sleep`: 睡眠の記録（朝に「何時に寝て何時に起きたか」で入れる）。記録の時間・分類の集計に入れない
 *
 * サーバー・前の版のバックアップでは `is_time_log` / `isTimeLog`（記録か）・`is_sleep` / `isSleep`（睡眠か）・
 * `is_event` / `isEvent`（予定か）の印で持つ。予定の印を読まない前の版では To-Do に見える
 */
export type TaskKind = 'todo' | 'event' | 'log' | 'sleep'

/** どの種類にもある項目 */
interface TaskBase {
  id: string
  title: string
  description: string
  completed: boolean
  /** 完了した瞬間の ISO 時刻。未完了は null。`updatedAt`（最終更新）とは別。レガシーで completed のみの行は null のことがある */
  completedAt: string | null
  createdAt: string
  updatedAt: string
  order: number
  listId: string
  /** リスト内セクション。null はセクションなし */
  sectionId: string | null
  parentId: string | null
  /** To-Do は期限日、記録・睡眠は開始日（`yyyy-MM-dd`）。種類ごとの説明は `TodoTask` / `LogTask` */
  dueDate: string | null
  /** 締め切り時刻（`HH:mm`）。`dueDate` がある通常タスクの任意の締め切り時間。`null` は時刻指定なし */
  dueTime: string | null
  /** 予定日（`yyyy-MM-dd`）。カレンダー/タイムラインで「いつやるか」を置く日。`null` は未スケジュール。タイムログでは使わない（ログは `dueDate` が開始日） */
  scheduledDate: string | null
  /** 終了日（`null` は開始日と同日）。タイムログの複数日・睡眠の翌日など */
  endDate: string | null
  /** 予定/ログの開始時刻（`HH:mm`）。通常タスクでは `scheduledDate` の時間幅、ログでは `dueDate` の開始 */
  startTime: string | null
  endTime: string | null
  /**
   * 入力したタイムゾーン（IANA 名。`null`/未設定はアプリのタイムゾーンのまま動く）。
   * 日付・時刻の列は常にアプリのタイムゾーンの壁時計で、詳細だけこのタイムゾーンで見せる（`taskTimeZone.ts`）
   */
  timeZone: string | null
  /** 日付・時刻の列がどのタイムゾーンの壁時計で書かれているか（`timeZone` があるときだけ） */
  timeZoneAnchor: string | null
  /**
   * このタスクの通知（Google の「通知を追加」）。`null`/未設定は設定の既定（予定の前・締切の前）、`[]` は通知しない。
   * 判定は `supabase/functions/daily-reminders/schedule.ts`
   */
  reminders: TaskReminder[] | null
  /** 見積もり（かかりそうな時間、分）。タイムラインに置く・時間を決めるときの長さ。`null`/未設定は設定の既定の予定の長さ */
  estimateMinutes: number | null
  /** 場所（自由入力）。Google カレンダー風に Google Map へ飛べる。`null`/空は未設定 */
  location: string | null
  /** 記録の色（`#RRGGBB`）。Google カレンダーの予定から記録にしたとき元の色を引き継ぐ。null は分類の色 */
  color: string | null
  priority: Priority
  /** To-Do のタグ。記録では分類名を 1 つだけ写す（前の版の端末が tags の先頭を分類として読むため。正は `category`） */
  tags: string[]
  /** 記録の分類（ラベル）名。null はラベルなし。To-Do では使わない（null） */
  category: string | null
  recurrence: Recurrence | null
  /** 習慣から作った記録なら、その習慣の id。時間を決めた習慣はこの記録の時刻で「時間どおりか」を判定する */
  habitId: string | null
  /**
   * ▶ で始めた記録なら、元の To-Do・予定の id。予定と記録の突き合わせ（計画どおりか）で、題名を直しても元の予定と組にする。
   * To-Do・予定では使わない（null）
   */
  sourceTaskId: string | null
  /** アーカイブした瞬間の ISO 時刻。`null`/未設定はアーカイブされていない。アーカイブ済みタスクは通常のビューから除外され「アーカイブ済み」箱に入る */
  archivedAt: string | null
  /** 削除（ゴミ箱行き）した瞬間の ISO 時刻。`null`/未設定は削除されていない。ソフト削除で「削除済み」箱から復元・完全削除できる */
  deletedAt: string | null
}

/** To-Do */
export interface TodoTask extends TaskBase {
  kind: 'todo'
  /** 期限日（`yyyy-MM-dd`）。スマートビュー（今日/近日中/期限切れ）の基準。`null` は期限なし */
  dueDate: string | null
}

/** 予定（完了の丸の無い、時刻のある予定） */
export interface EventTask extends TaskBase {
  kind: 'event'
  /** 予定には締切を付けない（いつも null） */
  dueDate: string | null
}

/** 記録（実際にやった時間） */
export interface LogTask extends TaskBase {
  kind: 'log'
  /** 開始日（`yyyy-MM-dd`）。終わりの日は `endDate`（`null` は同じ日） */
  dueDate: string | null
}

/** 睡眠の記録。記録の時間・分類の集計に入れない */
export interface SleepTask extends TaskBase {
  kind: 'sleep'
  /** 寝た日（`yyyy-MM-dd`）。起きた日は `endDate` */
  dueDate: string | null
}

export type Task = TodoTask | EventTask | LogTask | SleepTask

type Kinded = { kind?: TaskKind }

/** To-Do か（下書きなど `kind` の無いものは To-Do） */
export function isTodoTask<T extends Kinded>(t: T): t is T & { kind: 'todo' } {
  return t.kind === undefined || t.kind === 'todo'
}

/** 予定（完了の丸の無いもの）か */
export function isEventTask<T extends Kinded>(t: T): t is T & { kind: 'event' } {
  return t.kind === 'event'
}

/** 予定の欄（タイムラインの予定の列・終日の行・日付のマス）へ置いたときの種類。記録は To-Do に、予定は予定のまま */
export function planKindOf(t: Kinded | undefined): 'todo' | 'event' {
  return t?.kind === 'event' ? 'event' : 'todo'
}

/** 記録か（睡眠も含む） */
export function isLogTask<T extends Kinded>(t: T): t is T & { kind: 'log' | 'sleep' } {
  return t.kind === 'log' || t.kind === 'sleep'
}

/** 睡眠の記録か。睡眠は記録の時間・分類の集計に入れず、タイムラインでも落ち着いた色で描く */
export function isSleepTask<T extends Kinded>(t: T): t is T & { kind: 'sleep' } {
  return t.kind === 'sleep'
}

/** サーバー・前の版のバックアップの印（記録か・睡眠か・予定か）から種類を出す。睡眠の印だけでは記録にしない */
export function taskKindFromFlags(isTimeLog: boolean, isSleep: boolean, isEvent = false): TaskKind {
  if (!isTimeLog) return isEvent ? 'event' : 'todo'
  return isSleep ? 'sleep' : 'log'
}

/** 種類をサーバー・前の版のバックアップの印に */
export function taskKindFlags(kind: TaskKind): { isTimeLog: boolean; isSleep: boolean; isEvent: boolean } {
  return { isTimeLog: kind === 'log' || kind === 'sleep', isSleep: kind === 'sleep', isEvent: kind === 'event' }
}
