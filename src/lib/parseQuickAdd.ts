import { addDays, isValid, startOfDay, startOfWeek } from 'date-fns'
import { appToday } from './timeZone'
import { fromDateKey, toDateKey } from './dateKey'
import { pad2 } from './clockTime'
import type { Recurrence } from '../types/task'

/**
 * 「毎日」「毎週金」「毎週月水」「平日」「毎月15日」「every 2 weeks」で書いた繰り返し。
 * 曜日・日は最初の回の日を決めるのに使う。曜日が 2 つ以上なら繰り返しにも曜日を持たせる（`quickAddTask.ts`）
 */
export type QuickAddRepeat = Pick<Recurrence, 'type' | 'interval'> & {
  /** 「毎週金」「毎週月水」「平日」の曜日（1=月 … 7=日、月曜から順）。null は曜日の指定なし */
  weekdays: number[] | null
  /** 「毎月15日」の日。null は日の指定なし */
  monthDay: number | null
}

export type ParsedQuickAdd = {
  title: string
  /** 日付キーワード（今日/明日/曜日/9/30 など） */
  date: string | null
  /** 「明日まで」「10/10 締切」「by fri」のように締切として書いたか。違えば「やる日」 */
  dateIsDeadline: boolean
  /** 締切の時刻（`HH:mm`）。「23:59まで」「10/10 23:59 締切」のように締切の印と時刻を書いたとき。このときは予定にしない */
  dueTime: string | null
  tags: string[]
  /** 時刻指定（`HH:mm`）。あれば予定としてタイムラインに置く（締切の時刻は `dueTime`） */
  startTime: string | null
  endTime: string | null
  /** `@買い物` のようなリスト指定（名前そのまま。解決は呼び出し側で） */
  listName: string | null
  /** 繰り返し（「毎日」「毎週金」「毎週月水」「平日」「every fri」など） */
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

const repeatOf = (
  type: Recurrence['type'],
  interval: number,
  weekdays: number[] | null = null,
  monthDay: number | null = null,
): QuickAddRepeat => ({
  type,
  interval,
  weekdays,
  monthDay,
})

/** 平日（月〜金） */
const WORKDAYS = [1, 2, 3, 4, 5]

/** 0=日 の曜日の番号の並び → 1=月 … 7=日、重複なし、月曜から順 */
const isoDays = (dows: number[]) => [...new Set(dows.map((d) => (d === 0 ? 7 : d)))].sort((a, b) => a - b)

/** 「月水」「月・水・金」「金曜」「月曜日・木曜日」 */
const JA_DAY = '[日月火水木金土](?:曜日?)?'
const JA_REPEAT_WEEKLY = new RegExp(`^(毎|隔)週(${JA_DAY}(?:[・、,]?${JA_DAY})*)?`)

/** 「3日ごと」「2週間ごと」「6か月ごと」の単位 */
const JA_REPEAT_UNITS: [RegExp, Recurrence['type']][] = [
  [/^日$/, 'daily'],
  [/^週間?$/, 'weekly'],
  [/^[かカヵヶケ]月$/, 'monthly'],
  [/^年$/, 'yearly'],
]

/** 先頭の繰り返しの語を読む（毎日 / 隔日 / 毎週 / 毎週金 / 毎週金曜 / 毎週月水 / 毎週月・水・金 / 隔週 / 平日 / 毎月 / 毎月15日 / 毎年 / 3日ごと / 2週間ごと） */
function readJaRepeat(s: string): { repeat: QuickAddRepeat; rest: string } | null {
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(毎|隔)日/))) return { repeat: repeatOf('daily', m[1] === '隔' ? 2 : 1), rest: s.slice(m[0].length) }
  if ((m = s.match(JA_REPEAT_WEEKLY))) {
    // 「曜日」の「日」を日曜と読まないよう先に落とす
    const days = m[2] ? isoDays([...m[2].replace(/曜日?/g, '').replace(/[・、,]/g, '')].map((c) => JA_WEEKDAYS.indexOf(c))) : null
    return { repeat: repeatOf('weekly', m[1] === '隔' ? 2 : 1, days), rest: s.slice(m[0].length) }
  }
  if ((m = s.match(/^毎?平日/))) return { repeat: repeatOf('weekly', 1, WORKDAYS), rest: s.slice(m[0].length) }
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

/** 「mon」「wed,」「mon/wed/fri」のように曜日だけでできた語なら、その曜日（0=日）。違えば null */
function readEnWeekdayWord(word: string): number[] | null {
  const parts = word.toLowerCase().split(/[,/&]/).filter(Boolean)
  if (parts.length === 0) return null
  const dows: number[] = []
  for (const p of parts) {
    const m = p.match(EN_WEEKDAY_WORD)
    if (!m) return null
    dows.push(EN_WEEKDAYS.indexOf(m[1]!))
  }
  return dows
}

/**
 * 「every」の後ろの語を読む（every day / every week / every fri / every mon wed / every mon, wed and fri /
 * every weekday / every other week / every 2 weeks / every 3days）。
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
  if (/^weekdays?$/.test(w0)) return { repeat: repeatOf('weekly', 1, WORKDAYS), used: 1 }
  // 曜日の語が続くあいだ読む（間の and / & は、後ろに曜日が続くときだけ）
  const dows: number[] = []
  let used = 0
  while (used < next.length) {
    const w = next[used]!
    const days = readEnWeekdayWord(w)
    if (days) {
      dows.push(...days)
      used++
      continue
    }
    if (dows.length > 0 && /^(and|&)$/i.test(w) && next[used + 1] && readEnWeekdayWord(next[used + 1]!)) {
      used++
      continue
    }
    break
  }
  if (dows.length > 0) return { repeat: repeatOf('weekly', 1, isoDays(dows)), used }
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
  /** 「今週中」「来週中」: 日付と締切の印をいっしょに書いたもの */
  | { kind: 'due'; date: Date }
  | { kind: 'time'; min: number }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'duration'; min: number }
  | { kind: 'deadline' }
  | { kind: 'filler' }

function clockMinutes(h: number, m: number, meridiem?: string): number | null {
  let hour = h
  if (meridiem === '午後' || meridiem === 'pm') hour = (h % 12) + 12
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

/** 締切の印。「まで」と同じに読む（前後どちらに書いてもよい） */
const DEADLINE_MARK = /^(?:までに?|締め?切り?|〆切り?|期限|提出):?/
/** 締切の印だけの語（「A社 ES 10/10 締切」の「締切」）。日時を書いたときだけ印として読み、無ければ題名に残す */
const DEADLINE_WORD = /^(?:までに?|締め?切り?|〆切り?|期限|提出):?$/

/** 日付の直後の曜日の書き添え「10/8(木)」の「(木)」は読み飛ばす */
const skipWeekdayNote = (rest: string) => rest.replace(/^\((?:[日月火水木金土](?:曜日?)?|sun|mon|tue|wed|thu|fri|sat)\)/i, '')

/** トークン先頭から 1 片だけ読む。読めなければ null */
function readPiece(s: string, today: Date, localeJa: boolean): { piece: Piece; rest: string } | null {
  // 繰り返しを先に読む（「毎週月曜」を月曜の日付として読まない）
  const repeat = localeJa ? readJaRepeat(s) : null
  if (repeat) return { piece: { kind: 'repeat', repeat: repeat.repeat }, rest: repeat.rest }

  const low = s.toLowerCase()
  const words: [string, number][] = [
    ['today', 0],
    ['tomorrow', 1],
    ['tmr', 1],
  ]
  if (localeJa) words.push(['明後日', 2], ['あさって', 2], ['明日', 1], ['あした', 1], ['今日', 0], ['きょう', 0])
  for (const [w, offset] of words) {
    if (low.startsWith(w)) return { piece: { kind: 'date', date: addDays(today, offset) }, rest: s.slice(w.length) }
  }

  let m: RegExpMatchArray | null
  // 今週中・今週まで → 今週の日曜が締切。来週中 → 来週の日曜（週は月曜はじまり。カレンダーと同じ）
  if (localeJa && (m = s.match(/^(今|来)週(?:中|いっぱい|(?=までに?))/))) {
    const sunday = addDays(startOfWeek(today, { weekStartsOn: 1 }), m[1] === '来' ? 13 : 6)
    return { piece: { kind: 'due', date: sunday }, rest: s.slice(m[0].length) }
  }
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
    if (isValid(d)) return { piece: { kind: 'date', date: startOfDay(d) }, rest: skipWeekdayNote(s.slice(m[0].length)) }
  }
  // 9/30, 10月3日（過ぎていれば来年）
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})(?![\d:])/)) || (localeJa && (m = s.match(/^(\d{1,2})月(\d{1,2})日/)))) {
    const month = Number(m[1]) - 1
    const day = Number(m[2])
    let d = new Date(today.getFullYear(), month, day)
    if (d.getMonth() !== month) return null
    if (d < today) d = new Date(today.getFullYear() + 1, month, day)
    return { piece: { kind: 'date', date: d }, rest: skipWeekdayNote(s.slice(m[0].length)) }
  }

  // 時刻、または範囲（15:00-16:30 / 15時〜16時半 / 17時から22時 / 3pm-4pm）
  const clock = readClock(s, localeJa)
  if (clock) {
    const sep = clock.rest.match(localeJa ? /^\s*(?:[-〜~–—]|から)\s*/ : /^\s*[-〜~–—]\s*/)
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

  // 締切の印（「明日まで」「金曜までに」「10/10締切」「締切:10/10」）
  if (localeJa && (m = s.match(DEADLINE_MARK))) return { piece: { kind: 'deadline' }, rest: s.slice(m[0].length) }
  // つなぎ語（「15時から1時間」「明日の」）
  if (localeJa && (m = s.match(/^(から|の|に)/))) return { piece: { kind: 'filler' }, rest: s.slice(m[0].length) }
  return null
}

type ReadToken = { pieces: Piece[]; tailAt: number | null }

/**
 * トークン全体が日時表現だけでできていればその片を返す（1 文字でも余れば null＝タイトルの一部）。
 * ただし時刻の直後の括弧書き「14:00–15:00(オンライン)」は題名に戻す（`tailAt` から後ろが題名）
 */
function readToken(token: string, today: Date, localeJa: boolean): ReadToken | null {
  const pieces: Piece[] = []
  let rest = token
  let tailAt: number | null = null
  while (rest.length > 0) {
    if (rest.startsWith('(') && pieces.some((p) => p.kind === 'time' || p.kind === 'range')) {
      tailAt = token.length - rest.length
      break
    }
    const r = readPiece(rest, today, localeJa)
    if (!r || r.rest.length === rest.length) return null
    pieces.push(r.piece)
    rest = r.rest
  }
  return pieces.every((p) => p.kind === 'filler' || p.kind === 'deadline') ? null : { pieces, tailAt }
}

/** 全角の数字・コロン・括弧などを半角にそろえる（NFKC）。題名は元の文字のまま返すので、元の位置（`at`）も覚えておく */
function normalizeWithMap(s: string): { text: string; at: number[] } {
  let text = ''
  const at: number[] = []
  let i = 0
  for (const ch of s) {
    const n = ch.normalize('NFKC')
    for (let k = 0; k < n.length; k++) at.push(i)
    text += n
    i += ch.length
  }
  at.push(s.length)
  return { text, at }
}

/** 素の数字の範囲「17-22」 */
const BARE_RANGE = /^(\d{1,2})[-~〜–—](\d{1,2})$/
/** 範囲の後ろの語がこれで始まれば、時刻ではなく量や番号（「2-3 ページ」「10-12 問」） */
const COUNT_AFTER =
  /^(?:ページ|頁|章|問|題|回|個|人|枚|冊|行|節|課|番|点|号|巻|話|p\.?$|pp\.?|pages?\b|ch(?:apters?)?\b|problems?\b|questions?\b|exercises?\b|lessons?\b|units?\b|slides?\b|%)/i
/** 範囲の前の語がこれで終われば、時刻ではなく番号（「教科書 10-12」「p. 17-20」「第 3-4」） */
const COUNT_BEFORE =
  /(?:第|ページ|頁|章|問|問題|問題集|教科書|テキスト|ドリル|範囲|課題|\bp\.?|\bpp\.?|\bpages?|\bch(?:apters?)?\.?|\bproblems?|\bquestions?|\bexercises?|\blessons?|\bunits?|\bno\.?|#)$/i

/**
 * 「バイト 17-22」の素の数字の範囲を時刻の範囲として読む（語として単独で書いたときだけ）。
 * 「2-3 ページ」「教科書 10-12」のような番号と取り違えないよう、前後の語と範囲のありそうさ
 * （6 時から始まり 24 時までに終わる 12 時間以内）を見る。読めなければ null
 */
function readBareRange(token: string, prev: string | undefined, next: string | undefined): Piece | null {
  const m = token.match(BARE_RANGE)
  if (!m) return null
  const start = Number(m[1])
  const end = Number(m[2])
  if (start < 6 || end <= start || end > 24 || end - start > 12) return null
  if (next && COUNT_AFTER.test(next.normalize('NFKC'))) return null
  if (prev && COUNT_BEFORE.test(prev.normalize('NFKC'))) return null
  // 24 時はその日の終わり（23:59）
  return { kind: 'range', start: start * 60, end: Math.min(end * 60, 24 * 60 - 1) }
}

/**
 * 題名にくっついた時刻の範囲「バイト17時〜22時」「バイト17:00-22:00」を分ける。返す `at` から後ろが範囲。
 * 範囲（「時」か「:」のある書き方。素の数字どうしは読まない）だけを読み、
 * 「第3-4章」「A1017:00」のように番号の続きに見えるもの（直前が数字・記号・「第」）は分けない
 */
function splitAttachedRange(text: string, today: Date, localeJa: boolean): { at: number; read: ReadToken } | null {
  for (let i = 1; i < text.length; i++) {
    const startsClock = /\d/.test(text[i]!) || (localeJa && /^午[前後]/.test(text.slice(i)))
    if (!startsClock) continue
    // 最初の数字（午前・午後）の位置でだけ試す。それより後ろの数字では分けない
    if (/[\d:/.#第-]/.test(text[i - 1]!)) return null
    const read = readToken(text.slice(i), today, localeJa)
    return read && read.pieces.length === 1 && read.pieces[0]!.kind === 'range' ? { at: i, read } : null
  }
  return null
}

/**
 * クイック追加の入力から #タグ・日付・時刻・長さ・繰り返しを取り出す。
 * 日時表現は空白で区切られた語として書く（例: 「明日15時 企画会議 1時間 #仕事」「mtg fri 3pm-4pm」）。
 * 時刻の範囲だけは題名にくっつけてもよい（「バイト17時〜22時」）。全角の数字・コロンも読む。
 * 日付は「やる日」。締切にしたいときは「明日まで 課題」「A社 ES 10/10 23:59 締切」「今週中 レポート」「essay by fri」と書く。
 * 締切の印と時刻を書いたら、時刻は締切の時刻（`dueTime`）で予定にはしない。
 * 繰り返しは「毎日」「毎週金」「毎週月水」「平日」「毎月15日」「every fri」「every mon wed」「every weekday」「every 2 weeks」
 * （最初の回の決め方は `quickAddTask.ts`）
 */
export function parseQuickAddTitle(
  raw: string,
  localeJa: boolean,
  /** 「今日」「明日」の基準の日（`appToday`） */
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
  let isRange = false
  let duration: number | null = null
  let repeat: QuickAddRepeat | null = null
  /**
   * 題名の語。日時の読み取りの結果で題名に戻すかが決まる語には印を付けておく
   * - duration: 長さだけの語。時刻が無ければ戻す
   * - deadlineWord: 「締切」「提出」だけの語。日時が無ければ戻す
   * - timeOnly: 時刻だけの語。予定にできなかった（23:59 で頭打ちになり長さが 0）なら戻す
   */
  const titleParts: { text: string; kind: 'title' | 'duration' | 'deadlineWord' | 'timeOnly' }[] = []

  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (pendingDeadlineWord !== null) {
      const word = pendingDeadlineWord
      pendingDeadlineWord = null
      const next = readToken(token.normalize('NFKC'), today, localeJa)
      if (next?.pieces.some((p) => p.kind === 'date' || p.kind === 'due')) deadline = true
      else titleParts.push({ text: word, kind: 'title' })
    }
    // 表示言語が日本語でも英語で書けるように、by / due は言語を問わず読む
    if (/^(by|due)$/i.test(token)) {
      pendingDeadlineWord = token
      continue
    }
    // 英語の繰り返し（every fri / every 2 weeks）。表示言語を問わず読む
    if (/^every$/i.test(token)) {
      const r = readEnRepeat(tokens.slice(i + 1, i + 9))
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
    const norm = normalizeWithMap(token)
    if (localeJa && DEADLINE_WORD.test(norm.text)) {
      titleParts.push({ text: token, kind: 'deadlineWord' })
      continue
    }
    const bare = readBareRange(norm.text, tokens[i - 1], tokens[i + 1])
    let found: ReadToken | null = bare ? { pieces: [bare], tailAt: null } : readToken(norm.text, today, localeJa)
    /** 語のうち題名に戻す前の部分（「バイト17時〜22時」の「バイト」。元の文字のまま） */
    let before = ''
    if (!found) {
      const split = splitAttachedRange(norm.text, today, localeJa)
      if (split) {
        found = { pieces: split.read.pieces, tailAt: split.read.tailAt == null ? null : split.at + split.read.tailAt }
        before = token.slice(0, norm.at[split.at])
      }
    }
    if (!found) {
      titleParts.push({ text: token, kind: 'title' })
      continue
    }
    const { pieces, tailAt } = found
    // 後ろの括弧書き（「(オンライン)」。元の文字のまま）
    const after = tailAt == null ? '' : token.slice(norm.at[tailAt])
    if (before || after) titleParts.push({ text: before + after, kind: 'title' })
    else if (pieces.every((p) => p.kind === 'duration' || p.kind === 'filler')) titleParts.push({ text: token, kind: 'duration' })
    else if (pieces.every((p) => p.kind === 'time' || p.kind === 'filler')) titleParts.push({ text: token, kind: 'timeOnly' })
    for (const p of pieces) {
      if (p.kind === 'repeat') repeat = p.repeat
      else if (p.kind === 'date') date = p.date
      else if (p.kind === 'due') {
        date = p.date
        deadline = true
      } else if (p.kind === 'time') {
        start = p.min
        end = null
        isRange = false
      } else if (p.kind === 'range') {
        start = p.start
        end = p.end
        isRange = true
      } else if (p.kind === 'duration') duration = p.min
      else if (p.kind === 'deadline') deadline = true
    }
  }
  if (pendingDeadlineWord !== null) titleParts.push({ text: pendingDeadlineWord, kind: 'title' })

  // 「締切」「提出」だけの語は、日時も書いたときだけ締切の印
  const deadlineWordUsed = titleParts.some((p) => p.kind === 'deadlineWord') && (date != null || repeat != null || start != null)
  if (deadlineWordUsed) deadline = true

  // 締切の印と時刻 → 締切の時刻（予定にはしない）。範囲なら終わりの時刻
  let dueTime: number | null = null
  if (deadline && start != null) {
    dueTime = isRange && end != null ? end : start
    start = null
    end = null
  }

  // 終わりが 23:59 で頭打ちになり長さが 0 なら予定にしない（時刻は題名に戻す）
  let timeDropped = false
  if (start != null && end == null) {
    end = Math.min(start + (duration ?? DEFAULT_BLOCK_MINUTES), 24 * 60 - 1)
    if (end <= start) {
      start = null
      end = null
      timeDropped = true
    }
  }

  const title =
    titleParts
      .filter(
        (p) =>
          p.kind === 'title' ||
          (p.kind === 'duration' && start == null) ||
          (p.kind === 'deadlineWord' && !deadlineWordUsed) ||
          (p.kind === 'timeOnly' && timeDropped),
      )
      .map((p) => p.text)
      .join(' ')
      .trim() || raw.trim()
  return {
    title,
    date: date ? toDateKey(date) : null,
    // 繰り返しの「毎週金曜まで」は日付が無くても締切（最初の回の日は繰り返しから決める）。「23:59まで」は時刻だけの締切
    dateIsDeadline: deadline && (date != null || repeat != null || dueTime != null),
    dueTime: dueTime != null ? hm(dueTime) : null,
    tags,
    startTime: start != null ? hm(start) : null,
    endTime: end != null ? hm(end) : null,
    listName,
    repeat,
  }
}
