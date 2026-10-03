import { addDays, isValid, startOfDay } from 'date-fns'
import { appToday } from './timeZone'
import { fromDateKey, toDateKey } from './dateKey'
import { pad2 } from './clockTime'
import type { Recurrence } from '../types/task'

/**
 * 「毎日」「毎週金」「毎月15日」「every 2 weeks」で書いた繰り返し。
 * 繰り返しの型（`Recurrence`）は種類と間隔だけなので、曜日・日は最初の回の日を決めるのに使う
 */
export type QuickAddRepeat = Recurrence & {
  /** 「毎週金」の曜日（0=日）。null は曜日の指定なし */
  weekday: number | null
  /** 「毎月15日」の日。null は日の指定なし */
  monthDay: number | null
}

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
  /** 繰り返し（「毎日」「毎週金」「every fri」など） */
  repeat: QuickAddRepeat | null
}

/** 時刻だけで長さの指定がないときの予定の長さ */
export const DEFAULT_BLOCK_MINUTES = 60

const JA_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const EN_WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const hm = (min: number) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`

/** 次に来るその曜日（今日と同じ曜日なら今日） */
function nextWeekday(today: Date, dow: number): Date {
  return addDays(today, (dow - today.getDay() + 7) % 7)
}

const repeatOf = (type: Recurrence['type'], interval: number, weekday: number | null = null, monthDay: number | null = null): QuickAddRepeat => ({
  type,
  interval,
  weekday,
  monthDay,
})

/** 「3日ごと」「2週間ごと」「6か月ごと」の単位 */
const JA_REPEAT_UNITS: [RegExp, Recurrence['type']][] = [
  [/^日$/, 'daily'],
  [/^週間?$/, 'weekly'],
  [/^[かカヵヶケ]月$/, 'monthly'],
  [/^年$/, 'yearly'],
]

/** 先頭の繰り返しの語を読む（毎日 / 隔日 / 毎週 / 毎週金 / 毎週金曜 / 隔週 / 毎月 / 毎月15日 / 毎年 / 3日ごと / 2週間ごと） */
function readJaRepeat(s: string): { repeat: QuickAddRepeat; rest: string } | null {
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(毎|隔)日/))) return { repeat: repeatOf('daily', m[1] === '隔' ? 2 : 1), rest: s.slice(m[0].length) }
  // 「毎週月水」のように曜日を 2 つ以上は繰り返しの型で表せないので、残りが読めずタイトルのままになる
  if ((m = s.match(/^(毎|隔)週(?:([日月火水木金土])(?:曜日?)?)?/))) {
    const weekday = m[2] ? JA_WEEKDAYS.indexOf(m[2]) : null
    return { repeat: repeatOf('weekly', m[1] === '隔' ? 2 : 1, weekday), rest: s.slice(m[0].length) }
  }
  if ((m = s.match(/^毎月(?:(\d{1,2})日)?/))) {
    const day = m[1] ? Number(m[1]) : null
    if (day != null && (day < 1 || day > 31)) return null
    return { repeat: repeatOf('monthly', 1, null, day), rest: s.slice(m[0].length) }
  }
  if ((m = s.match(/^毎年/))) return { repeat: repeatOf('yearly', 1), rest: s.slice(m[0].length) }
  if ((m = s.match(/^(\d{1,3})(日|週間?|[かカヵヶケ]月)(?:ごと|毎)/)) || (m = s.match(/^(\d{1,3})(年)(?:ごと|毎)/))) {
    const interval = Number(m[1])
    const type = JA_REPEAT_UNITS.find(([re]) => re.test(m![2]!))?.[1]
    if (!type || interval < 1) return null
    return { repeat: repeatOf(type, interval), rest: s.slice(m[0].length) }
  }
  return null
}

const EN_REPEAT_UNITS: Record<string, Recurrence['type']> = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }
const EN_WEEKDAY_WORD = /^(sun|mon|tue|wed|thu|fri|sat)(?:day|s|nesday|sday|rsday|r|rs|urday)?$/

/**
 * 「every」の後ろの語を読む（every day / every week / every fri / every other week / every 2 weeks / every 3days）。
 * `used` は every の後ろで使った語の数。読めなければ null（every はタイトルに残す）
 */
function readEnRepeat(next: string[]): { repeat: QuickAddRepeat; used: number } | null {
  const unit = (w: string | undefined) => {
    const m = w?.toLowerCase().match(/^(day|week|month|year)s?$/)
    return m ? EN_REPEAT_UNITS[m[1]!]! : null
  }
  const w0 = next[0]?.toLowerCase()
  if (!w0) return null
  let m: RegExpMatchArray | null
  const single = unit(w0)
  if (single) return { repeat: repeatOf(single, 1), used: 1 }
  if ((m = w0.match(EN_WEEKDAY_WORD))) {
    return { repeat: repeatOf('weekly', 1, EN_WEEKDAYS.indexOf(m[1]!)), used: 1 }
  }
  if ((m = w0.match(/^(\d{1,3})(days?|weeks?|months?|years?)$/)) && Number(m[1]) >= 1) {
    return { repeat: repeatOf(unit(m[2])!, Number(m[1])), used: 1 }
  }
  const second = unit(next[1])
  if (second && w0 === 'other') return { repeat: repeatOf(second, 2), used: 2 }
  if (second && /^\d{1,3}$/.test(w0) && Number(w0) >= 1) return { repeat: repeatOf(second, Number(w0)), used: 2 }
  return null
}

type Piece =
  | { kind: 'repeat'; repeat: QuickAddRepeat }
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
  // 繰り返しを先に読む（「毎週月曜」を月曜の日付として読まない）
  const repeat = localeJa ? readJaRepeat(s) : null
  if (repeat) return { piece: { kind: 'repeat', repeat: repeat.repeat }, rest: repeat.rest }

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
    const d = fromDateKey(m[0])
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
 * クイック追加の入力から #タグ・日付・時刻・長さ・繰り返しを取り出す。
 * 日時表現は空白で区切られた語として書く（例: 「明日15時 企画会議 1時間 #仕事」「mtg fri 3pm-4pm」）。
 * 日付は「やる日」。締切にしたいときは「明日まで 課題」「essay by fri」と書く。
 * 繰り返しは「毎日」「毎週金」「毎月15日」「every fri」「every 2 weeks」（最初の回の決め方は `quickAddTask.ts`）
 */
export function parseQuickAddTitle(
  raw: string,
  localeJa: boolean,
  /** 「今日」「明日」の基準の日（夜中はまだ前の日。`appToday`） */
  now: Date = appToday(),
  /** リストを選べない欄（サブタスク）なら `@…` も題名のまま残す */
  opts: { lists?: boolean } = {},
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
  let repeat: QuickAddRepeat | null = null
  /** 長さだけの語は、時刻が無ければタイトルに戻すので位置を覚えておく */
  const titleParts: { text: string; durationOnly: boolean }[] = []

  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
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
    // 英語の繰り返し（every fri / every 2 weeks）。表示言語を問わず読む
    if (/^every$/i.test(token)) {
      const r = readEnRepeat(tokens.slice(i + 1, i + 3))
      if (r) {
        repeat = r.repeat
        i += r.used
        continue
      }
    }
    if (opts.lists !== false && (token.startsWith('@') || token.startsWith('＠')) && token.length > 1) {
      listName = token.slice(1).trim()
      continue
    }
    if (token.startsWith('#') && token.length > 1) {
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
      if (p.kind === 'repeat') repeat = p.repeat
      else if (p.kind === 'date') date = p.date
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
    date: date ? toDateKey(date) : null,
    // 繰り返しの「毎週金曜まで」は日付が無くても締切（最初の回の日は繰り返しから決める）
    dateIsDeadline: deadline && (date != null || repeat != null),
    tags,
    startTime: start != null ? hm(start) : null,
    endTime: end != null ? hm(end) : null,
    listName,
    repeat,
  }
}
