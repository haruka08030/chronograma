import { isLogTask, type Task } from '../types/task'
import { CALENDAR_COLORS } from './googleColors'
import { categoryHex, colorKeyForHex, isHexColor, labelForHex } from './logCategoryColors'
import { isActiveTask } from './taskLifecycle'

export interface TodoColorLabel {
  /** `#RRGGBB`（大文字） */
  hex: string
  /** その色に付けたラベル名（記録と同じラベル）。名前の無い色は null */
  name: string | null
  /** 未完了のルートタスク数（開いたときの「未完了 n 件」と揃える） */
  count: number
}

/** 色ラベルの絞り込み（`filterColor`）で「ラベルなし」（色を付けていない To-Do）を開く印 */
export const NO_LABEL = 'NONE'

const GOOGLE_ORDER = new Map(CALENDAR_COLORS.map((c, i) => [c.hex.toUpperCase(), i]))

/**
 * To‑Do のナビに出す色ラベル（タスクに色を付けたものだけ）。
 * Google と同じく、ラベルは色に付けた名前。並びは ラベルの順 → 名前の無い Google の色 → 自分で作った色。
 * 開くと「すべて」をその色で絞るので、範囲も「すべて」と同じ（記録・いつか・チェックリストは入れない）。
 * 未完了が 0 件の色は出さない。ただし開いている色（`keepHex`）は、操作中に消えないよう 0 件で残す。
 * `withNamed` のときは、まだどのタスクにも付けていないラベル（名前を付けた色）も 0 件で後ろに足す（タスクをドラッグ中のドロップ先）。
 * いつも出ているラベルの位置は動かさず、ドラッグ中だけ出るものはその下に並べる。
 */
export function todoColorLabels(
  tasks: Task[],
  excludedListIds: ReadonlySet<string>,
  presets: readonly string[],
  colors: Readonly<Record<string, string>>,
  withNamed = false,
  keepHex: string | null = null,
): TodoColorLabel[] {
  const counts = new Map<string, number>()
  for (const t of tasks) {
    if (!t.color || isLogTask(t) || t.parentId !== null || !isActiveTask(t) || excludedListIds.has(t.listId)) continue
    const hex = t.color.toUpperCase()
    counts.set(hex, (counts.get(hex) ?? 0) + (t.completed ? 0 : 1))
  }
  const rank = (l: TodoColorLabel): [number, number, string] => {
    if (l.name) return [0, presets.indexOf(l.name), '']
    const g = GOOGLE_ORDER.get(l.hex)
    return g !== undefined ? [1, g, ''] : [2, 0, l.hex]
  }
  const keep = keepHex?.toUpperCase()
  const shown = [...counts]
    .filter(([hex, count]) => count > 0 || hex === keep)
    .map(([hex, count]) => ({ hex, name: labelForHex(hex, presets, colors), count }))
    .sort((a, b) => {
      const [ga, ia, ha] = rank(a)
      const [gb, ib, hb] = rank(b)
      return ga - gb || ia - ib || ha.localeCompare(hb)
    })
  if (!withNamed) return shown
  const extra: TodoColorLabel[] = []
  for (const name of presets) {
    const hex = categoryHex(name, colors)
    if (shown.some((l) => l.hex === hex) || extra.some((l) => l.hex === hex)) continue
    extra.push({ hex, name: labelForHex(hex, presets, colors), count: 0 })
  }
  return [...shown, ...extra]
}

/** 色を付けていない未完了の To-Do の数（ナビの「ラベルなし」。範囲は `todoColorLabels` と同じ） */
export function unlabeledTodoCount(tasks: Task[], excludedListIds: ReadonlySet<string>): number {
  return tasks.filter(
    (t) => !t.color && !t.completed && !isLogTask(t) && t.parentId === null && isActiveTask(t) && !excludedListIds.has(t.listId),
  ).length
}

/** 色ラベルの表示名: ラベル名 → Google の色名（「セージ」など）→ 自分で作った色は `#RRGGBB`。`NO_LABEL` は「ラベルなし」 */
export function colorLabelText(
  hex: string,
  presets: readonly string[],
  colors: Readonly<Record<string, string>>,
  t: (key: string) => string,
): string {
  if (hex === NO_LABEL) return t('labels.none')
  const name = labelForHex(hex, presets, colors)
  if (name) return name
  const key = colorKeyForHex(hex)
  return key ? t(`googleColors.${key}`) : hex.toUpperCase()
}

/** `recordLabelKey` の表示名: ラベル名 → 名前の無い色は色ラベルと同じ名前 → 空は「ラベルなし」 */
export function recordLabelKeyText(
  key: string,
  presets: readonly string[],
  colors: Readonly<Record<string, string>>,
  t: (key: string) => string,
): string {
  if (!key) return t('labels.none')
  return isHexColor(key) ? colorLabelText(key, presets, colors, t) : key
}

/** ラベルの保存（`saveLogLabels`）に渡す 1 行 */
export interface LabelRow {
  from: string | null
  name: string
  color: string
  fromHex?: string
}

/**
 * To‑Do ナビの色ラベル 1 つを書き換えたときの、ラベル全体の行（「ラベルを編集」と同じ保存に渡す）。
 * - ラベル名のある色: 名前と色を変える。名前を空にしたら元の名前のまま（消すのは削除だけ）
 * - 名前の無い色: 名前を書くとその色のラベルを作る。色を変えたらその色の予定・タスクも新しい色へ
 * - `edit` が null なら、その色のラベルを消す
 */
export function colorLabelEditRows(
  hex: string,
  edit: { name: string; hex: string } | null,
  presets: readonly string[],
  colors: Readonly<Record<string, string>>,
): LabelRow[] {
  const toColor = (h: string) => colorKeyForHex(h) ?? h.toUpperCase()
  const current = labelForHex(hex, presets, colors)
  const rows: LabelRow[] = []
  for (const n of presets) {
    if (n !== current) {
      rows.push({ from: n, name: n, color: toColor(categoryHex(n, colors)) })
    } else if (edit) {
      rows.push({ from: n, name: edit.name.trim() || n, color: toColor(edit.hex) })
    }
  }
  if (!current && edit) rows.push({ from: null, name: edit.name.trim(), color: toColor(edit.hex), fromHex: hex })
  return rows
}
