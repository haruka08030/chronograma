/** 記録の分類の候補（設定のプリセット＋記録に付いているタグ） */
import { isLogTask, type Task } from '../types/task'

/** 全タスクからタイムログに付いたタグを収集（挿入順は ActivityLogView 従来どおり） */
export function timeLogTagUniverse(tasks: Task[]): string[] {
  const set = new Set<string>()
  for (const t of tasks) {
    if (isLogTask(t)) {
      for (const tag of t.tags) set.add(tag)
    }
  }
  return Array.from(set)
}

/**
 * 設定のプリセット行（1行1タグ）を正規化: trim・空行除去・先勝ちで重複除去。
 */
export function parseTimeLogTagPresetLines(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** プリセット配列を正規化（trim・空除去・重複除去）。 */
export function normalizeTimeLogTagPresetList(presets: string[]): string[] {
  return parseTimeLogTagPresetLines(presets.join('\n'))
}

/**
 * タイムライン色・datalist 用: プリセット順を先頭に固定し、その後ログにのみ存在するタグを続ける。
 */
export function buildTimeLogTagUniverse(presets: string[], tasks: Task[]): string[] {
  const head = normalizeTimeLogTagPresetList(presets)
  const seen = new Set(head)
  const out = [...head]
  for (const t of timeLogTagUniverse(tasks)) {
    if (!seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

/**
 * よく使うラベル（記録に付いた回数の多い順。同数・未使用は設定の並び順）。
 * 止めた直後に「ラベルは？」と聞くときの候補
 */
export function frequentLogLabels(presets: string[], tasks: Task[], limit: number): string[] {
  const count = new Map<string, number>()
  for (const t of tasks) {
    if (isLogTask(t) && t.category) count.set(t.category, (count.get(t.category) ?? 0) + 1)
  }
  const universe = buildTimeLogTagUniverse(presets, tasks)
  const order = new Map(universe.map((name, i) => [name, i]))
  return [...universe].sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0) || order.get(a)! - order.get(b)!).slice(0, limit)
}
