export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  start: string
  end: string
  startTime: string | null
  endTime: string | null
  date: string
  isAllDay: boolean
  colorId?: string
}
