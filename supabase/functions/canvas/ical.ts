/**
 * Canvas のカレンダーフィード（.ics）から課題を読む。トークンを作れない学校向けの、読むだけの連携。
 * .ics を読む共通の部分（`readEvents` など）は Moodle の書き出し（`moodle.ts`）でも使う。
 *
 * Canvas の書き出し（app/models/calendar_event.rb の IcalEvent#to_ics）に合わせている:
 * - 課題は UID `event-assignment-<ID>`。期限を学生ごとに上書きした課題は `event-assignment-override-<ID>` で、
 *   件名に「（上書きの名前）」が付く。どちらも URL の `#assignment_<課題ID>` と `include_contexts=course_<ID>` は同じ
 * - 授業などの予定（`event-calendar-event-`）は締切ではないので読まない
 * - 件名は「課題名 [科目コード]」
 * - 締切は UTC の日時（`20261005T065900Z` / `TZID=UTC`）か、終日なら `VALUE=DATE` の日付
 */

export type FeedItem = {
  type: 'assignment'
  id: string
  title: string
  courseId: string | null
  courseName: string | null
  url: string
  /** 締切（ISO 日時）。終日の課題は null で、`dueDate` に日付 */
  dueAt: string | null
  dueDate?: string
  /**
   * タイムゾーン付き（`TZID=Asia/Tokyo`）や浮動（Z も TZID も無い）の締切。その壁時計のまま返し、瞬間にはクライアントが
   * アプリのタイムゾーンの道具（`instantFromWall`）で直す。`timeZone` が null（浮動）はアプリのタイムゾーンとして読む。Moodle のフィードだけ
   */
  dueWall?: { date: string; time: string; timeZone: string | null }
  done: false
}

export type Prop = { params: Record<string, string>; value: string }

/** 折り返し（改行 + 空白）を戻して 1 行 1 プロパティにする */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
}

function parseLine(line: string): [string, Prop] | null {
  const colon = line.indexOf(':')
  if (colon < 0) return null
  const [name, ...rawParams] = line.slice(0, colon).split(';')
  const params: Record<string, string> = {}
  for (const p of rawParams) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1)
  }
  return [name.toUpperCase(), { params, value: line.slice(colon + 1) }]
}

export function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .trim()
}

/** DTSTART を ISO 日時か日付に。Canvas は UTC で書くので、TZID が UTC 以外でも UTC として読む */
function parseDate(prop: Prop): { dueAt: string | null; dueDate?: string } | null {
  const v = prop.value.trim()
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (date || prop.params.VALUE === 'DATE') {
    if (!date) return null
    return { dueAt: null, dueDate: `${date[1]}-${date[2]}-${date[3]}` }
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(v)
  if (!dt) return null
  return { dueAt: `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6]}Z` }
}

/** VEVENT ごとのプロパティ（同じ名前は最初のもの） */
export function readEvents(text: string): Map<string, Prop>[] {
  const events: Map<string, Prop>[] = []
  let event: Map<string, Prop> | null = null
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      event = new Map()
      continue
    }
    if (line === 'END:VEVENT') {
      if (event) events.push(event)
      event = null
      continue
    }
    if (!event) continue
    const parsed = parseLine(line)
    if (parsed && !event.has(parsed[0])) event.set(parsed[0], parsed[1])
  }
  return events
}

/** 締切の日（UTC。壁時計・終日はその日付）。取り込む期間の判定に使う */
export function feedDueDay(item: { dueAt: string | null; dueDate?: string; dueWall?: { date: string } }): string | null {
  return item.dueDate ?? item.dueWall?.date ?? item.dueAt?.slice(0, 10) ?? null
}

/** 締切が `windowStart`〜`windowEnd`（`yyyy-MM-dd`）にある課題だけを、id ごとに 1 つ */
export function insideFeedWindow(items: (FeedItem | null)[], windowStart: string, windowEnd: string): FeedItem[] {
  const out = new Map<string, FeedItem>()
  for (const item of items) {
    const day = item ? feedDueDay(item) : null
    if (item && day && day >= windowStart && day <= windowEnd) out.set(item.id, item)
  }
  return [...out.values()]
}

/**
 * フィードの課題を返す。`windowStart`〜`windowEnd`（`yyyy-MM-dd`）に締切があるものだけ。
 * フィードには学期の初めからの課題が全部入るので、済んだかどうか分からない過去の課題は取り込まない。
 */
export function parseCanvasFeed(text: string, baseUrl: string, windowStart: string, windowEnd: string): FeedItem[] {
  return insideFeedWindow(
    readEvents(text).map((event) => toItem(event, baseUrl)),
    windowStart,
    windowEnd,
  )
}

function toItem(event: Map<string, Prop>, baseUrl: string): FeedItem | null {
  const uid = event.get('UID')?.value ?? ''
  if (!uid.startsWith('event-assignment-')) return null
  const link = event.get('URL')?.value.trim() ?? ''
  const assignmentId = /#assignment_(\d+)/.exec(link)?.[1] ?? /^event-assignment-(\d+)$/.exec(uid)?.[1]
  if (!assignmentId) return null
  const start = event.get('DTSTART')
  const due = start ? parseDate(start) : null
  if (!due) return null

  const summary = unescapeText(event.get('SUMMARY')?.value ?? '')
  // 末尾の「 [科目コード]」を科目名に回す
  const course = /^(.*?)\s*\[([^\]]+)\]$/.exec(summary)
  const courseId = /include_contexts=course_(\d+)/.exec(link)?.[1] ?? null
  return {
    type: 'assignment',
    id: assignmentId,
    title: course ? course[1] : summary,
    courseId,
    courseName: courseId ? (course?.[2] ?? null) : null,
    url: courseId ? `${baseUrl}/courses/${courseId}/assignments/${assignmentId}` : link || baseUrl,
    ...due,
    done: false,
  }
}
