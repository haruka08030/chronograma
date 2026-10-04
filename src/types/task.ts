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
}

/**
 * タスクの種類。
 * - `todo`: To-Do（やること）
 * - `log`: 記録（実際にやった時間）
 * - `sleep`: 睡眠の記録（朝に「何時に寝て何時に起きたか」で入れる）。記録の時間・分類の集計に入れない
 *
 * サーバー・前の版のバックアップでは `is_time_log` / `isTimeLog`（記録か）と `is_sleep` / `isSleep`（睡眠か）の 2 つで持つ
 */
export type TaskKind = 'todo' | 'log' | 'sleep'

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

export type Task = TodoTask | LogTask | SleepTask

/** 記録（睡眠も含む）。`dueDate` が開始日で、カレンダーには実際の時間で置く */
export type TimeLogTask = LogTask | SleepTask

type Kinded = { kind?: TaskKind }

/** To-Do か（下書きなど `kind` の無いものは To-Do） */
export function isTodoTask<T extends Kinded>(t: T): t is T & { kind: 'todo' } {
  return t.kind === undefined || t.kind === 'todo'
}

/** 記録か（睡眠も含む） */
export function isLogTask<T extends Kinded>(t: T): t is T & { kind: 'log' | 'sleep' } {
  return t.kind === 'log' || t.kind === 'sleep'
}

/** 睡眠の記録か。睡眠は記録の時間・分類の集計に入れず、タイムラインでも落ち着いた色で描く */
export function isSleepTask<T extends Kinded>(t: T): t is T & { kind: 'sleep' } {
  return t.kind === 'sleep'
}

/** サーバー・前の版のバックアップの 2 つの印（記録か・睡眠か）から種類を出す。睡眠の印だけでは記録にしない */
export function taskKindFromFlags(isTimeLog: boolean, isSleep: boolean): TaskKind {
  if (!isTimeLog) return 'todo'
  return isSleep ? 'sleep' : 'log'
}

/** 種類をサーバー・前の版のバックアップの 2 つの印に */
export function taskKindFlags(kind: TaskKind): { isTimeLog: boolean; isSleep: boolean } {
  return { isTimeLog: kind !== 'todo', isSleep: kind === 'sleep' }
}
