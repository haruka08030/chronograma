import { GoogleApiError } from './googleError.ts'

/**
 * Google で消された予定の扱い（#494）。アプリから送った予定（ID が `chronograma` で始まる、`src/lib/googlePush.ts`）を
 * Google で消したら、アプリはそれに合わせて予定をゴミ箱に入れる。だから送るときに消えていても戻さない。
 */

/** アプリの予定から作った Google の予定の ID の頭（`src/lib/googlePush.ts` の PREFIX とそろえる） */
export const PUSHED_PREFIX = 'chronograma'

/** 書き換えようとした予定が Google で消されていた（`google_deleted` で返す） */
export class GoogleEventDeletedError extends Error {
  constructor() {
    super('Google Calendar event was deleted')
    this.name = 'GoogleEventDeletedError'
  }
}

type Item = { id: string; status?: string; recurringEventId?: string; updated?: string }

/** Google で消されたアプリの予定（`updated` は消された時刻。アプリでそれより後に直した予定は消さない） */
export type DeletedPushed = { id: string; updated: string | null }
type Write<T extends Item> = (method: 'PATCH' | 'POST', fields: Record<string, unknown>) => Promise<T>

const isGone = (e: unknown, statuses: number[]) => e instanceof GoogleApiError && statuses.includes(e.status)

/**
 * 直した結果が消された予定なら消されたとして投げる。消えている予定の PATCH は 410 か、
 * 消えたまま（`status: cancelled`）の予定が返る。`missingIsDeleted` なら 404 も消された扱い
 * （アプリに出ている Google の予定を直すとき。upsert の 404 は「まだ作っていない」）
 */
export async function patchExisting<T extends Item>(
  write: Write<T>,
  fields: Record<string, unknown>,
  missingIsDeleted = false,
): Promise<T> {
  let item: T
  try {
    item = await write('PATCH', fields)
  } catch (e) {
    if (isGone(e, missingIsDeleted ? [404, 410] : [410])) throw new GoogleEventDeletedError()
    throw e
  }
  if (item.status === 'cancelled') throw new GoogleEventDeletedError()
  return item
}

/**
 * ID を決めて作る。あれば直し、無ければその ID で作る。
 * アプリの予定から ID を決めるので、何度送っても・どの端末から送っても 1 つにしかならない。
 * Google で消された予定は戻さず `GoogleEventDeletedError`。ただし `revive`（アプリがゴミ箱から戻した・送らない名前から外したなど、
 * アプリが Google から消した予定）なら戻す
 */
export async function upsertEvent<T extends Item>(
  write: Write<T>,
  eventId: string,
  fields: Record<string, unknown>,
  revive: boolean,
): Promise<T> {
  const patch = () => (revive ? write('PATCH', { ...fields, status: 'confirmed' }) : patchExisting(write, fields))
  try {
    return await patch()
  } catch (e) {
    // 404: まだ無い（Google が消した予定をもう覚えていないときも）。戻すなら 410（消されている）も作り直す
    if (!isGone(e, revive ? [404, 410] : [404])) throw e
  }
  try {
    return await write('POST', { ...fields, id: eventId })
  } catch (e) {
    // 同時に作られていた・消えた予定がその ID を持っている（409）ら、もう一度直す
    if (!isGone(e, [409])) throw e
    return await patch()
  }
}

/**
 * 予定の一覧（消された予定も含めて取ったもの）を、出す予定と、Google で消されたアプリの予定の ID と、ほかの消された予定に分ける。
 * ほかの消された予定は、やらなかった予定（`skippedCandidates`）を探すのに使う
 */
export function splitDeleted<T extends Item>(items: T[]): { live: T[]; deletedPushed: DeletedPushed[]; deletedOthers: T[] } {
  const live: T[] = []
  const deletedPushed: DeletedPushed[] = []
  const deletedOthers: T[] = []
  for (const item of items) {
    if (item.status !== 'cancelled') live.push(item)
    else if (item.id.startsWith(PUSHED_PREFIX)) {
      if (!item.recurringEventId) deletedPushed.push({ id: item.id, updated: item.updated ?? null })
    } else deletedOthers.push(item)
  }
  return { live, deletedPushed, deletedOthers }
}

/**
 * やらなかった予定（#528）。開始を過ぎてから消された予定は、予定していたけれどやらなかったものとしてアプリに残す。
 * 開始より前に消した予定は前もって取りやめたもの。開始からしばらく経って消した予定（`SKIP_WINDOW_MS` より後）は、
 * 古い予定の片付けとして数えない。繰り返しの予定をまるごと消した（親が消えている）ときも数えない
 */
export const SKIP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

type EventTime = { dateTime?: string; date?: string }
export type CancelledItem = Item & {
  summary?: string
  colorId?: string
  start?: EventTime
  end?: EventTime
  /** 繰り返しの回の取り消しは、その回の元の開始だけが確かに入っている */
  originalStartTime?: EventTime
}
/** 繰り返しの親（題名・長さ・色を補う。消えていればまるごと消した） */
export type ParentItem = { id: string; status?: string; summary?: string; colorId?: string; start?: EventTime; end?: EventTime }

/** 開始の時刻（ミリ秒）。終日の予定はその日の 0:00（`timeZone` での） */
function startMs(t: EventTime | undefined, timeZone: string): number | null {
  if (t?.dateTime) return Date.parse(t.dateTime)
  if (t?.date) return zonedMidnight(t.date, timeZone)
  return null
}

/** その日の 0:00（`timeZone`）の時刻 */
function zonedMidnight(ymd: string, timeZone: string): number {
  const utc = Date.parse(`${ymd}T00:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utc))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return utc - (asIfUtc - utc)
}

/** 足す（日付のときは日、時刻のときはミリ秒） */
function shift(t: EventTime, ms: number): EventTime {
  if (t.dateTime) return { dateTime: new Date(Date.parse(t.dateTime) + ms).toISOString() }
  const d = new Date(`${t.date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + Math.round(ms / 86_400_000))
  return { date: d.toISOString().slice(0, 10) }
}

/** 長さ（ミリ秒）。分からなければ null */
function spanMs(start: EventTime | undefined, end: EventTime | undefined): number | null {
  if (start?.dateTime && end?.dateTime) return Date.parse(end.dateTime) - Date.parse(start.dateTime)
  if (start?.date && end?.date) return Date.parse(`${end.date}T00:00:00Z`) - Date.parse(`${start.date}T00:00:00Z`)
  return null
}

export type SkippedItem = {
  id: string
  summary: string
  colorId?: string
  recurringEventId?: string
  start: EventTime
  end: EventTime
  /** 消された時刻 */
  skippedAt: string
}

/**
 * 消された予定のうち、やらなかった予定にするもの。題名・時刻が自分に無い回は親から補う（題名が分からなければ ''。
 * アプリが前に取った予定の題名で補う）
 */
export function skippedCandidates(deleted: CancelledItem[], parents: ReadonlyMap<string, ParentItem>, timeZone: string): SkippedItem[] {
  const out: SkippedItem[] = []
  for (const item of deleted) {
    if (!item.updated) continue
    const deletedAt = Date.parse(item.updated)
    const parent = item.recurringEventId ? parents.get(item.recurringEventId) : undefined
    // 親が分からない回は、まるごと消したのか分からないので数えない
    if (item.recurringEventId && (!parent || parent.status === 'cancelled')) continue
    const start = item.start?.dateTime || item.start?.date ? item.start! : item.originalStartTime
    if (!start) continue
    const at = startMs(start, timeZone)
    if (at === null || !Number.isFinite(deletedAt) || deletedAt < at || deletedAt - at > SKIP_WINDOW_MS) continue
    const span = spanMs(item.start, item.end) ?? spanMs(parent?.start, parent?.end) ?? (start.date ? 86_400_000 : 60 * 60 * 1000)
    out.push({
      id: item.id,
      summary: item.summary ?? parent?.summary ?? '',
      colorId: item.colorId ?? parent?.colorId,
      recurringEventId: item.recurringEventId,
      start,
      end: item.end?.dateTime || item.end?.date ? item.end! : shift(start, span),
      skippedAt: new Date(deletedAt).toISOString(),
    })
  }
  return out
}
