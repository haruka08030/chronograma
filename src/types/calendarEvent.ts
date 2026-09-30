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
  /** 表示・記録コピー用に解決した色（予定の色 → カレンダーの色 → ピーコック） */
  color?: string
}
