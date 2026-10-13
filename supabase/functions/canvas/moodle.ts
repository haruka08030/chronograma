import { insideFeedWindow, readEvents, unescapeText, type FeedItem, type Prop } from './ical.ts'

/**
 * Moodle のカレンダーの書き出し（`calendar/export_execute.php`）から課題の締切を読む。Canvas のフィードと同じ、読むだけの連携。
 *
 * Moodle の書き出し（calendar/export_execute.php）に合わせている:
 * - UID は `<予定の ID>@<サイト>`。課題の id はこの数字
 * - 科目の予定（課題・小テストの締切など）には CATEGORIES に科目の短い名前が入る。無いのは自分の予定・サイトの予定なので読まない
 * - 締切（課題の提出期限・小テストの終了）は長さ 0（DTEND が DTSTART と同じか、無い）。授業などの長さのある予定は締切ではないので読まない
 * - 古い Moodle は長さ 0 の予定を終日（`VALUE=DATE`）で書く。終日の締切として読む
 * - 日時はふつう UTC（`20261010T145900Z`）。`TZID=Asia/Tokyo` 付きや浮動（Z も TZID も無い）は壁時計のまま返し、クライアントが直す
 * - 書き出しには予定の種類が無い。「◯◯ 開始」「◯◯ opens」（小テストの開始など）は締切ではないので、件名で外す
 */

/** 締切ではない予定の件名（開始・受付開始。先生だけの「評定期限」も） */
const NOT_DEADLINE = /(\s(opens|is due to be graded)|\((submissions|assessment) opens?\)|開始|受付開始|オープン|評定期限)\s*$/i

/** UTC として読む TZID */
const UTC_ZONES = new Set(['UTC', 'ETC/UTC', 'GMT', 'ETC/GMT', 'Z'])

type MoodleDue = Pick<FeedItem, 'dueAt' | 'dueDate' | 'dueWall'>

function parseMoodleDate(prop: Prop): MoodleDue | null {
  const v = prop.value.trim()
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (date) return { dueAt: null, dueDate: `${date[1]}-${date[2]}-${date[3]}` }
  if (prop.params.VALUE === 'DATE') return null
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v)
  if (!dt) return null
  const [, y, mo, d, h, mi, s, z] = dt
  const zone = prop.params.TZID?.replace(/^"|"$/g, '').trim() ?? null
  if (z || (zone && UTC_ZONES.has(zone.toUpperCase()))) return { dueAt: `${y}-${mo}-${d}T${h}:${mi}:${s}Z` }
  return { dueAt: null, dueWall: { date: `${y}-${mo}-${d}`, time: `${h}:${mi}`, timeZone: zone || null } }
}

/** 長さ 0 の予定か（DTEND が無い・DTSTART と同じ。終日は 1 日ぶんまで） */
function isInstant(start: Prop, end: Prop | undefined): boolean {
  if (!end) return true
  const s = start.value.trim()
  const e = end.value.trim()
  if (s === e) return true
  // 古い Moodle の終日: DTSTART;VALUE=DATE:20261010 / DTEND;VALUE=DATE:20261011
  const sd = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  const ed = /^(\d{4})(\d{2})(\d{2})$/.exec(e)
  if (!sd || !ed) return false
  const days = (Date.UTC(+ed[1], +ed[2] - 1, +ed[3]) - Date.UTC(+sd[1], +sd[2] - 1, +sd[3])) / 86_400_000
  return days <= 1
}

/** 課題を開く URL。書き出しには課題のページが無いので、その日のカレンダーへ（日が分からなければ今後の予定） */
function eventUrl(root: string, event: Map<string, Prop>, due: MoodleDue): string {
  const own = event.get('URL')?.value.trim() ?? ''
  if (own.startsWith(`${root}/`)) return own
  if (due.dueAt) return `${root}/calendar/view.php?view=day&time=${Math.floor(Date.parse(due.dueAt) / 1000)}`
  return `${root}/calendar/view.php?view=upcoming`
}

function toItem(event: Map<string, Prop>, root: string): FeedItem | null {
  const id = /^(\d+)@/.exec(event.get('UID')?.value.trim() ?? '')?.[1]
  const course = unescapeText(event.get('CATEGORIES')?.value ?? '')
  const start = event.get('DTSTART')
  if (!id || !course || !start || !isInstant(start, event.get('DTEND'))) return null
  const title = unescapeText(event.get('SUMMARY')?.value ?? '')
  if (NOT_DEADLINE.test(title)) return null
  const due = parseMoodleDate(start)
  if (!due) return null
  return {
    type: 'assignment',
    id,
    title,
    courseId: null,
    courseName: course,
    url: eventUrl(root, event, due),
    ...due,
    done: false,
  }
}

/**
 * 書き出しの課題を返す。`windowStart`〜`windowEnd`（`yyyy-MM-dd`）に締切があるものだけ（Canvas のフィードと同じ）。
 * `root` は Moodle の置き場所（`https://<学校>` か、サブパスまで）
 */
export function parseMoodleFeed(text: string, root: string, windowStart: string, windowEnd: string): FeedItem[] {
  return insideFeedWindow(
    readEvents(text).map((event) => toItem(event, root)),
    windowStart,
    windowEnd,
  )
}
