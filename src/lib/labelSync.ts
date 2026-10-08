/**
 * 記録のラベル表（分類名の並びと色）の同期。サーバーには利用者ごとに 1 行（`user_settings.log_labels`）。
 * - ラベル表はまとめて 1 つの値として扱う。どちらに合わせるかは `settingSync.ts`（サーバーの時計の版と、手元で変えたか）
 * - この端末でまだ一度も同期していない（変えた時刻が無い）ときは、両方を合わせる（どちらの端末のラベルも消さない）。
 *   ただし手元が最初に作られた初期ラベルのままならサーバーに合わせる（英語で開いた端末の Study… が日本語のラベル表に足されない）
 * - 週の目安（#291）は行に `weeklyTargetMinutes` を足すだけ（目安の無い行は今までと同じ形）。前の版のアプリは知らない項目を読み飛ばす。
 *   ただし前の版のアプリでラベルを変えて送ると目安は消える（その版は目安を持たないため）
 * - 取り込み（Notion のデータベース名・フォルダを畳んだラベル）で足したラベルは「無ければ足す」だけ（#357）。
 *   手元の変えた時刻は進めず、足した名前を `pendingAdds` に覚えておき、合わせた表に無ければ後ろに足して送る。
 *   取り込みで手元が新しい扱いになり、ほかの端末の名前・色・並びの編集を上書きしていた
 */
import jaLocale from '../locales/ja'
import enLocale from '../locales/en'
import { settingSyncStep } from './settingSync'
import { validTargetMinutes, type LabelTargets } from './labelTargets'

export type LogLabelRow = {
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
  /** この端末でラベル表を最後に変えた（または同期で合わせた）時刻。まだ無ければ null */
  updatedAt: string | null
  /** 手元のラベル表のもとになったサーバーの版（`settingSync.ts`）。まだ無ければ null */
  syncedAt?: string | null
  /** 取り込みで足し、まだサーバーに届いていないラベルの名前（#357）。手元の表から消したものは足さない */
  pendingAdds?: readonly string[]
}

export type RemoteLabels = { labels: LogLabelRow[]; updatedAt: string }

export function labelsToRows(
  presets: readonly string[],
  colors: Readonly<Record<string, string>>,
  targets: Readonly<LabelTargets> = {},
): LogLabelRow[] {
  return presets.map((name) => {
    const target = validTargetMinutes(targets[name])
    return target ? { name, color: colors[name] ?? '', weeklyTargetMinutes: target } : { name, color: colors[name] ?? '' }
  })
}

type LabelTable = { presets: string[]; colors: Record<string, string>; targets: LabelTargets }

function rowsToLocal(rows: readonly LogLabelRow[]): LabelTable {
  const presets: string[] = []
  const colors: Record<string, string> = {}
  const targets: LabelTargets = {}
  for (const r of rows) {
    if (!r.name || presets.includes(r.name)) continue
    presets.push(r.name)
    if (r.color) colors[r.name] = r.color
    const target = validTargetMinutes(r.weeklyTargetMinutes)
    if (target) targets[r.name] = target
  }
  return { presets, colors, targets }
}

/** 手元に当てる形。目安が 1 つも無ければ `targets` を付けない（当てる側は無ければ目安なしにする） */
function toApply(t: LabelTable, updatedAt: string): NonNullable<LabelSyncPlan['apply']> {
  return Object.keys(t.targets).length > 0
    ? { presets: t.presets, colors: t.colors, targets: t.targets, updatedAt }
    : { presets: t.presets, colors: t.colors, updatedAt }
}

/** どれかの言語の初期ラベル（名前も並びも同じ）のままか */
const DEFAULT_PRESETS: readonly (readonly string[])[] = [jaLocale.logCategories.defaults, enLocale.logCategories.defaults]
const isUntouchedDefault = (presets: readonly string[]) =>
  DEFAULT_PRESETS.some((d) => d.length === presets.length && d.every((n, i) => n === presets[i]))

const sameRows = (a: readonly LogLabelRow[], b: readonly LogLabelRow[]) =>
  a.length === b.length &&
  a.every((x, i) => x.name === b[i].name && x.color === b[i].color && (x.weeklyTargetMinutes ?? 0) === (b[i].weeklyTargetMinutes ?? 0))

export type LabelSyncPlan = {
  /** 手元に当てる（presets・colors・週の目安・時刻）。`targets` が無ければ目安なし */
  apply?: { presets: string[]; colors: Record<string, string>; targets?: LabelTargets; updatedAt: string }
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
  const base: LabelTable = plan.apply
    ? { presets: plan.apply.presets, colors: plan.apply.colors, targets: plan.apply.targets ?? {} }
    : rowsToLocal(remote.labels)
  const missing = adds.filter((n) => !base.presets.includes(n))
  if (missing.length === 0) return plan
  const colors = { ...base.colors }
  for (const n of missing) if (local.colors[n]) colors[n] = local.colors[n]
  return mergedPlan({ presets: [...base.presets, ...missing], colors, targets: base.targets }, remote, nowIso)
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
  const localTargets = local.targets ?? {}
  const localRows = labelsToRows(local.presets, local.colors, localTargets)
  const localTable: LabelTable = { presets: local.presets, colors: local.colors, targets: localTargets }
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    !!remote && sameRows(localRows, remote.labels),
    clockOffsetMs,
  )
  if (!remote) return { push: { labels: localRows, updatedAt: local.updatedAt ?? nowIso, base: null } }
  // 両方の端末で前回合わせた後に変えていた: 丸ごと新しいほうにせず名前ごとに合わせる（2 台で別々に足したラベルをどちらも残す）。
  // 並びと同じ名前の色・週の目安は新しいほう（目安を外したのも新しいほうに従う）。前回の中身は持たないので、片方で消したラベルはもう一方にあれば戻る
  const bothChanged =
    local.updatedAt !== null && local.syncedAt != null && local.updatedAt !== local.syncedAt && remote.updatedAt !== local.syncedAt
  if (bothChanged && (step.kind === 'push' || step.kind === 'apply')) {
    const fromRemote = rowsToLocal(remote.labels)
    const [first, second] = step.kind === 'push' ? [localTable, fromRemote] : [fromRemote, localTable]
    const presets = [...first.presets, ...second.presets.filter((n) => !first.presets.includes(n))]
    const colors = { ...second.colors, ...first.colors }
    const targets: LabelTargets = {}
    for (const n of presets) {
      const target = validTargetMinutes(first.presets.includes(n) ? first.targets[n] : second.targets[n])
      if (target) targets[n] = target
    }
    return mergedPlan({ presets, colors, targets }, remote, nowIso)
  }
  switch (step.kind) {
    case 'initial': {
      // 初めて: サーバーの並びのあとに、手元にしか無いラベルを足す。同じ名前の色はサーバーの色。
      // 週の目安は付いているほう（外した記録が無いので、どちらかに付いていれば残す。両方にあればサーバー）
      const fromRemote = rowsToLocal(remote.labels)
      if (isUntouchedDefault(local.presets) && fromRemote.presets.length > 0) return { apply: toApply(fromRemote, remote.updatedAt) }
      const presets = [...fromRemote.presets, ...local.presets.filter((n) => !fromRemote.presets.includes(n))]
      const colors = { ...local.colors, ...fromRemote.colors }
      const targets: LabelTargets = {}
      for (const n of presets) {
        const target = fromRemote.targets[n] ?? validTargetMinutes(localTargets[n])
        if (target) targets[n] = target
      }
      return mergedPlan({ presets, colors, targets }, remote, nowIso)
    }
    case 'apply':
      return { apply: toApply(rowsToLocal(remote.labels), remote.updatedAt) }
    case 'push':
      return { push: { labels: localRows, updatedAt: local.updatedAt ?? nowIso, base: step.base } }
    case 'adopt':
      return { adopt: remote.updatedAt }
    default:
      return {}
  }
}

/** 合わせた表: サーバーと同じ中身なら当てるだけ、違えば当てて送る */
function mergedPlan(merged: LabelTable, remote: RemoteLabels, nowIso: string): LabelSyncPlan {
  const mergedRows = labelsToRows(merged.presets, merged.colors, merged.targets)
  if (sameRows(mergedRows, remote.labels)) return { apply: toApply(merged, remote.updatedAt) }
  return { apply: toApply(merged, nowIso), push: { labels: mergedRows, updatedAt: nowIso, base: remote.updatedAt } }
}
