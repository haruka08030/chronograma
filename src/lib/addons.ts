import { isEventTask, type Task } from '../types/task'
import { sameValue } from './sameValue'
import { settingSyncStep } from './settingSync'
import { normalizeDues, type DueItem } from './dues'
import { normalizeGoogleSkip } from './googleSkip'

/**
 * 追加機能（#453）。生活まわりの機能（時間割・欠席 …）は使う人だけがオンにし、オフの機能は普段の画面に出さない。
 * 「追加機能」の画面と設定のどちらからでもオン・オフでき、端末間で同期する（`user_addons`、`041`）
 */
export type AddonId = 'timetable' | 'dues'

/** 追加機能の画面・設定に並べる順 */
export const ADDON_IDS: readonly AddonId[] = ['timetable', 'dues']

export type Addons = {
  /** 決めた機能だけ。無い機能は既定（`isAddonOn`） */
  enabled: Partial<Record<AddonId, boolean>>
  /** 引き落とし・期限の日（#454、`lib/dues.ts`） */
  dues: DueItem[]
  /** Google カレンダーに送らない予定の名前（#461、`lib/googleSkip.ts`） */
  googleSkip: string[]
}

export const DEFAULT_ADDONS: Addons = { enabled: {}, dues: [], googleSkip: [] }

const isAddonId = (v: string): v is AddonId => (ADDON_IDS as readonly string[]).includes(v)

/**
 * 保存・同期から読んだ値をそろえる。知らない機能は落とすが、知らない項目（後の版で足すもの）は残す
 * （前の版のアプリが送り直しても、後の版の中身を消さない）
 */
export function normalizeAddons(raw: unknown): Addons {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { enabled: {}, dues: [], googleSkip: [] }
  const x = raw as Record<string, unknown>
  const enabled: Addons['enabled'] = {}
  if (x.enabled && typeof x.enabled === 'object' && !Array.isArray(x.enabled)) {
    for (const [id, on] of Object.entries(x.enabled as Record<string, unknown>)) {
      if (isAddonId(id) && typeof on === 'boolean') enabled[id] = on
    }
  }
  return { ...x, enabled, dues: normalizeDues(x.dues), googleSkip: normalizeGoogleSkip(x.googleSkip) }
}

/** 時間割の授業を入れているか（毎週の予定がある。時間割が追加機能になる前から使っていた人はオンのまま） */
export const hasWeeklyEvents = (tasks: readonly Task[]) => tasks.some((t) => isEventTask(t) && !!t.series && !t.deletedAt)

/** その機能がオンか。決めていなければ既定（時間割は、毎週の予定があればオン・無ければオフ） */
export function isAddonOn(addons: Addons, id: AddonId, tasks: readonly Task[]): boolean {
  const set = addons.enabled[id]
  if (set !== undefined) return set
  return id === 'timetable' ? hasWeeklyEvents(tasks) : false
}

/** オン・オフを決めた値 */
export function withAddonOn(addons: Addons, id: AddonId, on: boolean): Addons {
  return { ...addons, enabled: { ...addons.enabled, [id]: on } }
}

/**
 * 追加機能の設定の同期。サーバーには利用者ごとに 1 行（`user_addons`）。全体を 1 つの値として、手元とサーバーの新しいほうに合わせる
 * （時間割の設定と同じ。一度も変えていなければ送らず、この端末でまだ合わせていなければサーバーのものに）
 */
export type LocalAddons = { addons: Addons; updatedAt: string | null; syncedAt?: string | null }
export type RemoteAddons = { addons: Addons; updatedAt: string }
export type AddonsSyncPlan = {
  apply?: { addons: Addons; updatedAt: string }
  push?: RemoteAddons & { base: string | null }
  adopt?: string
}

export function planAddonsSync(
  local: LocalAddons,
  remote: RemoteAddons | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
): AddonsSyncPlan {
  if (!remote) {
    if (local.updatedAt === null) return {}
    return { push: { addons: local.addons, updatedAt: local.updatedAt, base: null } }
  }
  const remoteValue = normalizeAddons(remote.addons)
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    sameValue(local.addons, remoteValue),
    clockOffsetMs,
  )
  switch (step.kind) {
    case 'initial':
    case 'apply':
      return { apply: { addons: remoteValue, updatedAt: remote.updatedAt } }
    case 'push':
      return { push: { addons: local.addons, updatedAt: local.updatedAt ?? nowIso, base: step.base } }
    case 'adopt':
      return { adopt: remote.updatedAt }
    default:
      return {}
  }
}
