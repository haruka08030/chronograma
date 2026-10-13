import { parseBaseUrl } from './host.ts'

/**
 * 読むだけでつなぐカレンダーの URL の形。サーバー（つなぐとき・読むとき）と設定画面（貼った URL の案内）で同じ判定を使う。
 * - Canvas のカレンダーフィード: `https://<学校>/feeds/calendars/user_….ics`
 * - Moodle のカレンダーの書き出し: `https://<学校>[/moodle]/calendar/export_execute.php?userid=…&authtoken=…`
 *   （「カレンダー → カレンダーをエクスポート → カレンダー URL を取得」で出る URL。Moodle がサブパスに置かれている学校もある）
 * 宛先は https の公開の名前だけ（`parseBaseUrl`）。それ以外の形の URL は読まない
 */
export type FeedLms = 'canvas' | 'moodle'

const CANVAS_FEED_PATH = /^\/feeds\/calendars\/[\w.-]+\.ics$/
const MOODLE_EXPORT_PATH = /^((?:\/[\w.~-]+)*)\/calendar\/export_execute\.php$/
/** 書き出しの URL ではなく、その手前の画面（カレンダー・書き出しの設定画面） */
const MOODLE_PAGE_PATH = /\/calendar\/(export|view|managesubscriptions)\.php$/

function toUrl(input: string): URL | null {
  const raw = input.trim()
  if (!raw) return null
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
}

export type FeedUrl = {
  lms: FeedLms
  /** 学校の origin（接続の id はこのホスト名） */
  baseUrl: string
  /** 読みに行く URL。Moodle は `userid`・`authtoken` だけを残し、範囲は「すべての予定・最近と今後」に決める */
  feedUrl: string
  /** 課題へのリンクの頭（Moodle はサブパスまで） */
  root: string
}

/**
 * 貼られた URL を、読みに行く形にそろえる。形が違えば null。
 * Moodle の範囲を「今週」などのまま読むと、期間の中なのに返ってこない課題を「消えた」と見て完了にしてしまうので、
 * 範囲は書き換える（`authtoken` は利用者とサイトだけで決まり、範囲には関わらない）
 */
export function parseFeedUrl(input: string): FeedUrl | null {
  const baseUrl = parseBaseUrl(input)
  const url = toUrl(input)
  if (!baseUrl || !url) return null
  if (CANVAS_FEED_PATH.test(url.pathname)) return { lms: 'canvas', baseUrl, feedUrl: `${baseUrl}${url.pathname}`, root: baseUrl }
  const moodle = MOODLE_EXPORT_PATH.exec(url.pathname)
  if (!moodle) return null
  const userId = url.searchParams.get('userid') ?? ''
  const token = url.searchParams.get('authtoken') ?? ''
  if (!/^\d+$/.test(userId) || !/^[0-9A-Za-z]+$/.test(token)) return null
  const query = new URLSearchParams({ userid: userId, authtoken: token, preset_what: 'all', preset_time: 'recentupcoming' })
  return { lms: 'moodle', baseUrl, feedUrl: `${baseUrl}${url.pathname}?${query}`, root: `${baseUrl}${moodle[1]}` }
}

/**
 * 貼った URL が読めない形なら、その理由（設定画面の案内）。空なら null。
 * カレンダーの画面そのもの（Canvas の `/calendar#…`・Moodle の `calendar/export.php`）を貼る間違いが多いので、分けて案内する
 */
export function feedUrlProblem(input: string): 'calendarPage' | 'moodlePage' | 'notFeed' | null {
  if (!input.trim()) return null
  if (parseFeedUrl(input)) return null
  const url = toUrl(input)
  if (!url) return 'notFeed'
  if (MOODLE_PAGE_PATH.test(url.pathname) || MOODLE_EXPORT_PATH.test(url.pathname)) return 'moodlePage'
  return url.pathname.startsWith('/calendar') ? 'calendarPage' : 'notFeed'
}
