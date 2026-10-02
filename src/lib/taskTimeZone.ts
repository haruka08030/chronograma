import type { Task } from '../types/task'
import { appTimeZone, convertWall } from './timeZone'

/**
 * タスク・記録ごとのタイムゾーン（Google カレンダーの予定の「タイムゾーン」と同じ）。
 *
 * 日付・時刻の列は、ほかのタスクと同じく常に「アプリのタイムゾーン」の壁時計で持つ（タイムラインや集計はそのまま使える）。
 * `timeZone` は入力したときのタイムゾーンで、詳細ではそのタイムゾーンの時刻で見せて編集する。
 * `timeZoneAnchor` は列がどのタイムゾーンで書かれているか（`timeZone` を決めていないタスクも持つ）。
 * アプリのタイムゾーンが変わったら（設定・端末の移動）、すべての予定・記録を `reanchorTask` でその瞬間のまま
 * 書き直す（Google カレンダーと同じ。東京 7 時のジムは、ニューヨークに切り替えると前日 18 時）。
 * 時刻の無い（日付だけの）タスクは動かない。
 */

export type TaskTimeFields = Pick<
  Task,
  'isTimeLog' | 'dueDate' | 'dueTime' | 'scheduledDate' | 'startTime' | 'endTime' | 'endDate'
>

const p2 = (n: number) => String(n).padStart(2, '0')

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + 1))
  return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`
}

/** 開始日＋開始〜終了の時刻を、別のタイムゾーンに。終了日は日をまたぐときだけ */
function convertRange(
  date: string,
  start: string,
  end: string | null | undefined,
  endDate: string | null | undefined,
  from: string,
  to: string,
): { date: string; start: string; end: string | null | undefined; endDate: string | null | undefined } {
  const s = convertWall(date, start, from, to)
  if (!end) return { date: s.date, start: s.time, end, endDate }
  const endDay = endDate ?? (end <= start ? nextDay(date) : date)
  const e = convertWall(endDay, end, from, to)
  return { date: s.date, start: s.time, end: e.time, endDate: e.date !== s.date ? e.date : null }
}

/** 日付・時刻の列を、あるタイムゾーンの壁時計から別のタイムゾーンの壁時計に書き直す */
export function convertTaskTimes<T extends TaskTimeFields>(fields: T, from: string, to: string): T {
  if (from === to) return fields
  const out = { ...fields }
  if (fields.isTimeLog) {
    if (fields.dueDate && fields.startTime) {
      const r = convertRange(fields.dueDate, fields.startTime, fields.endTime, fields.endDate, from, to)
      out.dueDate = r.date
      out.startTime = r.start
      out.endTime = r.end ?? null
      out.endDate = r.endDate ?? null
    }
    return out
  }
  if (fields.scheduledDate && fields.startTime) {
    const r = convertRange(fields.scheduledDate, fields.startTime, fields.endTime, fields.endDate, from, to)
    out.scheduledDate = r.date
    out.startTime = r.start
    out.endTime = r.end ?? null
    out.endDate = r.endDate ?? null
  }
  if (fields.dueDate && fields.dueTime) {
    const d = convertWall(fields.dueDate, fields.dueTime, from, to)
    out.dueDate = d.date
    out.dueTime = d.time
  }
  return out
}

/** アプリと違うタイムゾーンで入れたタスクなら、そのタイムゾーン */
export function foreignTimeZone(task: Pick<Task, 'timeZone'>): string | null {
  return task.timeZone && task.timeZone !== appTimeZone() ? task.timeZone : null
}

/**
 * 列が今のアプリのタイムゾーンで書かれていなければ書き直す（瞬間は変えない）。直す必要が無ければ同じオブジェクト。
 * 同期の行き違いを生まないよう `updatedAt` は変えない（どの端末でも読み込んだ側で直す）
 */
export function reanchorTask(task: Task, zone: string = appTimeZone()): Task {
  // 書いたタイムゾーンが分からない（この仕組みの前に作った）ものは、いまのタイムゾーンで書いたとみなす
  if (!task.timeZoneAnchor) return { ...task, timeZoneAnchor: zone }
  if (task.timeZoneAnchor === zone) return task
  return { ...convertTaskTimes(task, task.timeZoneAnchor, zone), timeZoneAnchor: zone }
}

/** 必要なものだけ書き直す。何も変わらなければ同じ配列 */
export function reanchorTasks(tasks: Task[], zone: string = appTimeZone()): Task[] {
  let changed = false
  const next = tasks.map((t) => {
    const r = reanchorTask(t, zone)
    if (r !== t) changed = true
    return r
  })
  return changed ? next : tasks
}

const TIME_KEYS = ['dueDate', 'dueTime', 'scheduledDate', 'startTime', 'endTime', 'endDate'] as const
type TimePatch = Partial<Pick<Task, (typeof TIME_KEYS)[number]>>

/**
 * `zone` の時刻で見せている値（`view`）に `patch` を当て、アプリのタイムゾーンの列に戻した更新。
 * 見せているタイムゾーンを変えるとき（`zone` を新しいタイムゾーンにする）は数字はそのままで意味だけ変わる（Google と同じ）
 */
export function timesPatchFromZone(view: TaskTimeFields, patch: TimePatch, zone: string): TimePatch {
  const merged = { ...view, ...patch }
  // 予定には終了日の入力が無いので、日をまたぐかは時刻から決め直す（古い終了日を残すと 1 日ずれる）
  if (!view.isTimeLog && !('endDate' in patch)) merged.endDate = null
  const back = convertTaskTimes(merged, zone, appTimeZone())
  const out: TimePatch = {}
  for (const k of TIME_KEYS) {
    if (back[k] !== undefined) (out as Record<string, unknown>)[k] = back[k] ?? null
  }
  return out
}
