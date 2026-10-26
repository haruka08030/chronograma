import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import type { CalendarEvent } from '../types/calendarEvent'
import {
  applyTimingLocally,
  createGoogleEvent,
  deleteGoogleEvent,
  googleWriteFailure,
  localizeGoogleError,
  normalizeCalendarEventTimes,
  updateGoogleEvent,
  googleEventTiming,
  type GoogleEventTiming,
} from './googleCalendar'
import { UNDO_WINDOW_MS } from './undoWindow'
import { isSkippedDeletion, toSkippedEvent } from './skippedEvents'

/**
 * Google の予定をアプリから書き換える操作（題名・削除・複製）。画面は先に変え（楽観的）、Google に送って返ってきた形で置き換える。
 * 失敗したら元に戻してトーストで知らせる。Google 側の変更は useGoogleCalendarEvents の取り直しで入ってくる。
 * 時間は Google に送らない。動かした・伸び縮みさせた時間は、その予定の自分の時間としてアプリに持つ（#625、`myEventTimes.ts`）
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

/**
 * この予定の時間をアプリで変えられるか（自分の時間にする）。時刻つきの予定だけ。Google に書かないので主催者でなくてもよい。
 * 終日の予定・やらなかった予定・作っている途中の予定は動かさない
 */
export function canSetMyEventTime(e: CalendarEvent): boolean {
  return !e.isAllDay && !!e.startTime && !!e.endTime && !e.skipped && !e.id.startsWith('pending-')
}

function upsert(next: CalendarEvent, replaceId = next.id) {
  const s = useTaskStore.getState()
  const exists = s.calendarEvents.some((e) => e.id === replaceId)
  s.setCalendarEvents(exists ? s.calendarEvents.map((e) => (e.id === replaceId ? next : e)) : [...s.calendarEvents, next])
}

function remove(id: string) {
  const s = useTaskStore.getState()
  s.setCalendarEvents(s.calendarEvents.filter((e) => e.id !== id))
}

/**
 * 直せなかった: 元に戻して知らせる。Google で消されていた予定は戻さずに一覧から外す
 * （出ていたのは前に取った一覧。次の取り直しでも消えている）
 */
function failed(event: CalendarEvent, e: unknown) {
  if (googleWriteFailure(e) === 'deleted') {
    remove(event.id)
    useTaskStore.getState().showMoveBanner(i18n.t('googleEdit.deletedInGoogle'))
    return
  }
  upsert(event)
  report(e)
}

function report(e: unknown) {
  const raw = e instanceof Error ? e.message : ''
  const s = useTaskStore.getState()
  if (googleWriteFailure(e) === 'scope') s.setGoogleCanWrite(false)
  const localized = raw ? localizeGoogleError(raw, i18n.t.bind(i18n)) : ''
  s.showMoveBanner(localized && localized !== raw ? localized : i18n.t('googleEdit.failed'))
}

/**
 * 動かした・伸び縮みさせた時間を、その予定の自分の時間にする（Google の予定の時間は変えない、#625）。
 * 開催時間と同じにしたら自分の時間を外す。「元に戻す」付き
 */
export function setMyGoogleEventTime(event: CalendarEvent, timing: GoogleEventTiming) {
  if (!canSetMyEventTime(event) || !timing.startTime || !timing.endTime) return
  const mine = applyTimingLocally(event, timing)
  useTaskStore.getState().setMyEventTime(event, { start: mine.start, end: mine.end })
}

export async function renameGoogleEvent(event: CalendarEvent, summary: string) {
  const title = summary.trim()
  if (!title || title === event.summary) return
  upsert({ ...event, summary: title })
  try {
    const saved = await updateGoogleEvent(event.id, { summary: title })
    if (saved) upsert(saved)
  } catch (e) {
    failed(event, e)
  }
}

/**
 * 消したばかりで、まだ Google に送っていない予定。Google 側の削除は戻せないので、
 * 画面からはすぐ消し、「元に戻す」のトーストが消えるまで送るのを待つ（Gmail の送信取り消しと同じ）
 */
const pendingDeletes = new Map<string, { event: CalendarEvent; timer: ReturnType<typeof setTimeout> }>()

/** 取り直した一覧に、送る前の削除を生き返らせない */
export function withoutPendingDeletes(events: CalendarEvent[]): CalendarEvent[] {
  return pendingDeletes.size === 0 ? events : events.filter((e) => !pendingDeletes.has(e.id))
}

/**
 * 消す。始まった予定（行かなかった gym・休んだ授業など）は、やらなかった予定としてその日に薄く残す（#528、`lib/skippedEvents.ts`）
 */
export function removeGoogleEvent(event: CalendarEvent) {
  remove(event.id)
  if (isSkippedDeletion(event)) useTaskStore.getState().addSkippedEvents([toSkippedEvent(event, new Date().toISOString())])
  const timer = setTimeout(() => void sendDelete(event.id), UNDO_WINDOW_MS)
  pendingDeletes.set(event.id, { event, timer })
  useTaskStore.getState().setGoogleUndo({
    id: event.id,
    text: i18n.t('undo.googleDeleted', { name: event.summary || i18n.t('quickCreate.untitled') }),
  })
  ensureFlushOnLeave()
}

/** トーストの「元に戻す」・⌘Z。まだ送っていなければ予定を戻す。戻したら true */
export function undoGoogleDelete(): boolean {
  const s = useTaskStore.getState()
  const id = s.googleUndo?.id
  s.setGoogleUndo(null)
  const pending = id ? pendingDeletes.get(id) : undefined
  if (!id || !pending) return false
  clearTimeout(pending.timer)
  pendingDeletes.delete(id)
  upsert(pending.event)
  s.dropRestoredSkipped(new Set([id]))
  return true
}

async function sendDelete(id: string) {
  const pending = pendingDeletes.get(id)
  if (!pending) return
  pendingDeletes.delete(id)
  clearTimeout(pending.timer)
  const s = useTaskStore.getState()
  if (s.googleUndo?.id === id) s.setGoogleUndo(null)
  try {
    await deleteGoogleEvent(id)
  } catch (e) {
    upsert(pending.event)
    useTaskStore.getState().dropRestoredSkipped(new Set([id]))
    report(e)
  }
}

/** タブを閉じるときは待たずに送る（届かなければ予定は残る。消えるより安全な側） */
let flushListening = false
function ensureFlushOnLeave() {
  if (flushListening || typeof window === 'undefined') return
  flushListening = true
  window.addEventListener('pagehide', () => {
    for (const id of [...pendingDeletes.keys()]) void sendDelete(id)
  })
}

export async function addGoogleEvent(summary: string, timing: GoogleEventTiming, from?: CalendarEvent) {
  const tempId = `pending-${crypto.randomUUID()}`
  // コピーは返ってくるまでも元と同じ色で出す
  const look = from ? { color: from.color, baseColor: from.baseColor, ownColor: from.ownColor, colorId: from.colorId } : {}
  const draft = applyTimingLocally(
    {
      id: tempId,
      summary,
      start: '',
      end: '',
      startTime: null,
      endTime: null,
      date: timing.date,
      isAllDay: false,
      editable: false,
      ...look,
    },
    timing,
  )
  upsert(draft)
  try {
    const saved = await createGoogleEvent(
      summary,
      timing,
      from ? { description: from.description || undefined, colorId: from.ownColor ? from.colorId : undefined } : {},
    )
    if (saved) upsert(saved, tempId)
    else remove(tempId)
  } catch (e) {
    remove(tempId)
    report(e)
  }
}

/** 同じ日・同じ時間（開催時間）にもう 1 つ作る（題名・メモ・予定の色を写す。繰り返しはその回だけの 1 件） */
export function duplicateGoogleEvent(event: CalendarEvent) {
  const held = event.held ? normalizeCalendarEventTimes({ ...event, ...event.held }) : event
  return addGoogleEvent(event.summary, googleEventTiming(held), event)
}
