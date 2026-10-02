import { addDays, format, isValid, parseISO, startOfDay } from 'date-fns'
import { zonedNow } from './timeZone'

export type ParsedQuickAdd = {
  title: string
  /** 日付キーワード（今日/明日/曜日/9/30 など） */
  date: string | null
  /** 「明日まで」「by fri」のように締切として書いたか。違えば「やる日」 */
  dateIsDeadline: boolean
  tags: string[]
  /** 時刻指定（`HH:mm`）。あれば予定としてタイムラインに置く */
  startTime: string | null
  endTime: string | null
  /** `@買い物` のようなリスト指定（名前そのまま。解決は呼び出し側で） */
  listName: string | null
}

/** 時刻だけで長さの指定がないときの予定の長さ */
export const DEFAULT_BLOCK_MINUTES = 60

const JA_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const EN_WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const pad = (n: number) => String(n).padStart(2, '0')
const hm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`

/** 次に来るその曜日（今日と同じ曜日なら今日） */
function nextWeekday(today: Date, dow: number): Date {
  return addDays(today, (dow - today.getDay() + 7) % 7)
}

type Piece =
  | { kind: 'date'; date: Date }
  | { kind: 'time'; min: number }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'duration'; min: number }
  | { kind: 'deadline' }
  | { kind: 'filler' }

function clockMinutes(h: number, m: number, meridiem?: string): number | null {
  let hour = h
  if (meridiem === '午後' || meridiem === 'pm') hour = h % 12 + 12
  else if (meridiem === '午前' || meridiem === 'am') hour = h % 12
  if (hour > 24 || m > 59) return null
  return (hour % 24) * 60 + m
}

/**
 * 先頭の時刻を 1 つ読む（15時 / 15時30分 / 15時半 / 午後3時 / 15:00 / 3pm / 3:30pm）。
 * `explicit` は「15」のような素の数字でないこと（範囲の右辺では素の数字も許す）。
 */
function readClock(s: string, localeJa: boolean): { min: number; rest: string; explicit: boolean } | null {
  let m: RegExpMatchArray | null
  // 「時間」は長さなので時刻として読まない
  if (localeJa && (m = s.match(/^(午前|午後)?(\d{1,2})時(?!間)(?:(\d{1,2})分|(半))?/))) {
    const min = clockMinutes(Number(m[2]), m[4] ? 30 : Number(m[3] ?? 0), m[1])
    return min == null ? null : { min, rest: s.slice(m[0].length), explicit: true }
  }
  if ((m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?(?![\d時分])/i))) {
    const min = clockMinutes(Number(m[1]), Number(m[2] ?? 0), m[3]?.toLowerCase())
    return min == null ? null : { min, rest: s.slice(m[0].length), explicit: m[2] !== undefined || m[3] !== undefined }
  }
  return null
}

/** トークン先頭から 1 片だけ読む。読めなければ null */
function readPiece(s: string, today: Date, localeJa: boolean): { piece: Piece; rest: string } | null {
  const low = s.toLowerCase()
  const words: [string, number][] = [['today', 0], ['tomorrow', 1], ['tmr', 1]]
  if (localeJa) words.push(['明後日', 2], ['あさって', 2], ['明日', 1], ['あした', 1], ['今日', 0], ['きょう', 0])
  for (const [w, offset] of words) {
    if (low.startsWith(w)) return { piece: { kind: 'date', date: addDays(today, offset) }, rest: s.slice(w.length) }
  }

  let m: RegExpMatchArray | null
  if (localeJa && (m = s.match(/^(?:来週の?)?([日月火水木金土])曜(?:日)?/))) {
    const dow = JA_WEEKDAYS.indexOf(m[1]!)
    // 来週 = 次の月曜から始まる週
    const nextMonday = addDays(today, (8 - today.getDay()) % 7 || 7)
    const target = s.startsWith('来週') ? addDays(nextMonday, (dow + 6) % 7) : nextWeekday(today, dow)
    return { piece: { kind: 'date', date: target }, rest: s.slice(m[0].length) }
  }
  if ((m = low.match(/^(sun|mon|tue|wed|thu|fri|sat)[a-z]*/))) {
    return { piece: { kind: 'date', date: nextWeekday(today, EN_WEEKDAYS.indexOf(m[1]!)) }, rest: s.slice(m[0].length) }
  }
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
    const d = parseISO(`${m[0]}T12:00:00`)
    if (isValid(d)) return { piece: { kind: 'date', date: startOfDay(d) }, rest: s.slice(m[0].length) }
  }
  // 9/30, 10月3日（過ぎていれば来年）
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})(?![\d:])/)) || (localeJa && (m = s.match(/^(\d{1,2})月(\d{1,2})日/)))) {
    const month = Number(m[1]) - 1
    const day = Number(m[2])
    let d = new Date(today.getFullYear(), month, day)
    if (d.getMonth() !== month) return null
    if (d < today) d = new Date(today.getFullYear() + 1, month, day)
    return { piece: { kind: 'date', date: d }, rest: s.slice(m[0].length) }
  }

  // 時刻、または範囲（15:00-16:30 / 15時〜16時半 / 3pm-4pm）
  const clock = readClock(s, localeJa)
  if (clock) {
    const sep = clock.rest.match(/^\s*[-〜~–]\s*/)
    const endClock = sep ? readClock(clock.rest.slice(sep[0].length), localeJa) : null
    // 「3-4」のように両辺とも素の数字なら時刻と断定できないので読まない
    if (endClock && endClock.min > clock.min && (clock.explicit || endClock.explicit)) {
      return { piece: { kind: 'range', start: clock.min, end: endClock.min }, rest: endClock.rest }
    }
    if (clock.explicit) return { piece: { kind: 'time', min: clock.min }, rest: clock.rest }
  }

  // 長さ: 1h / 1.5h / 30m / 30min / 1時間 / 1時間半 / 90分
  if ((m = low.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)(?![a-z])/))) {
    return { piece: { kind: 'duration', min: Math.round(Number(m[1]) * 60) }, rest: s.slice(m[0].length) }
  }
  if ((m = low.match(/^(\d+)\s*(m|min|mins|minutes?)(?![a-z])/))) {
    return { piece: { kind: 'duration', min: Number(m[1]) }, rest: s.slice(m[0].length) }
  }
  if (localeJa && (m = s.match(/^(\d+(?:\.\d+)?)時間(半)?/))) {
    return { piece: { kind: 'duration', min: Math.round(Number(m[1]) * 60) + (m[2] ? 30 : 0) }, rest: s.slice(m[0].length) }
  }
  if (localeJa && (m = s.match(/^(\d+)分(間)?/))) {
    return { piece: { kind: 'duration', min: Number(m[1]) }, rest: s.slice(m[0].length) }
  }

  // 締切の印（「明日まで」「金曜までに」）
  if (localeJa && (m = s.match(/^までに?/))) return { piece: { kind: 'deadline' }, rest: s.slice(m[0].length) }
  // つなぎ語（「15時から1時間」「明日の」）
  if (localeJa && (m = s.match(/^(から|の|に)/))) return { piece: { kind: 'filler' }, rest: s.slice(m[0].length) }
  return null
}

/** トークン全体が日時表現だけでできていればその片を返す（1 文字でも余れば null＝タイトルの一部） */
function readToken(token: string, today: Date, localeJa: boolean): Piece[] | null {
  const pieces: Piece[] = []
  let rest = token
  while (rest.length > 0) {
    const r = readPiece(rest, today, localeJa)
    if (!r || r.rest.length === rest.length) return null
    pieces.push(r.piece)
    rest = r.rest
  }
  return pieces.every((p) => p.kind === 'filler' || p.kind === 'deadline') ? null : pieces
}

/**
 * クイック追加の入力から #タグ・日付・時刻・長さを取り出す。
 * 日時表現は空白で区切られた語として書く（例: 「明日15時 企画会議 1時間 #仕事」「mtg fri 3pm-4pm」）。
 * 日付は「やる日」。締切にしたいときは「明日まで 課題」「essay by fri」と書く。
 */
export function parseQuickAddTitle(
  raw: string,
  localeJa: boolean,
  now = zonedNow(),
  /** タグを使わない設定なら `#…` も題名のまま残す */
  opts: { tags?: boolean } = {},
): ParsedQuickAdd {
  const today = startOfDay(now)
  const tags: string[] = []
  let listName: string | null = null
  let date: Date | null = null
  let deadline = false
  /** 英語の「by fri」「due 10/5」: 直後が日付の語なら締切の印として読む */
  let pendingDeadlineWord: string | null = null
  let start: number | null = null
  let end: number | null = null
  let duration: number | null = null
  /** 長さだけの語は、時刻が無ければタイトルに戻すので位置を覚えておく */
  const titleParts: { text: string; durationOnly: boolean }[] = []

  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    if (pendingDeadlineWord !== null) {
      const word = pendingDeadlineWord
      pendingDeadlineWord = null
      if (readToken(token, today, localeJa)?.some((p) => p.kind === 'date')) deadline = true
      else titleParts.push({ text: word, durationOnly: false })
    }
    // 表示言語が日本語でも英語で書けるように、by / due は言語を問わず読む
    if (/^(by|due)$/i.test(token)) {
      pendingDeadlineWord = token
      continue
    }
    if ((token.startsWith('@') || token.startsWith('＠')) && token.length > 1) {
      listName = token.slice(1).trim()
      continue
    }
    if (opts.tags !== false && token.startsWith('#') && token.length > 1) {
      const name = token.slice(1).trim()
      if (name && !tags.includes(name)) tags.push(name)
      continue
    }
    const pieces = readToken(token, today, localeJa)
    if (!pieces) {
      titleParts.push({ text: token, durationOnly: false })
      continue
    }
    if (pieces.every((p) => p.kind === 'duration' || p.kind === 'filler')) {
      titleParts.push({ text: token, durationOnly: true })
    }
    for (const p of pieces) {
      if (p.kind === 'date') date = p.date
      else if (p.kind === 'time') start = p.min
      else if (p.kind === 'range') { start = p.start; end = p.end }
      else if (p.kind === 'duration') duration = p.min
      else if (p.kind === 'deadline') deadline = true
    }
  }
  if (pendingDeadlineWord !== null) titleParts.push({ text: pendingDeadlineWord, durationOnly: false })

  if (start != null && end == null) end = Math.min(start + (duration ?? DEFAULT_BLOCK_MINUTES), 24 * 60 - 1)

  const title =
    titleParts
      .filter((p) => !p.durationOnly || start == null)
      .map((p) => p.text)
      .join(' ')
      .trim() || raw.trim()
  return {
    title,
    date: date ? format(date, 'yyyy-MM-dd') : null,
    dateIsDeadline: deadline && date != null,
    tags,
    startTime: start != null ? hm(start) : null,
    endTime: end != null ? hm(end) : null,
    listName,
  }
}
