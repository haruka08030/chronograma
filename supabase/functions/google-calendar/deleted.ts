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
 * 予定の一覧（消された予定も含めて取ったもの）を、出す予定と、Google で消されたアプリの予定の ID に分ける。
 * 繰り返しの回の取り消しなど、ほかの消された予定は捨てる
 */
export function splitDeleted<T extends Item>(items: T[]): { live: T[]; deletedPushed: DeletedPushed[] } {
  const live: T[] = []
  const deletedPushed: DeletedPushed[] = []
  for (const item of items) {
    if (item.status !== 'cancelled') live.push(item)
    else if (item.id.startsWith(PUSHED_PREFIX) && !item.recurringEventId) deletedPushed.push({ id: item.id, updated: item.updated ?? null })
  }
  return { live, deletedPushed }
}
