/**
 * 取り込み（全置換）の直前の状態を、localStorage に 1 つだけ控える。
 *
 * ⌘Z の undo スタックはメモリ上にしか無いので、取り込んだあとページを
 * 再読み込みすると戻せない。取り込みは一度で全データを置き換える操作なので、
 * 再読み込みをまたいでも戻せる保険を別に持つ。
 * 全データの写しなので、`KEEP_DAYS` 日たったら捨てる（取り込みを戻すのは取り込んだ直後。容量を食い続けない）。
 */

const KEY = 'chronograma-import-rollback-v1'
/** 控えを残す日数 */
export const IMPORT_ROLLBACK_KEEP_DAYS = 7

export interface ImportRollback {
  /** 置き換える前のエクスポート相当の JSON */
  json: string
  /** 控えた時刻（ISO） */
  savedAt: string
  /** 置き換える前のタスク件数（復元の確認に出す） */
  taskCount: number
  /**
   * 控えたデータの持ち主（控えたときの `dataOwner`。自動バックアップの `owner` と同じ）。
   * 持ち主を付ける前の控えは undefined
   */
  owner?: string | null
}

export function saveImportRollback(entry: ImportRollback): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entry))
  } catch {
    /* 控えられなくても取り込み自体は続ける（⌘Z は効く） */
  }
}

export function loadImportRollback(now = Date.now()): ImportRollback | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ImportRollback>
    if (typeof parsed.json !== 'string' || typeof parsed.savedAt !== 'string') return null
    // 期限を過ぎた控えは捨てる（時刻が読めない控えは、戻せるように残す）
    if (now - Date.parse(parsed.savedAt) > IMPORT_ROLLBACK_KEEP_DAYS * 24 * 60 * 60_000) {
      clearImportRollback()
      return null
    }
    return {
      json: parsed.json,
      savedAt: parsed.savedAt,
      taskCount: typeof parsed.taskCount === 'number' ? parsed.taskCount : 0,
      ...(typeof parsed.owner === 'string' || parsed.owner === null ? { owner: parsed.owner } : {}),
    }
  } catch {
    return null
  }
}

export function clearImportRollback(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 消せなくても害はない */
  }
}
