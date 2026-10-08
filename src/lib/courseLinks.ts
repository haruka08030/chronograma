import type { Task } from '../types/task'
import { parseCanvasTaskId } from './canvasIds'
import { settingSyncStep } from './settingSync'

/**
 * 授業の予定と、LMS（Canvas・Moodle）の科目のつながり（#309）。授業の予定を押したカードに、その科目の未完了の課題を締切順に出す。
 *
 * 科目は取り込んだ課題のタグ（`reconcileCanvasItems` が最初のタグに科目名を入れる）。予定と科目は次の順で決める（控えめに、取り違えない）:
 * 1. ユーザーが選んだつながり（予定の名前ごとに 1 つ。`course: ''` は「つながない」と選んだ）
 * 2. 予定の名前か、予定のラベル名が、科目のタグと同じ（全角半角・大文字小文字・空白の違いだけは同じに数える）
 * 部分一致・似た名前では決めない（「英語」と「英語 II」のように取り違えると、別の授業の課題が出る）。
 * 名前が違う学校が多いので、合わなければカードで一度選べば覚える（端末間で同期する。`user_course_links`、`024`）
 */
export type CourseLink = {
  /** 予定の名前（入力されたまま。比べるときは `courseKey`） */
  title: string
  /** 科目のタグ。'' は「つながない」 */
  course: string
}

/** 覚えておける数（DB の大きさの上限に収まる数） */
export const COURSE_LINK_MAX = 200
/** 名前の長さの上限 */
export const COURSE_LINK_TEXT_MAX = 100
/** カードに出す課題の数 */
export const COURSE_ASSIGNMENT_LIMIT = 3

/** 比べるための形（全角英数・半角カナの違い、大文字小文字、前後と続く空白の違いを無くす） */
export function courseKey(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** 保存・同期から読んだ値をそろえる。予定の名前が空・同じ名前が重なる行（先のもの）は外し、数は上限まで */
export function normalizeCourseLinks(raw: unknown): CourseLink[] {
  if (!Array.isArray(raw)) return []
  const out: CourseLink[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const x = item as Partial<Record<keyof CourseLink, unknown>> | null
    if (!x || typeof x.title !== 'string' || typeof x.course !== 'string') continue
    const title = x.title.trim().slice(0, COURSE_LINK_TEXT_MAX)
    const key = courseKey(title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ title, course: x.course.trim().slice(0, COURSE_LINK_TEXT_MAX) })
    if (out.length >= COURSE_LINK_MAX) break
  }
  return out
}

/** 予定の名前のつながりを置き換えた並び（同じ名前の古いつながりは外し、新しいものを先頭に。上限を超えたら古いものから落とす） */
export function withCourseLink(links: readonly CourseLink[], title: string, course: string): CourseLink[] {
  const key = courseKey(title)
  if (!key) return [...links]
  return normalizeCourseLinks([{ title, course }, ...links.filter((l) => courseKey(l.title) !== key)])
}

/** LMS から取り込んだ課題か（id が `canvas-<学校>-<種類>-<ID>`。Moodle の課題も同じ形） */
const isLmsTask = (t: Task) => parseCanvasTaskId(t.id) !== null

/** 取り込んだ課題の科目（最初のタグ）。名前順 */
export function lmsCourses(tasks: readonly Task[]): string[] {
  const out = new Map<string, string>()
  for (const t of tasks) {
    if (t.deletedAt || !isLmsTask(t)) continue
    const course = t.tags[0]?.trim()
    if (course && !out.has(courseKey(course))) out.set(courseKey(course), course)
  }
  return [...out.values()].sort((a, b) => a.localeCompare(b))
}

export type EventCourse = {
  /** 科目のタグ。null はつながる科目が無い（「つながない」と選んだときも） */
  course: string | null
  /** ユーザーが選んだつながりで決まった（「つながない」も含む） */
  chosen: boolean
}

/**
 * 予定に対応する科目。`labelName` は予定のラベル名（時間割で科目名のラベルを選んだ予定）。
 * 選んだつながりの科目が今の取り込みに無くても、そのまま返す（課題が無いだけ。次の学期に同じ名前が戻ることもある）
 */
export function eventCourse(
  event: { title: string; labelName?: string | null },
  links: readonly CourseLink[],
  courses: readonly string[],
): EventCourse {
  const key = courseKey(event.title)
  const link = key ? links.find((l) => courseKey(l.title) === key) : undefined
  if (link) return { course: link.course || null, chosen: true }
  const byKey = new Map(courses.map((c) => [courseKey(c), c]))
  const found = (key && byKey.get(key)) || (event.labelName ? byKey.get(courseKey(event.labelName)) : undefined)
  return { course: found ?? null, chosen: false }
}

/** 締切の並びの鍵（締切なしは最後。時刻なしはその日の終わり） */
const dueSortKey = (t: Task) => (t.dueDate ? `${t.dueDate} ${t.dueTime ?? '24:00'}` : '9999')

/** その科目の未完了の課題（締切が早い順。同じなら名前順） */
export function courseAssignments(tasks: readonly Task[], course: string): Task[] {
  const key = courseKey(course)
  return tasks
    .filter(
      (t) =>
        !t.completed &&
        !t.deletedAt &&
        !t.archivedAt &&
        t.parentId === null &&
        isLmsTask(t) &&
        t.tags.some((tag) => courseKey(tag) === key),
    )
    .sort((a, b) => dueSortKey(a).localeCompare(dueSortKey(b)) || a.title.localeCompare(b.title))
}

/**
 * つながりの同期。サーバーには利用者ごとに 1 行（`user_course_links`、`024`）。並び全体を 1 つの値として扱う（よく入れる予定と同じ合わせ方）。
 * この端末でまだ一度も同期していなければ両方を合わせる（同じ名前はサーバーのつながり）
 */
export type LocalCourseLinks = {
  links: CourseLink[]
  updatedAt: string | null
  /** 手元の並びのもとになったサーバーの版（`settingSync.ts`）。まだ無ければ null */
  syncedAt?: string | null
}
export type RemoteCourseLinks = { links: CourseLink[]; updatedAt: string }

export type CourseLinkSyncPlan = {
  apply?: { links: CourseLink[]; updatedAt: string }
  /** サーバーに送る。`base` はもとにしたサーバーの版（サーバーに行が無ければ null） */
  push?: RemoteCourseLinks & { base: string | null }
  /** 中身は同じ。手元の時刻ともとにした版をこのサーバーの版にそろえる */
  adopt?: string
}

export const sameCourseLinks = (a: readonly CourseLink[], b: readonly CourseLink[]) =>
  a.length === b.length && a.every((x, i) => x.title === b[i]!.title && x.course === b[i]!.course)

export function planCourseLinkSync(
  local: LocalCourseLinks,
  remote: RemoteCourseLinks | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
): CourseLinkSyncPlan {
  if (!remote) return { push: { links: local.links, updatedAt: local.updatedAt ?? nowIso, base: null } }
  const remoteLinks = normalizeCourseLinks(remote.links)
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    sameCourseLinks(local.links, remoteLinks),
    clockOffsetMs,
  )
  const neverSynced = (local.syncedAt ?? null) === null && (step.kind === 'push' || step.kind === 'apply')
  switch (neverSynced ? 'initial' : step.kind) {
    case 'initial': {
      const links = normalizeCourseLinks([...remoteLinks, ...local.links])
      if (sameCourseLinks(links, remoteLinks)) return { apply: { links, updatedAt: remote.updatedAt } }
      return { apply: { links, updatedAt: nowIso }, push: { links, updatedAt: nowIso, base: remote.updatedAt } }
    }
    case 'apply':
      return { apply: { links: remoteLinks, updatedAt: remote.updatedAt } }
    case 'push':
      return { push: { links: local.links, updatedAt: local.updatedAt ?? nowIso, base: step.kind === 'push' ? step.base : null } }
    case 'adopt':
      return { adopt: remote.updatedAt }
    default:
      return {}
  }
}
