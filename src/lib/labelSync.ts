/**
 * 記録のラベル表（分類名の並びと色）の同期。サーバーには利用者ごとに 1 行（`user_settings.log_labels`）。
 * - ラベル表はまとめて 1 つの値として扱う。どちらに合わせるかは `settingSync.ts`（サーバーの時計の版と、手元で変えたか）
 * - この端末でまだ一度も同期していない（変えた時刻が無い）ときは、両方を合わせる（どちらの端末のラベルも消さない）。
 *   ただし手元が最初に作られた初期ラベルのままならサーバーに合わせる（英語で開いた端末の Study… が日本語のラベル表に足されない）
 * - 週の目安（#291）は行に `weeklyTargetMinutes` を足すだけ（目安の無い行は今までと同じ形）。前の版のアプリは知らない項目を読み飛ばす。
 *   ただし前の版のアプリでラベルを変えて送ると目安は消える（その版は目安を持たないため）
 * - 行にはラベルの id（#365）を足す（目安と同じく追加の項目）。前の版のアプリが送った表（id が無い）は名前で手元の id に合わせる。
 *   両方で変えた表は id ごとに合わせる（片方で名前を変えたラベルが、もう一方の古い名前で戻らない）
 * - 前回合わせた版の表にあったラベルの id を控える（`baseIds`、`settingSync.ts` の控え）。両方で変えた表を合わせるとき、
 *   控えにあって片方に無いラベルはその端末で消したので戻さない（#357。もう一方でそのラベルを直していても消す）
 * - 取り込み（Notion のデータベース名・フォルダを畳んだラベル）で足したラベルは「無ければ足す」だけ（#357）。
 *   手元の変えた時刻は進めず、足した名前を `pendingAdds` に覚えておき、合わせた表に無ければ後ろに足して送る。
 *   取り込みで手元が新しい扱いになり、ほかの端末の名前・色・並びの編集を上書きしていた
 */
import { BUILTIN_NAMES } from '../locales/builtinNames'
import { settingSyncStep } from './settingSync'
import { validTargetMinutes, type LabelTargets } from './labelTargets'
import { compactLabelIds, effectiveLabelIds, type LabelIds } from './labelIds'

export type LogLabelRow = {
  /** ラベルの id（#365）。前の版のアプリが送った表には無い（名前で手元の id に合わせ、無ければ名前から決める） */
  id?: string
  name: string
  color: string
  /** 週の目安（分）。付けていなければ項目ごと無い（#291） */
  weeklyTargetMinutes?: number
}

export type LocalLabels = {
  presets: string[]
  colors: Record<string, string>
  /** 週の目安（分）。無ければ目安なし */
  targets?: LabelTargets
  /** ラベルの id（名前を変えたラベルだけ、`labelIds.ts`）。無ければ名前から決まる id */
  ids?: LabelIds
  /** この端末でラベル表を最後に変えた（または同期で合わせた）時刻。まだ無ければ null */
  updatedAt: string | null
  /** 手元のラベル表のもとになったサーバーの版（`settingSync.ts`）。まだ無ければ null */
  syncedAt?: string | null
  /** 取り込みで足し、まだサーバーに届いていないラベルの名前（#357）。手元の表から消したものは足さない */
  pendingAdds?: readonly string[]
  /** `syncedAt` の版の表にあったラベルの id（`labelBaseIds`）。無ければ前回の中身は分からない（消したラベルが戻りうる） */
  baseIds?: readonly string[] | null
}

export type RemoteLabels = { labels: LogLabelRow[]; updatedAt: string }

export function labelsToRows(
  presets: readonly string[],
  colors: Readonly<Record<string, string>>,
  targets: Readonly<LabelTargets> = {},
  ids: Readonly<LabelIds> = {},
): LogLabelRow[] {
  const idOf = effectiveLabelIds(presets, ids)
  return presets.map((name) => {
    const id = idOf.get(name)!
    const target = validTargetMinutes(targets[name])
    return target ? { id, name, color: colors[name] ?? '', weeklyTargetMinutes: target } : { id, name, color: colors[name] ?? '' }
  })
}

/** ラベル表。`ids` は名前ごとの id（どの名前にもある） */
type LabelTable = { presets: string[]; colors: Record<string, string>; targets: LabelTargets; ids: Map<string, string> }

/**
 * 届いた行を表にする。id の無い行（前の版のアプリが送った表）は、名前で手元の id に合わせる（`localIds`）。
 * 手元にも無ければ名前から決まる id。同じ名前・同じ id の行は先のものだけ
 */
function rowsToLocal(rows: readonly LogLabelRow[], localIds?: ReadonlyMap<string, string>): LabelTable {
  const presets: string[] = []
  const colors: Record<string, string> = {}
  const targets: LabelTargets = {}
  const given: LabelIds = {}
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.name || presets.includes(r.name)) continue
    const id = r.id ?? localIds?.get(r.name)
    if (id && seen.has(id)) continue
    if (id) {
      seen.add(id)
      given[r.name] = id
    }
    presets.push(r.name)
    if (r.color) colors[r.name] = r.color
    const target = validTargetMinutes(r.weeklyTargetMinutes)
    if (target) targets[r.name] = target
  }
  return { presets, colors, targets, ids: effectiveLabelIds(presets, given) }
}

function localTable(local: LocalLabels): LabelTable {
  return {
    presets: local.presets,
    colors: local.colors,
    targets: local.targets ?? {},
    ids: effectiveLabelIds(local.presets, local.ids ?? {}),
  }
}

/** 手元に当てる形。目安・名前を変えたラベルの id が 1 つも無ければ `targets`・`ids` を付けない（当てる側は無ければ空にする） */
function toApply(t: LabelTable, updatedAt: string): NonNullable<LabelSyncPlan['apply']> {
  const ids = compactLabelIds(t.presets, t.ids)
  return {
    presets: t.presets,
    colors: t.colors,
    ...(Object.keys(t.targets).length > 0 ? { targets: t.targets } : {}),
    ...(Object.keys(ids).length > 0 ? { ids } : {}),
    updatedAt,
  }
}

const tableRows = (t: LabelTable) => labelsToRows(t.presets, t.colors, t.targets, Object.fromEntries(t.ids))

/** どれかの言語の初期ラベル（名前も並びも同じ）のままか */
const DEFAULT_PRESETS: readonly (readonly string[])[] = Object.values(BUILTIN_NAMES).map((n) => n.logCategories)
const isUntouchedDefault = (presets: readonly string[]) =>
  DEFAULT_PRESETS.some((d) => d.length === presets.length && d.every((n, i) => n === presets[i]))

/** 同じ表か。id は両方にあるときだけ比べる（前の版のアプリが送った表には無い） */
const sameRows = (a: readonly LogLabelRow[], b: readonly LogLabelRow[]) =>
  a.length === b.length &&
  a.every(
    (x, i) =>
      x.name === b[i].name &&
      x.color === b[i].color &&
      (x.weeklyTargetMinutes ?? 0) === (b[i].weeklyTargetMinutes ?? 0) &&
      (!x.id || !b[i].id || x.id === b[i].id),
  )

/**
 * 2 つの表を合わせる。先の表の並びのあとに、後の表にしか無いラベルを足す。同じラベル（同じ id か同じ名前）は先の表の名前・色。
 * id で合わせるので、片方で名前を変えたラベルがもう一方の古い名前で戻らない（#365）。
 * 週の目安は `target(先の表での名前, 後の表での名前)`（どちらかの表に無ければ undefined）
 */
function unionTables(
  first: LabelTable,
  second: LabelTable,
  target: (firstName: string | undefined, secondName: string | undefined) => number | undefined,
  /** 前回合わせた版の表にあったラベルの id。片方にしか無ければもう一方で消した（戻さない） */
  base?: ReadonlySet<string>,
): LabelTable {
  const secondNameById = new Map([...second.ids].map(([name, id]) => [id, name]))
  const firstIds = new Set(first.ids.values())
  const otherOf = (n: string) => (second.presets.includes(n) ? n : secondNameById.get(first.ids.get(n)!))
  const presets = first.presets.filter((n) => !base?.has(first.ids.get(n)!) || otherOf(n) !== undefined)
  const colors: Record<string, string> = {}
  const targets: LabelTargets = {}
  const ids = new Map([...first.ids].filter(([n]) => presets.includes(n)))
  for (const n of presets) {
    const other = otherOf(n)
    const color = first.colors[n] || (other ? second.colors[other] : undefined)
    if (color) colors[n] = color
    const t = validTargetMinutes(target(n, other))
    if (t) targets[n] = t
  }
  for (const n of second.presets) {
    if (presets.includes(n) || firstIds.has(second.ids.get(n)!) || base?.has(second.ids.get(n)!)) continue
    presets.push(n)
    ids.set(n, second.ids.get(n)!)
    if (second.colors[n]) colors[n] = second.colors[n]
    const t = validTargetMinutes(target(undefined, n))
    if (t) targets[n] = t
  }
  return { presets, colors, targets, ids }
}

export type LabelSyncPlan = {
  /**
   * 手元に当てる（presets・colors・週の目安・名前を変えたラベルの id・時刻）。`targets` が無ければ目安なし、`ids` が無ければどのラベルも名前から決まる id
   */
  apply?: { presets: string[]; colors: Record<string, string>; targets?: LabelTargets; ids?: LabelIds; updatedAt: string }
  /** サーバーに送る。`base` はもとにしたサーバーの版（サーバーに行が無ければ null） */
  push?: RemoteLabels & { base: string | null }
  /** 中身は同じ。手元の時刻ともとにした版をこのサーバーの版にそろえる */
  adopt?: string
}

export function planLabelSync(
  local: LocalLabels,
  remote: RemoteLabels | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
): LabelSyncPlan {
  const plan = planLabelTable(local, remote, nowIso, clockOffsetMs)
  const adds = (local.pendingAdds ?? []).filter((n) => local.presets.includes(n))
  // 送るなら手元の表（取り込んだラベルを含む）か、それと合わせた表なので足りている
  if (!remote || adds.length === 0 || plan.push) return plan
  // 当てる表（サーバーの表・合わせた表）か、そのままならサーバーの表に、無いものだけ後ろに足す
  const mine = localTable(local)
  const base: LabelTable = plan.apply
    ? {
        presets: plan.apply.presets,
        colors: plan.apply.colors,
        targets: plan.apply.targets ?? {},
        ids: effectiveLabelIds(plan.apply.presets, plan.apply.ids ?? {}),
      }
    : rowsToLocal(remote.labels, mine.ids)
  const missing = adds.filter((n) => !base.presets.includes(n))
  if (missing.length === 0) return plan
  const colors = { ...base.colors }
  const ids = new Map(base.ids)
  for (const n of missing) {
    if (local.colors[n]) colors[n] = local.colors[n]
    ids.set(n, mine.ids.get(n)!)
  }
  return mergedPlan({ presets: [...base.presets, ...missing], colors, targets: base.targets, ids }, remote, nowIso)
}

/**
 * 覚えておいた取り込みのラベルのうち、もう覚えなくてよい名前（サーバーの表にある・手元の表から消した）。
 * 送った表に入った名前は送れたあと（`onPushed`）に外す
 */
export function settledLabelAdds(
  pending: readonly string[],
  presets: readonly string[],
  remote: Pick<RemoteLabels, 'labels'> | null,
): string[] {
  return pending.filter((n) => !presets.includes(n) || !!remote?.labels.some((r) => r.name === n))
}

/** 取り込みで表を変えたあとの覚えておく名前（前から覚えている名前と、新しく足した名前） */
export function pendingAddsAfterImport(pending: readonly string[], before: readonly string[], after: readonly string[]): string[] {
  const added = after.filter((n) => !before.includes(n) && !pending.includes(n))
  return added.length === 0 ? [...pending] : [...pending, ...added]
}

function planLabelTable(local: LocalLabels, remote: RemoteLabels | null, nowIso: string, clockOffsetMs: number): LabelSyncPlan {
  const mine = localTable(local)
  const localRows = tableRows(mine)
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    !!remote && sameRows(localRows, remote.labels),
    clockOffsetMs,
  )
  if (!remote) return { push: { labels: localRows, updatedAt: local.updatedAt ?? nowIso, base: null } }
  // 両方の端末で前回合わせた後に変えていた: 丸ごと新しいほうにせず、ラベル（id、無ければ名前）ごとに合わせる（2 台で別々に足したラベルをどちらも残す）。
  // 並びと同じラベルの名前・色・週の目安は新しいほう（目安を外したのも新しいほうに従う）。前回の版にあって片方で消したラベルは消す
  // （前回の版の控えが無ければ、片方で消したラベルはもう一方にあれば戻る）
  const bothChanged =
    local.updatedAt !== null && local.syncedAt != null && local.updatedAt !== local.syncedAt && remote.updatedAt !== local.syncedAt
  if (bothChanged && (step.kind === 'push' || step.kind === 'apply')) {
    const fromRemote = rowsToLocal(remote.labels, mine.ids)
    const [first, second] = step.kind === 'push' ? [mine, fromRemote] : [fromRemote, mine]
    return mergedPlan(
      unionTables(
        first,
        second,
        (a, b) => (a !== undefined ? first.targets[a] : b !== undefined ? second.targets[b] : undefined),
        local.baseIds ? new Set(local.baseIds) : undefined,
      ),
      remote,
      nowIso,
    )
  }
  switch (step.kind) {
    case 'initial': {
      // 初めて: サーバーの並びのあとに、手元にしか無いラベルを足す。同じラベルの名前・色はサーバーの。
      // 週の目安は付いているほう（外した記録が無いので、どちらかに付いていれば残す。両方にあればサーバー）
      const fromRemote = rowsToLocal(remote.labels, mine.ids)
      if (isUntouchedDefault(local.presets) && fromRemote.presets.length > 0) return { apply: toApply(fromRemote, remote.updatedAt) }
      return mergedPlan(
        unionTables(
          fromRemote,
          mine,
          (a, b) => (a !== undefined ? fromRemote.targets[a] : undefined) ?? (b !== undefined ? mine.targets[b] : undefined),
        ),
        remote,
        nowIso,
      )
    }
    case 'apply':
      return { apply: toApply(rowsToLocal(remote.labels, mine.ids), remote.updatedAt) }
    case 'push':
      return { push: { labels: localRows, updatedAt: local.updatedAt ?? nowIso, base: step.base } }
    case 'adopt':
      return { adopt: remote.updatedAt }
    default:
      return {}
  }
}

/**
 * 合わせた版の表のラベルの id（控え）。id の無い行（前の版のアプリが送った表）は、合わせるときと同じく名前で手元の id に
 */
export function labelBaseIds(rows: readonly LogLabelRow[], local: Pick<LocalLabels, 'presets' | 'ids'>): string[] {
  return [...rowsToLocal(rows, effectiveLabelIds(local.presets, local.ids ?? {})).ids.values()]
}

/** 保存されていた控え（壊れていてもよい）。id の一覧でなければ null */
export function normalizeLabelBase(raw: unknown): string[] | null {
  return Array.isArray(raw) && raw.every((x) => typeof x === 'string') ? (raw as string[]) : null
}

/** 合わせた表: サーバーと同じ中身なら当てるだけ、違えば当てて送る */
function mergedPlan(merged: LabelTable, remote: RemoteLabels, nowIso: string): LabelSyncPlan {
  const mergedRows = tableRows(merged)
  if (sameRows(mergedRows, remote.labels)) return { apply: toApply(merged, remote.updatedAt) }
  return { apply: toApply(merged, nowIso), push: { labels: mergedRows, updatedAt: nowIso, base: remote.updatedAt } }
}
