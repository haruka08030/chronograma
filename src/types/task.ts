import type { TaskReminder } from '../../supabase/functions/daily-reminders/schedule.ts'

export type Priority = 'none' | 'low' | 'medium' | 'high'

export interface Recurrence {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
}

export interface Task {
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
  /** 期限日（`yyyy-MM-dd`）。スマートビュー（今日/近日中/期限切れ）の基準。`null` は期限なし */
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
  tags: string[]
  recurrence: Recurrence | null
  isTimeLog: boolean
  /** 習慣から作った記録なら、その習慣の id。時間を決めた習慣はこの記録の時刻で「時間どおりか」を判定する */
  habitId: string | null
  /** 睡眠の記録（朝に「何時に寝て何時に起きたか」で入れる）。記録の時間・分類の集計に入れない */
  isSleep: boolean
  /** アーカイブした瞬間の ISO 時刻。`null`/未設定はアーカイブされていない。アーカイブ済みタスクは通常のビューから除外され「アーカイブ済み」箱に入る */
  archivedAt: string | null
  /** 削除（ゴミ箱行き）した瞬間の ISO 時刻。`null`/未設定は削除されていない。ソフト削除で「削除済み」箱から復元・完全削除できる */
  deletedAt: string | null
}
