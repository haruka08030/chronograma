/** Google Calendar 取得結果（アプリ内正規化済み） */
export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  /** API の開始値（終日は日付、それ以外は dateTime） */
  start: string
  /** API の終了値 */
  end: string
  /** 終日でない場合の HH:mm */
  startTime: string | null
  endTime: string | null
  /** yyyy-MM-dd */
  date: string
  isAllDay: boolean
  colorId?: string
  /** 繰り返し予定のシリーズ ID（色を「すべての繰り返し」に付けるとき用） */
  recurringEventId?: string
  /** Google から分かる色（予定の色 → カレンダーの色 → ピーコック） */
  baseColor?: string
  /** 予定に自分の色（colorId 1〜11）が付いているか。無いものは「色なし」か、API に出ない新しい色 */
  ownColor?: boolean
  /** 表示・記録コピー用に解決した色（アプリで付けた色 → 似た予定から推定 → Google から分かる色） */
  color?: string
}
