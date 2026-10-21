/**
 * 設定ごとの同期の計画（送る・合わせる・版だけ進める）。追加機能・時間割・よく入れる予定・授業と科目のつながり・睡眠のタイマー。
 * 同期（`useSupabaseSync`）からだけ読む。起動時に読む値の形・そろえ方（`normalize*`）と中身ごとの合わせ方（`merge*`）は各設定のファイル
 */
import { settingSyncStep } from './settingSync'
import { bothChangedSince, merge3ById, mergedSettingPlan } from './settingMerge'
import { sameValue } from './sameValue'
import { mergeAddons, normalizeAddons, type AddonsSyncPlan, type LocalAddons, type RemoteAddons } from './addons'
import {
  mergeTimetables,
  normalizeTimetable,
  sameTimetable,
  type LocalTimetable,
  type RemoteTimetable,
  type TimetableSyncPlan,
} from './timetable'
import {
  normalizeEventTemplates,
  sameEventTemplates,
  type EventTemplateSyncPlan,
  type LocalEventTemplates,
  type RemoteEventTemplates,
} from './eventTemplates'
import {
  courseKey,
  normalizeCourseLinks,
  sameCourseLinks,
  type CourseLinkSyncPlan,
  type LocalCourseLinks,
  type RemoteCourseLinks,
} from './courseLinks'
import { normalizeSleepTimer, type LocalSleepTimer, type RemoteSleepTimer, type SleepTimerSyncPlan } from './sleepTimer'

export function planAddonsSync(
  local: LocalAddons,
  remote: RemoteAddons | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
  /** 前回合わせた版の中身の控え（`settingSync.ts` の `saveSettingBase`）。無ければ null */
  base: unknown = null,
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
  if (bothChangedSince(local, remote) && (step.kind === 'push' || step.kind === 'apply')) {
    let conflicts = 0
    const merged = mergeAddons(
      base ? normalizeAddons(base) : null,
      local.addons,
      remoteValue,
      step.kind === 'push' ? 'l' : 'r',
      () => conflicts++,
    )
    const p = mergedSettingPlan(merged, { value: remoteValue, updatedAt: remote.updatedAt }, sameValue, nowIso, conflicts)
    return {
      apply: { addons: p.apply.value, updatedAt: p.apply.updatedAt },
      ...(p.push ? { push: { addons: p.push.value, updatedAt: p.push.updatedAt, base: p.push.base } } : {}),
      conflicts,
    }
  }
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

export function planTimetableSync(
  local: LocalTimetable,
  remote: RemoteTimetable | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
  /** 前回合わせた版の中身の控え（`settingSync.ts` の `saveSettingBase`）。無ければ null */
  base: unknown = null,
): TimetableSyncPlan {
  if (!remote) {
    // 一度も変えていない既定の値は送らない（ほかの端末で決めた時間割を既定で上書きしない）
    if (local.updatedAt === null) return {}
    return { push: { timetable: local.timetable, updatedAt: local.updatedAt, base: null } }
  }
  const remoteValue = normalizeTimetable(remote.timetable)
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    sameTimetable(local.timetable, remoteValue),
    clockOffsetMs,
  )
  if (bothChangedSince(local, remote) && (step.kind === 'push' || step.kind === 'apply')) {
    let conflicts = 0
    const merged = mergeTimetables(
      base ? normalizeTimetable(base) : null,
      local.timetable,
      remoteValue,
      step.kind === 'push' ? 'l' : 'r',
      () => conflicts++,
    )
    const p = mergedSettingPlan(merged, { value: remoteValue, updatedAt: remote.updatedAt }, sameTimetable, nowIso, conflicts)
    return {
      apply: { timetable: p.apply.value, updatedAt: p.apply.updatedAt },
      ...(p.push ? { push: { timetable: p.push.value, updatedAt: p.push.updatedAt, base: p.push.base } } : {}),
      conflicts,
    }
  }
  switch (step.kind) {
    case 'initial':
    case 'apply':
      return { apply: { timetable: remoteValue, updatedAt: remote.updatedAt } }
    case 'push':
      return { push: { timetable: local.timetable, updatedAt: local.updatedAt ?? nowIso, base: step.base } }
    case 'adopt':
      return { adopt: remote.updatedAt }
    default:
      return {}
  }
}

export function planEventTemplateSync(
  local: LocalEventTemplates,
  remote: RemoteEventTemplates | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
  /** 前回合わせた版の中身の控え（`settingSync.ts` の `saveSettingBase`）。無ければ null */
  base: unknown = null,
): EventTemplateSyncPlan {
  if (!remote) return { push: { templates: local.templates, updatedAt: local.updatedAt ?? nowIso, base: null } }
  const remoteTemplates = normalizeEventTemplates(remote.templates)
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    sameEventTemplates(local.templates, remoteTemplates),
    clockOffsetMs,
  )
  // 両方の端末で前回合わせた後に変えた: 並びを丸ごと新しいほうにせず、id ごとに合わせる（2 台で別々に登録したものをどちらも残す）
  if (bothChangedSince(local, remote) && (step.kind === 'push' || step.kind === 'apply')) {
    let conflicts = 0
    const merged = normalizeEventTemplates(
      merge3ById(
        base ? normalizeEventTemplates(base) : null,
        local.templates,
        remoteTemplates,
        (t) => t.id,
        step.kind === 'push' ? 'l' : 'r',
        () => conflicts++,
      ),
    )
    const p = mergedSettingPlan(merged, { value: remoteTemplates, updatedAt: remote.updatedAt }, sameEventTemplates, nowIso, conflicts)
    return {
      apply: { templates: p.apply.value, updatedAt: p.apply.updatedAt },
      ...(p.push ? { push: { templates: p.push.value, updatedAt: p.push.updatedAt, base: p.push.base } } : {}),
      conflicts,
    }
  }
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

export function planCourseLinkSync(
  local: LocalCourseLinks,
  remote: RemoteCourseLinks | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
  /** 前回合わせた版の中身の控え（`settingSync.ts` の `saveSettingBase`）。無ければ null */
  base: unknown = null,
): CourseLinkSyncPlan {
  if (!remote) return { push: { links: local.links, updatedAt: local.updatedAt ?? nowIso, base: null } }
  const remoteLinks = normalizeCourseLinks(remote.links)
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    sameCourseLinks(local.links, remoteLinks),
    clockOffsetMs,
  )
  // 両方の端末で前回合わせた後に変えた: 予定の名前ごとに合わせる（2 台で別々の授業につないだものをどちらも残す）
  if (bothChangedSince(local, remote) && (step.kind === 'push' || step.kind === 'apply')) {
    let conflicts = 0
    const merged = normalizeCourseLinks(
      merge3ById(
        base ? normalizeCourseLinks(base) : null,
        local.links,
        remoteLinks,
        (l) => courseKey(l.title),
        step.kind === 'push' ? 'l' : 'r',
        () => conflicts++,
      ),
    )
    const p = mergedSettingPlan(merged, { value: remoteLinks, updatedAt: remote.updatedAt }, sameCourseLinks, nowIso, conflicts)
    return {
      apply: { links: p.apply.value, updatedAt: p.apply.updatedAt },
      ...(p.push ? { push: { links: p.push.value, updatedAt: p.push.updatedAt, base: p.push.base } } : {}),
      conflicts,
    }
  }
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

export function planSleepTimerSync(
  local: LocalSleepTimer,
  remote: RemoteSleepTimer | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
): SleepTimerSyncPlan {
  const mine = normalizeSleepTimer(local.timer)
  if (!remote) {
    // 一度も押していなければ送らない
    if (local.updatedAt === null) return {}
    return { push: { timer: mine, updatedAt: local.updatedAt, base: null } }
  }
  const theirs = normalizeSleepTimer(remote.timer)
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    (mine?.startedAt ?? null) === (theirs?.startedAt ?? null),
    clockOffsetMs,
  )
  switch (step.kind) {
    case 'initial':
    case 'apply':
      return { apply: { timer: theirs, updatedAt: remote.updatedAt } }
    case 'push':
      return { push: { timer: mine, updatedAt: local.updatedAt ?? nowIso, base: step.base } }
    case 'adopt':
      return { adopt: remote.updatedAt }
    default:
      return {}
  }
}
