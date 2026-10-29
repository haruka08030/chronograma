import type { CalendarEvent } from '../types/calendarEvent'
import type { Task } from '../types/task'
import { isPushedGoogleEvent } from './googlePush'
import { googleSkipKey } from './googleSkip'

/**
 * 予定の作成先を名前から先に選ぶ（#626。記録の名前からラベルを先に選ぶのと同じく、前の予定から推す）。
 * 同じ名前（`googleSkipKey`。全角半角・大文字小文字・空白の違いだけ同じ、部分一致はしない）の一番新しい予定
 * （日付→開始→作った時刻の順で比べる）がアプリの予定ならアプリ（その予定のリスト）、Google の予定なら Google。
 * 送らない名前（`addons.googleSkip`）はアプリだけ。分からない名前は null（前に選んだ作成先のまま）
 */
export type EventDestination = { kind: 'app'; listId: string | null } | { kind: 'google' }

type Candidate = { at: string; dest: EventDestination }

export function inferEventDestination(
  title: string,
  tasks: readonly Task[],
  calendarEvents: readonly CalendarEvent[],
  skipNames: readonly string[],
): EventDestination | null {
  const key = googleSkipKey(title)
  if (!key) return null
  let best = null as Candidate | null
  // 同じ日時ならアプリの予定（作った時刻が続く分だけ後に並ぶ）
  const offer = (c: Candidate) => {
    if (!best || c.at > best.at) best = c
  }
  for (const t of tasks) {
    if (t.kind !== 'event' || t.deletedAt || googleSkipKey(t.title) !== key) continue
    offer({ at: `${t.scheduledDate ?? ''} ${t.startTime ?? ''} ${t.createdAt}`, dest: { kind: 'app', listId: t.listId } })
  }
  const skipped = skipNames.some((n) => googleSkipKey(n) === key)
  if (skipped) return best ? best.dest : { kind: 'app', listId: null }
  for (const e of calendarEvents) {
    if (isPushedGoogleEvent(e) || e.skipped || googleSkipKey(e.summary) !== key) continue
    offer({ at: `${e.date} ${e.startTime ?? ''}`, dest: { kind: 'google' } })
  }
  return best ? best.dest : null
}
