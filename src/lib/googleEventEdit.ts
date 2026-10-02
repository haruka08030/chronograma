import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import type { CalendarEvent } from '../types/calendarEvent'
import {
  applyTimingLocally,
  createGoogleEvent,
  deleteGoogleEvent,
  localizeGoogleError,
  updateGoogleEvent,
  type GoogleEventTiming,
} from './googleCalendar'

/**
 * Google の予定をアプリから書き換える操作。画面は先に変え（楽観的）、Google に送って返ってきた形で置き換える。
 * 失敗したら元に戻してトーストで知らせる。Google 側の変更は useGoogleCalendarEvents の取り直しで入ってくる。
 */

/** ネイティブ D&D でつかんでいる Google の予定（週をめくって一覧から消えても落とせるように持っておく） */
export { GOOGLE_EVENT_DND_TYPE } from './useTimelineDrop'
let draggedEvent: CalendarEvent | null = null
export function setDraggedGoogleEvent(e: CalendarEvent | null) {
  draggedEvent = e
}
export function getDraggedGoogleEvent(): CalendarEvent | null {
  return draggedEvent
}

/** この予定をアプリから変えられるか（書き込み権限があり、主催者か変更を許された予定） */
export function canEditGoogleEvent(e: CalendarEvent, canWrite: boolean): boolean {
  return canWrite && e.editable !== false
}

function upsert(next: CalendarEvent, replaceId = next.id) {
  const s = useTaskStore.getState()
  const exists = s.calendarEvents.some((e) => e.id === replaceId)
  s.setCalendarEvents(
    exists ? s.calendarEvents.map((e) => (e.id === replaceId ? next : e)) : [...s.calendarEvents, next],
  )
}

function remove(id: string) {
  const s = useTaskStore.getState()
  s.setCalendarEvents(s.calendarEvents.filter((e) => e.id !== id))
}

function report(e: unknown) {
  const raw = e instanceof Error ? e.message : ''
  const s = useTaskStore.getState()
  if (raw.toLowerCase().includes('write scope not granted')) s.setGoogleCanWrite(false)
  const localized = raw ? localizeGoogleError(raw, i18n.t.bind(i18n)) : ''
  s.showMoveBanner(localized && localized !== raw ? localized : i18n.t('googleEdit.failed'))
}

export async function moveGoogleEvent(event: CalendarEvent, timing: GoogleEventTiming) {
  upsert(applyTimingLocally(event, timing))
  try {
    const saved = await updateGoogleEvent(event.id, { timing })
    if (saved) upsert(saved)
  } catch (e) {
    upsert(event)
    report(e)
  }
}

export async function renameGoogleEvent(event: CalendarEvent, summary: string) {
  const title = summary.trim()
  if (!title || title === event.summary) return
  upsert({ ...event, summary: title })
  try {
    const saved = await updateGoogleEvent(event.id, { summary: title })
    if (saved) upsert(saved)
  } catch (e) {
    upsert(event)
    report(e)
  }
}

export async function removeGoogleEvent(event: CalendarEvent) {
  remove(event.id)
  try {
    await deleteGoogleEvent(event.id)
    useTaskStore.getState().showMoveBanner(i18n.t('googleEdit.deleted'))
  } catch (e) {
    upsert(event)
    report(e)
  }
}

export async function addGoogleEvent(summary: string, timing: GoogleEventTiming) {
  const tempId = `pending-${crypto.randomUUID()}`
  const draft = applyTimingLocally(
    { id: tempId, summary, start: '', end: '', startTime: null, endTime: null, date: timing.date, isAllDay: false, editable: false },
    timing,
  )
  upsert(draft)
  try {
    const saved = await createGoogleEvent(summary, timing)
    if (saved) upsert(saved, tempId)
    else remove(tempId)
  } catch (e) {
    remove(tempId)
    report(e)
  }
}
