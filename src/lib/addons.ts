import { isEventTask, type Task } from '../types/task'
import { normalizeDues, type DueItem } from './dues'
import { googleSkipKey, normalizeGoogleSkip } from './googleSkip'
import { normalizeAbsenceCourses } from './absenceCourses'
import { courseKey } from './courseLinks'
import { merge3, merge3ById, merge3Record, merge3Set, type Side } from './settingMerge'

/**
 * 追加機能（#453）。生活まわりの機能（学校・引き落とし …）は使う人だけがオンにし、オフの機能は普段の画面に出さない。
 * オン・オフは「追加機能」の画面でし、端末間で同期する（`user_addons`、`041`）。
 * 学校は時間割と授業の欠席をまとめたもの（#617。前は「時間割」と「学校」の 2 つ）
 */
export type AddonId = 'school' | 'dues'

/** 追加機能の画面に並べる順 */
export const ADDON_IDS: readonly AddonId[] = ['school', 'dues']

/** 学校にまとめる前の時間割のオン・オフ（前の版のアプリが書いたもの。読むときに学校へ移す） */
const LEGACY_TIMETABLE = 'timetable'

export type Addons = {
  /** 決めた機能だけ。無い機能は既定（`isAddonOn`） */
  enabled: Partial<Record<AddonId, boolean>>
  /** 引き落とし・期限の日（#454、`lib/dues.ts`） */
  dues: DueItem[]
  /** Google カレンダーに送らない予定の名前（#461、`lib/googleSkip.ts`） */
  googleSkip: string[]
  /** 授業の欠席の一覧に並べる授業の名前（#503、`lib/absenceCourses.ts`。休んだ日・休める回数は時間割の設定） */
  absenceCourses: string[]
}

export const DEFAULT_ADDONS: Addons = { enabled: {}, dues: [], googleSkip: [], absenceCourses: [] }

const isAddonId = (v: string): v is AddonId => (ADDON_IDS as readonly string[]).includes(v)

/**
 * 保存・同期から読んだ値をそろえる。知らない機能は落とすが、知らない項目（後の版で足すもの）は残す
 * （前の版のアプリが送り直しても、後の版の中身を消さない）
 */
export function normalizeAddons(raw: unknown): Addons {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { enabled: {}, dues: [], googleSkip: [], absenceCourses: [] }
  const x = raw as Record<string, unknown>
  const enabled: Addons['enabled'] = {}
  if (x.enabled && typeof x.enabled === 'object' && !Array.isArray(x.enabled)) {
    const raw = x.enabled as Record<string, unknown>
    for (const [id, on] of Object.entries(raw)) {
      if (isAddonId(id) && typeof on === 'boolean') enabled[id] = on
    }
    // 時間割と学校のどちらかをオンにしていたら学校はオン（#617）
    const legacy = raw[LEGACY_TIMETABLE]
    if (typeof legacy === 'boolean') enabled.school = legacy || enabled.school === true
  }
  return {
    ...x,
    enabled,
    dues: normalizeDues(x.dues),
    googleSkip: normalizeGoogleSkip(x.googleSkip),
    absenceCourses: normalizeAbsenceCourses(x.absenceCourses),
  }
}

/** 時間割の授業を入れているか（毎週の予定がある。時間割が追加機能になる前から使っていた人はオンのまま） */
export const hasWeeklyEvents = (tasks: readonly Task[]) => tasks.some((t) => isEventTask(t) && !!t.series && !t.deletedAt)

/** その機能がオンか。決めていなければ既定（学校は、毎週の予定があればオン・無ければオフ） */
export function isAddonOn(addons: Addons, id: AddonId, tasks: readonly Task[]): boolean {
  const set = addons.enabled[id]
  if (set !== undefined) return set
  return id === 'school' ? hasWeeklyEvents(tasks) : false
}

/** オン・オフを決めた値 */
export function withAddonOn(addons: Addons, id: AddonId, on: boolean): Addons {
  return { ...addons, enabled: { ...addons.enabled, [id]: on } }
}

/**
 * 追加機能の設定の同期。サーバーには利用者ごとに 1 行（`user_addons`）。時間割の設定と同じく、片方だけが変えていればその側、
 * 一度も変えていなければ送らず、この端末でまだ合わせていなければサーバーのものに。
 * 両方の端末で前回合わせた後に変えていたら、中身ごとに合わせる（`mergeAddons`）
 */
export type LocalAddons = { addons: Addons; updatedAt: string | null; syncedAt?: string | null }
export type RemoteAddons = { addons: Addons; updatedAt: string }
export type AddonsSyncPlan = {
  apply?: { addons: Addons; updatedAt: string }
  push?: RemoteAddons & { base: string | null }
  adopt?: string
  /** 中身ごとに合わせたとき、両方が別の値に変えて新しいほうにした数 */
  conflicts?: number
}

/**
 * 両方の端末で変えた追加機能の設定を中身ごとに合わせる（`base` は前回合わせた版。無ければ両方にあるものを残す）。
 * オン・オフは機能ごと、引き落とし・期限は id ごと、Google に送らない名前・欠席の一覧の授業は名前の集合。
 * 両方が別の値に変えたものだけ `prefer` の側（新しいほう）。知らない項目（後の版で足すもの）は `prefer` の側のまま
 */
export function mergeAddons(base: Addons | null, l: Addons, r: Addons, prefer: Side, onConflict?: () => void): Addons {
  const [first, second] = prefer === 'l' ? [l, r] : [r, l]
  const extra: Record<string, unknown> = { ...second, ...first }
  for (const k of Object.keys(extra)) {
    if (k === 'enabled' || k === 'dues' || k === 'googleSkip' || k === 'absenceCourses') continue
    const bx = base as Record<string, unknown> | null
    extra[k] = merge3(bx?.[k], (l as Record<string, unknown>)[k], (r as Record<string, unknown>)[k], prefer)
  }
  return normalizeAddons({
    ...extra,
    enabled: merge3Record(base?.enabled ?? null, l.enabled, r.enabled, prefer, onConflict),
    dues: merge3ById(base?.dues ?? null, l.dues, r.dues, (d) => d.id, prefer, onConflict),
    googleSkip: merge3Set(base?.googleSkip ?? null, l.googleSkip, r.googleSkip, prefer, googleSkipKey),
    absenceCourses: merge3Set(base?.absenceCourses ?? null, l.absenceCourses, r.absenceCourses, prefer, courseKey),
  })
}
