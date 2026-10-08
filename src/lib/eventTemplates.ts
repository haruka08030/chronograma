import { isEventTask, type Task } from '../types/task'
import { toMinutes } from './clockTime'
import { settingSyncStep } from './settingSync'

/**
 * よく入れる予定（バイトのシフトの「早番 9:00–15:00」など、#311）。月表示で選んでから日を続けて押すと、その日に同じ予定が入る。
 * 入る予定はふつうの予定（`kind: 'event'`）と同じ。ラベルは予定と同じく色だけ（`color`、null はラベルなし）
 */
export type EventTemplate = {
  id: string
  title: string
  /** `HH:mm` */
  startTime: string
  /** `HH:mm`。開始より後（`00:00` はその日の終わりまで。予定は日をまたげない） */
  endTime: string
  color: string | null
}

/** 登録できる数 */
export const EVENT_TEMPLATE_MAX = 30
/** 名前の長さの上限（DB の大きさの上限に収まる長さ） */
export const EVENT_TEMPLATE_TITLE_MAX = 100

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const HEX = /^#[0-9A-Fa-f]{6}$/

/** 終わりが開始より後か（`00:00` 終わりはその日の終わりまで） */
export function isValidTemplateRange(startTime: string, endTime: string): boolean {
  if (!HHMM.test(startTime) || !HHMM.test(endTime)) return false
  return endTime === '00:00' || toMinutes(endTime)! > toMinutes(startTime)!
}

/**
 * 保存・同期・入力から読んだ値をそろえる。名前が空・時刻が使えない・id が重なる行は外し、数は上限まで。
 * 名前は前後の空白を落として上限で切る
 */
export function normalizeEventTemplates(raw: unknown): EventTemplate[] {
  if (!Array.isArray(raw)) return []
  const out: EventTemplate[] = []
  for (const item of raw) {
    const x = item as Partial<Record<keyof EventTemplate, unknown>> | null
    if (!x || typeof x.id !== 'string' || !x.id || out.some((t) => t.id === x.id)) continue
    const title = typeof x.title === 'string' ? x.title.trim().slice(0, EVENT_TEMPLATE_TITLE_MAX) : ''
    if (!title || typeof x.startTime !== 'string' || typeof x.endTime !== 'string') continue
    if (!isValidTemplateRange(x.startTime, x.endTime)) continue
    const color = typeof x.color === 'string' && HEX.test(x.color) ? x.color.toUpperCase() : null
    out.push({ id: x.id, title, startTime: x.startTime, endTime: x.endTime, color })
    if (out.length >= EVENT_TEMPLATE_MAX) break
  }
  return out
}

/**
 * その日に入っている、この「よく入れる予定」と同じ予定（名前・時刻が同じ、消していない予定）。
 * 月表示で日を押したとき、あれば外す・無ければ入れる
 */
export function templateEventOnDay(tasks: readonly Task[], template: EventTemplate, dateKey: string): Task | undefined {
  return tasks.find(
    (t) =>
      isEventTask(t) &&
      !t.deletedAt &&
      !t.archivedAt &&
      t.parentId === null &&
      t.scheduledDate === dateKey &&
      t.startTime === template.startTime &&
      t.endTime === template.endTime &&
      t.title.trim() === template.title,
  )
}

/** 「よく入れる予定」が入っている日（月表示で印を付ける） */
export function templateDays(tasks: readonly Task[], template: EventTemplate): Set<string> {
  const days = new Set<string>()
  for (const t of tasks) {
    if (t.scheduledDate && templateEventOnDay([t], template, t.scheduledDate)) days.add(t.scheduledDate)
  }
  return days
}

/** 「早番 9:00–15:00」の時刻の部分。`separator` は言語の時間の区切り（`common.timeRangeSeparator`） */
export function templateTimeLabel(template: Pick<EventTemplate, 'startTime' | 'endTime'>, separator = '–'): string {
  const short = (hm: string) => hm.replace(/^0(\d):/, '$1:')
  return `${short(template.startTime)}${separator}${short(template.endTime)}`
}

/**
 * よく入れる予定の同期。サーバーには利用者ごとに 1 行（`user_event_templates`、`022`）。並び全体を 1 つの値として扱う。
 * - どちらに合わせるかは `settingSync.ts`（サーバーの時計の版と、手元で変えたか）
 * - この端末でまだ一度も同期していない（変えた時刻・もとにした版が無い）ときは、両方を合わせる（サーバーの並びのあとに手元にしか無いもの。どちらの端末で登録したものも消さない）
 */
export type LocalEventTemplates = {
  templates: EventTemplate[]
  updatedAt: string | null
  /** 手元の並びのもとになったサーバーの版（`settingSync.ts`）。まだ無ければ null */
  syncedAt?: string | null
}
export type RemoteEventTemplates = { templates: EventTemplate[]; updatedAt: string }

export type EventTemplateSyncPlan = {
  apply?: { templates: EventTemplate[]; updatedAt: string }
  /** サーバーに送る。`base` はもとにしたサーバーの版（サーバーに行が無ければ null） */
  push?: RemoteEventTemplates & { base: string | null }
  /** 中身は同じ。手元の時刻ともとにした版をこのサーバーの版にそろえる */
  adopt?: string
}

const templateKey = (t: EventTemplate) => JSON.stringify([t.id, t.title, t.startTime, t.endTime, t.color])
export const sameEventTemplates = (a: readonly EventTemplate[], b: readonly EventTemplate[]) =>
  a.length === b.length && a.every((x, i) => templateKey(x) === templateKey(b[i]!))

export function planEventTemplateSync(
  local: LocalEventTemplates,
  remote: RemoteEventTemplates | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
): EventTemplateSyncPlan {
  if (!remote) return { push: { templates: local.templates, updatedAt: local.updatedAt ?? nowIso, base: null } }
  const remoteTemplates = normalizeEventTemplates(remote.templates)
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    sameEventTemplates(local.templates, remoteTemplates),
    clockOffsetMs,
  )
  // この端末でまだ一度も合わせていない（ログインする前に登録した・もとにした版が分からない）: 新しいほうに丸ごと合わせず両方を残す
  const neverSynced = (local.syncedAt ?? null) === null && (step.kind === 'push' || step.kind === 'apply')
  switch (neverSynced ? 'initial' : step.kind) {
    case 'initial': {
      // 初めて: サーバーの並びのあとに、手元にしか無いもの（同じ id はサーバーの中身）
      const templates = normalizeEventTemplates([...remoteTemplates, ...local.templates])
      if (sameEventTemplates(templates, remoteTemplates)) return { apply: { templates, updatedAt: remote.updatedAt } }
      return { apply: { templates, updatedAt: nowIso }, push: { templates, updatedAt: nowIso, base: remote.updatedAt } }
    }
    case 'apply':
      return { apply: { templates: remoteTemplates, updatedAt: remote.updatedAt } }
    case 'push':
      return { push: { templates: local.templates, updatedAt: local.updatedAt ?? nowIso, base: step.kind === 'push' ? step.base : null } }
    case 'adopt':
      return { adopt: remote.updatedAt }
    default:
      return {}
  }
}
