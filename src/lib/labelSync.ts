/**
 * 記録のラベル表（分類名の並びと色）の同期。サーバーには利用者ごとに 1 行（`user_settings.log_labels`）。
 * - どちらかが新しければ、新しいほうに合わせる（ラベル表はまとめて 1 つの値として扱う）
 * - この端末でまだ一度も同期していない（変えた時刻が無い）ときは、両方を合わせる（どちらの端末のラベルも消さない）
 */
export type LogLabelRow = { name: string; color: string }

export type LocalLabels = {
  presets: string[]
  colors: Record<string, string>
  /** この端末でラベル表を最後に変えた（または同期で合わせた）時刻。まだ無ければ null */
  updatedAt: string | null
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

const sameRows = (a: readonly LogLabelRow[], b: readonly LogLabelRow[]) =>
  a.length === b.length && a.every((x, i) => x.name === b[i].name && x.color === b[i].color)

export type LabelSyncPlan = {
  /** 手元に当てる（presets・colors・時刻） */
  apply?: { presets: string[]; colors: Record<string, string>; updatedAt: string }
  /** サーバーに送る */
  push?: RemoteLabels
}

export function planLabelSync(local: LocalLabels, remote: RemoteLabels | null, nowIso: string = new Date().toISOString()): LabelSyncPlan {
  const localRows = labelsToRows(local.presets, local.colors)
  if (!remote) return { push: { labels: localRows, updatedAt: local.updatedAt ?? nowIso } }
  if (local.updatedAt === null) {
    // 初めて: サーバーの並びのあとに、手元にしか無いラベルを足す。同じ名前の色はサーバーの色
    const fromRemote = rowsToLocal(remote.labels)
    const presets = [...fromRemote.presets, ...local.presets.filter((n) => !fromRemote.presets.includes(n))]
    const colors = { ...local.colors, ...fromRemote.colors }
    const mergedRows = labelsToRows(presets, colors)
    if (sameRows(mergedRows, remote.labels)) return { apply: { presets, colors, updatedAt: remote.updatedAt } }
    return { apply: { presets, colors, updatedAt: nowIso }, push: { labels: mergedRows, updatedAt: nowIso } }
  }
  const lt = Date.parse(local.updatedAt)
  const rt = Date.parse(remote.updatedAt)
  if (rt > lt) {
    const fromRemote = rowsToLocal(remote.labels)
    return { apply: { ...fromRemote, updatedAt: remote.updatedAt } }
  }
  if (lt > rt && !sameRows(localRows, remote.labels)) return { push: { labels: localRows, updatedAt: local.updatedAt } }
  return {}
}
