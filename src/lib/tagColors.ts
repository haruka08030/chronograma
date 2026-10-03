import type { Task } from '../types/task'

/** 全タスクからタイムログに付いたタグを収集（挿入順は ActivityLogView 従来どおり） */
export function timeLogTagUniverse(tasks: Task[]): string[] {
  const set = new Set<string>()
  for (const t of tasks) {
    if (t.isTimeLog) {
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
