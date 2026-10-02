/**
 * Google の予定にアプリ側で付ける色。
 * API の colorId は昔からの 11 色だけで、Google の画面で増えた色（アボカドなど）を付けた予定は「色なし」と区別できない。
 * そこでアプリで付け直せるようにし、付けた色から「似たタイトルの色なし予定」の色も推定する。
 */
import type { CalendarEvent } from '../types/calendarEvent'
import { titleTokens } from './logCategory'

export interface EventColorChoice {
  hex: string
  /** 推定に使う（似たタイトルの予定へ広げる） */
  title: string
}

/** `e:<予定 ID>`（この予定だけ）/ `s:<シリーズ ID>`（すべての繰り返し） */
export type EventColorChoices = Record<string, EventColorChoice>

export const eventChoiceKey = (id: string) => `e:${id}`
export const seriesChoiceKey = (seriesId: string) => `s:${seriesId}`

const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase()

/** 付けた色の中から、同じタイトル → 単語の重なりが多い色 */
export function inferHexByTitle(examples: readonly EventColorChoice[], title: string): string | null {
  const key = norm(title)
  if (!key) return null
  const exact = examples.find((x) => norm(x.title) === key)
  if (exact) return exact.hex
  const tokens = new Set(titleTokens(title))
  if (tokens.size === 0) return null
  const votes = new Map<string, number>()
  for (const x of examples) {
    const shared = titleTokens(x.title).filter((t) => tokens.has(t)).length
    if (shared > 0) votes.set(x.hex, (votes.get(x.hex) ?? 0) + shared)
  }
  let best: string | null = null
  let bestScore = 0
  for (const [hex, score] of votes) {
    if (score > bestScore) {
      best = hex
      bestScore = score
    }
  }
  return best
}

/** 付けた色（この予定 → シリーズ）→ Google で色を付けた予定はその色 → 色なしは似た予定から推定 → Google から分かる色 */
export function resolveEventColor(e: CalendarEvent, choices: EventColorChoices): string | undefined {
  const direct = choices[eventChoiceKey(e.id)] ?? (e.recurringEventId ? choices[seriesChoiceKey(e.recurringEventId)] : undefined)
  if (direct) return direct.hex
  const base = e.baseColor ?? e.color
  if (e.ownColor) return base
  return inferHexByTitle(Object.values(choices), e.summary) ?? base
}

export function resolveEventColors(events: readonly CalendarEvent[], choices: EventColorChoices): CalendarEvent[] {
  return events.map((e) => {
    const color = resolveEventColor(e, choices)
    return color === e.color ? e : { ...e, color }
  })
}
