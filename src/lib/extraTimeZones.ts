import { MAX_EXTRA_TIME_ZONES } from '../store/storeConstants'
import { isValidTimeZone, zoneOptionLabel } from './timeZone'
import { settingSyncStep } from './settingSync'

/**
 * 時間バーに並べる他のタイムゾーン（Google カレンダーの「他のタイムゾーンを表示」）。
 * `label` は利用者が付けた名前（例: 実家・ロンドンの友達）。空なら付けていない
 */
export type ExtraTimeZone = { tz: string; label: string }

/** 名前の長さの上限（時間バーでは切って出し、全体はヒントで見せる） */
export const EXTRA_TIME_ZONE_LABEL_MAX = 40

/**
 * 保存・同期・入力から読んだ値をそろえる。古い保存は文字列の配列（名前なし）。
 * 使えないタイムゾーン・重複は外し、数は上限まで。名前は前後の空白を落として上限で切る
 */
export function normalizeExtraTimeZones(raw: unknown): ExtraTimeZone[] {
  if (!Array.isArray(raw)) return []
  const out: ExtraTimeZone[] = []
  for (const item of raw) {
    const x = typeof item === 'string' ? { tz: item, label: '' } : (item as { tz?: unknown; label?: unknown } | null)
    if (!x || typeof x.tz !== 'string' || !isValidTimeZone(x.tz) || out.some((z) => z.tz === x.tz)) continue
    const label = typeof x.label === 'string' ? x.label.trim().slice(0, EXTRA_TIME_ZONE_LABEL_MAX) : ''
    out.push({ tz: x.tz, label })
    if (out.length >= MAX_EXTRA_TIME_ZONES) break
  }
  return out
}

/** ヒントに出す全体（名前を付けていれば、名前とタイムゾーンの両方） */
export function extraZoneFullLabel(zone: ExtraTimeZone, locale?: string, at: number = Date.now()): string {
  const option = zoneOptionLabel(zone.tz, locale, at)
  return zone.label ? `${zone.label} · ${option}` : option
}

/**
 * 他のタイムゾーンの同期。サーバーには利用者ごとに 1 行（`user_extra_time_zones`）。並びと名前をまとめて 1 つの値として扱う。
 * - どちらに合わせるかは `settingSync.ts`（サーバーの時計の版と、手元で変えたか）
 * - この端末でまだ一度も同期していない（変えた時刻が無い）ときは、両方を合わせる（どちらの端末のタイムゾーンも消さない）
 */
export type LocalExtraTimeZones = {
  zones: ExtraTimeZone[]
  updatedAt: string | null
  /** 手元の並びのもとになったサーバーの版（`settingSync.ts`）。まだ無ければ null */
  syncedAt?: string | null
}
export type RemoteExtraTimeZones = { zones: ExtraTimeZone[]; updatedAt: string }

export type ExtraTimeZoneSyncPlan = {
  apply?: { zones: ExtraTimeZone[]; updatedAt: string }
  /** サーバーに送る。`base` はもとにしたサーバーの版（サーバーに行が無ければ null） */
  push?: RemoteExtraTimeZones & { base: string | null }
  /** 中身は同じ。手元の時刻ともとにした版をこのサーバーの版にそろえる */
  adopt?: string
}

const sameZones = (a: readonly ExtraTimeZone[], b: readonly ExtraTimeZone[]) =>
  a.length === b.length && a.every((x, i) => x.tz === b[i].tz && x.label === b[i].label)

export function planExtraTimeZoneSync(
  local: LocalExtraTimeZones,
  remote: RemoteExtraTimeZones | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
): ExtraTimeZoneSyncPlan {
  if (!remote) return { push: { zones: local.zones, updatedAt: local.updatedAt ?? nowIso, base: null } }
  const remoteZones = normalizeExtraTimeZones(remote.zones)
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    sameZones(local.zones, remoteZones),
    clockOffsetMs,
  )
  switch (step.kind) {
    case 'initial': {
      // 初めて: サーバーの並びのあとに、手元にしか無いタイムゾーンを足す。名前はサーバーに無ければ手元の名前
      const zones = normalizeExtraTimeZones([
        ...remoteZones.map((r) => ({ ...r, label: r.label || local.zones.find((l) => l.tz === r.tz)?.label || '' })),
        ...local.zones,
      ])
      if (sameZones(zones, remoteZones)) return { apply: { zones, updatedAt: remote.updatedAt } }
      return { apply: { zones, updatedAt: nowIso }, push: { zones, updatedAt: nowIso, base: remote.updatedAt } }
    }
    case 'apply':
      return { apply: { zones: remoteZones, updatedAt: remote.updatedAt } }
    case 'push':
      return { push: { zones: local.zones, updatedAt: local.updatedAt ?? nowIso, base: step.base } }
    case 'adopt':
      return { adopt: remote.updatedAt }
    default:
      return {}
  }
}
