/**
 * To-Do のリスト（フォルダ）を畳んでラベルにする。To-Do の分け方はラベルだけ。リストはいつか・チェックリストだけ残す。
 * 前の版のデータ・前の版の端末が同期で送ってきたフォルダ・取り込んだバックアップのどれも、ここで同じように畳む。
 */
import { isLogTask, type Task } from '../types/task'
import { normalizeListKind, type TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { INBOX_ID } from '../store/storeConstants'
import { isCanvasListId } from './canvasIds'
import { categoryHex, colorKeyForHex, labelForHex, nextCategoryColor } from './logCategoryColors'

export interface LabelTable {
  timeLogTagPresets: string[]
  logCategoryColors: Record<string, string>
}

export interface FoldState extends LabelTable {
  lists: TaskList[]
  sections: ListSection[]
  tasks: Task[]
}

/** 畳む対象のリスト（未分類以外の To-Do のリスト。連携の Canvas・Notion も） */
export function isTaskFolder(list: TaskList): boolean {
  return list.id !== INBOX_ID && normalizeListKind(list.kind) === 'tasks'
}

/**
 * その名前のラベルの色。無ければ作る（`hex` があればその色、無ければまだ使っていない色）。
 * ラベルの表を変えなければ同じ表をそのまま返す
 */
export function ensureLabel(table: LabelTable, rawName: string, hex?: string | null): { table: LabelTable; hex: string } {
  const name = rawName.trim()
  if (table.timeLogTagPresets.includes(name)) return { table, hex: categoryHex(name, table.logCategoryColors) }
  const color = hex ? (colorKeyForHex(hex) ?? hex.toUpperCase()) : nextCategoryColor(name, table.logCategoryColors, table.timeLogTagPresets)
  const next = {
    timeLogTagPresets: [...table.timeLogTagPresets, name],
    logCategoryColors: { ...table.logCategoryColors, [name]: color },
  }
  return { table: next, hex: categoryHex(name, next.logCategoryColors) }
}

/**
 * フォルダの中のタスクに付ける色。
 * - フォルダ名と同じラベルがあれば、そのラベルの色
 * - フォルダの色にラベル名が付いていれば、その色のまま（フォルダ名は残らない）
 * - どちらも無ければ、フォルダの色にフォルダ名のラベルを付ける
 */
function labelHexFor(table: LabelTable, list: TaskList): { table: LabelTable; hex: string } {
  const name = list.name.trim()
  if (name && table.timeLogTagPresets.includes(name)) return ensureLabel(table, name)
  if (!name || labelForHex(list.color, table.timeLogTagPresets, table.logCategoryColors)) {
    return { table, hex: list.color.toUpperCase() }
  }
  return ensureLabel(table, name, list.color)
}

/** 畳むものがあるか（フォルダ・未分類のセクション） */
export function needsFold(s: Pick<FoldState, 'lists' | 'sections'>): boolean {
  return s.lists.some(isTaskFolder) || s.sections.some((sec) => sec.listId === INBOX_ID)
}

/**
 * フォルダを畳む。中のタスクは未分類へ移し（セクションの外へ）、色の無いルートのタスクにはラベルの色を付ける。
 * フォルダとそのセクション、未分類のセクションは消す。畳むものが無ければ null
 */
export function foldTaskFolders(s: FoldState, now: string): FoldState | null {
  if (!needsFold(s)) return null
  const folders = new Map(s.lists.filter(isTaskFolder).map((l) => [l.id, l]))
  const droppedSections = new Set(s.sections.filter((sec) => sec.listId === INBOX_ID || folders.has(sec.listId)).map((sec) => sec.id))
  let table: LabelTable = { timeLogTagPresets: s.timeLogTagPresets, logCategoryColors: s.logCategoryColors }
  const tasks = s.tasks.map((t) => {
    const folder = folders.get(t.listId)
    if (!folder) return t.sectionId && droppedSections.has(t.sectionId) ? { ...t, sectionId: null, updatedAt: now } : t
    let color = t.color
    // Canvas の課題は科目のタグだけで、ラベルは付けない
    if (!color && t.parentId === null && !isLogTask(t) && !isCanvasListId(folder.id)) {
      const r = labelHexFor(table, folder)
      table = r.table
      color = r.hex
    }
    return { ...t, listId: INBOX_ID, sectionId: null, color, updatedAt: now }
  })
  return {
    lists: s.lists.filter((l) => !folders.has(l.id)),
    sections: s.sections.filter((sec) => !droppedSections.has(sec.id)),
    tasks,
    ...table,
  }
}
