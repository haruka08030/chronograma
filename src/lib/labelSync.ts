/**
 * 記録のラベル表（分類名の並びと色）の同期。サーバーには利用者ごとに 1 行（`user_settings.log_labels`）。
 * - ラベル表はまとめて 1 つの値として扱う。どちらに合わせるかは `settingSync.ts`（サーバーの時計の版と、手元で変えたか）
 * - この端末でまだ一度も同期していない（変えた時刻が無い）ときは、両方を合わせる（どちらの端末のラベルも消さない）。
 *   ただし手元が最初に作られた初期ラベルのままならサーバーに合わせる（英語で開いた端末の Study… が日本語のラベル表に足されない）
 */
import jaLocale from '../locales/ja'
import enLocale from '../locales/en'
import { settingSyncStep } from './settingSync'

export type LogLabelRow = { name: string; color: string }

export type LocalLabels = {
  presets: string[]
  colors: Record<string, string>
  /** この端末でラベル表を最後に変えた（または同期で合わせた）時刻。まだ無ければ null */
  updatedAt: string | null
  /** 手元のラベル表のもとになったサーバーの版（`settingSync.ts`）。まだ無ければ null */
  syncedAt?: string | null
}

export type RemoteLabels = { labels: LogLabelRow[]; updatedAt: string }

export function labelsToRows(presets: readonly string[], colors: Readonly<Record<string, string>>): LogLabelRow[] {
  return presets.map((name) => ({ name, color: colors[name] ?? '' }))
}

function rowsToLocal(rows: readonly LogLabelRow[]): { presets: string[]; colors: Record<string, string> } {
  const presets: string[] = []
  const colors: Record<string, string> = {}
  for (const r of rows) {
    if (!r.name || presets.includes(r.name)) continue
    presets.push(r.name)
    if (r.color) colors[r.name] = r.color
  }
  return { presets, colors }
}

/** どれかの言語の初期ラベル（名前も並びも同じ）のままか */
const DEFAULT_PRESETS: readonly (readonly string[])[] = [jaLocale.logCategories.defaults, enLocale.logCategories.defaults]
const isUntouchedDefault = (presets: readonly string[]) =>
  DEFAULT_PRESETS.some((d) => d.length === presets.length && d.every((n, i) => n === presets[i]))

const sameRows = (a: readonly LogLabelRow[], b: readonly LogLabelRow[]) =>
  a.length === b.length && a.every((x, i) => x.name === b[i].name && x.color === b[i].color)

export type LabelSyncPlan = {
  /** 手元に当てる（presets・colors・時刻） */
  apply?: { presets: string[]; colors: Record<string, string>; updatedAt: string }
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
  const localRows = labelsToRows(local.presets, local.colors)
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    !!remote && sameRows(localRows, remote.labels),
    clockOffsetMs,
  )
  if (!remote) return { push: { labels: localRows, updatedAt: local.updatedAt ?? nowIso, base: null } }
  switch (step.kind) {
    case 'initial': {
      // 初めて: サーバーの並びのあとに、手元にしか無いラベルを足す。同じ名前の色はサーバーの色
      const fromRemote = rowsToLocal(remote.labels)
      if (isUntouchedDefault(local.presets) && fromRemote.presets.length > 0)
        return { apply: { ...fromRemote, updatedAt: remote.updatedAt } }
      const presets = [...fromRemote.presets, ...local.presets.filter((n) => !fromRemote.presets.includes(n))]
      const colors = { ...local.colors, ...fromRemote.colors }
      const mergedRows = labelsToRows(presets, colors)
      if (sameRows(mergedRows, remote.labels)) return { apply: { presets, colors, updatedAt: remote.updatedAt } }
      return { apply: { presets, colors, updatedAt: nowIso }, push: { labels: mergedRows, updatedAt: nowIso, base: remote.updatedAt } }
    }
    case 'apply':
      return { apply: { ...rowsToLocal(remote.labels), updatedAt: remote.updatedAt } }
    case 'push':
      return { push: { labels: localRows, updatedAt: local.updatedAt ?? nowIso, base: step.base } }
    case 'adopt':
      return { adopt: remote.updatedAt }
    default:
      return {}
  }
}
