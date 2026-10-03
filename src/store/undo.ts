/**
 * ⌘Z / ⌘⇧Z の履歴（メモリ上だけ。永続化しない）。ストアを作るときに 1 つ作り、各 slice へ `pushUndo` などを渡す。
 *
 * 1 回の操作で「変わった行の、操作前の姿」だけを覚え、取り消しではその行だけを戻す（`updatedAt` は付け直す）。
 * - 全体の控えを丸ごと戻すと、操作のあとに同期で届いた他の端末の行まで消え、サーバーからも消してしまう
 * - 古い `updatedAt` のまま戻すと、次の同期でサーバー側が勝って取り消しが黙って元に戻る
 * - 戻すのはデータだけ。記録中のタイマーと見ている画面（絞り込み・日付など）は ⌘Z で変えない
 */
import type { TaskState, ToastText } from './storeTypes'
import type { StoreGet, StoreSet } from './slices/sliceTypes'

const MAX_UNDO = 50

/** ⌘Z で戻す行の集まり（どれも id を持ち、同期される） */
const COLLECTIONS = ['tasks', 'lists', 'sections', 'habits'] as const
type CollectionKey = (typeof COLLECTIONS)[number]
/** ⌘Z で戻す端末の設定（行ではなく値ごと） */
const SETTINGS = ['timeLogTagPresets', 'logCategoryColors', 'listColorPaletteId'] as const
type SettingKey = (typeof SETTINGS)[number]

type Row = { id: string; updatedAt?: string }
type DataView = Pick<TaskState, CollectionKey | SettingKey>

/** 1 回の操作の記録: 変わった行の操作前の姿（null は「その操作で作られた」）と、変わった設定の操作前の値 */
type UndoEntry = {
  rows: { [K in CollectionKey]?: Map<string, Row | null> }
  settings: Partial<Pick<TaskState, SettingKey>>
}

/** 操作の前の状態。操作が終わってから差分にする（`finalize`） */
type PendingEntry = { before: DataView; entry: UndoEntry | null }

export interface UndoHistory {
  /**
   * 直前の状態を控える。`label` を渡した操作だけ「元に戻す」トーストを出す。
   * 削除は `recentDeletes` 由来のトーストが出るので渡さない
   * （二重に出さないため）。
   */
  pushUndo: (label?: ToastText) => void
  /**
   * Enter で増やした空の行がまだ名前を持たないまま、取り消し履歴の一番上が
   * 「その行を作る直前」の控えになっているか。名前付けと作成を 1 手として扱うのに使う
   */
  isUnnamedJustCreated: (id: string) => boolean
  /** いちばん上の控えを捨てる（空のまま捨てた行の作成を、取り消し履歴からも消す） */
  dropLastUndo: () => void
  /** 取り消し・やり直しの履歴を空にする（他のタブの取り込み・ログアウト） */
  clear: () => void
  actions: Pick<TaskState, 'asOneUndo' | 'undoLastOperation' | 'redoLastOperation'>
}

function dataView(s: TaskState): DataView {
  // 不変に扱っているので参照だけ持てばよい（複製しない）
  return {
    tasks: s.tasks,
    lists: s.lists,
    sections: s.sections,
    habits: s.habits,
    timeLogTagPresets: s.timeLogTagPresets,
    logCategoryColors: s.logCategoryColors,
    listColorPaletteId: s.listColorPaletteId,
  }
}

/** 操作の前と後を比べて、変わった行の前の姿だけを残す */
export function diffEntry(before: DataView, after: DataView): UndoEntry {
  const entry: UndoEntry = { rows: {}, settings: {} }
  for (const key of COLLECTIONS) {
    const prev = before[key] as Row[]
    const next = after[key] as Row[]
    if (prev === next) continue
    const prevById = new Map(prev.map((r) => [r.id, r]))
    const changed = new Map<string, Row | null>()
    for (const r of next) {
      const old = prevById.get(r.id)
      if (old === undefined) changed.set(r.id, null)
      else if (old !== r) changed.set(r.id, old)
      prevById.delete(r.id)
    }
    // 操作で消えた行（物理的に消す操作）は、前の姿に戻す
    for (const [id, old] of prevById) changed.set(id, old)
    if (changed.size > 0) entry.rows[key] = changed
  }
  for (const key of SETTINGS) {
    if (before[key] !== after[key]) (entry.settings as Record<string, unknown>)[key] = before[key]
  }
  return entry
}

function isEmpty(entry: UndoEntry): boolean {
  return Object.keys(entry.rows).length === 0 && Object.keys(entry.settings).length === 0
}

/**
 * 記録を今の状態に当てる。戻す行は `updatedAt` を今にする（同期で負けないように）。
 * 返すのは、当てる前のその行・設定の姿（やり直し／取り消し用の逆の記録）
 */
export function applyEntry(state: DataView, entry: UndoEntry, nowIso: string): { next: Partial<DataView>; inverse: UndoEntry } {
  const next: Partial<DataView> = {}
  const inverse: UndoEntry = { rows: {}, settings: {} }
  for (const key of COLLECTIONS) {
    const changes = entry.rows[key]
    if (!changes) continue
    const current = state[key] as Row[]
    const currentById = new Map(current.map((r) => [r.id, r]))
    const inv = new Map<string, Row | null>()
    for (const id of changes.keys()) inv.set(id, currentById.get(id) ?? null)
    const out: Row[] = []
    for (const r of current) {
      if (!changes.has(r.id)) {
        out.push(r)
        continue
      }
      const target = changes.get(r.id)
      if (target) out.push({ ...target, updatedAt: nowIso })
      // null は「その操作で作られた行」なので取り除く
    }
    for (const [id, target] of changes) {
      if (target && !currentById.has(id)) out.push({ ...target, updatedAt: nowIso })
    }
    ;(next as Record<string, unknown>)[key] = out
    inverse.rows[key] = inv
  }
  for (const key of SETTINGS) {
    if (!(key in entry.settings)) continue
    ;(inverse.settings as Record<string, unknown>)[key] = state[key]
    ;(next as Record<string, unknown>)[key] = entry.settings[key]
  }
  return { next, inverse }
}

export function createUndoHistory(set: StoreSet, get: StoreGet): UndoHistory {
  const undoStack: PendingEntry[] = []
  const redoStack: UndoEntry[] = []

  /** 操作が終わったら差分にする（操作は同期的なので、次のマイクロタスクには結果が出ている） */
  const finalize = (p: PendingEntry): UndoEntry => {
    if (!p.entry) p.entry = diffEntry(p.before, dataView(get()))
    return p.entry
  }
  const finalizeTop = () => {
    const top = undoStack[undoStack.length - 1]
    if (top) finalize(top)
  }

  /** `asOneUndo` の中では最初の 1 回だけ積む（複数の操作を 1 回の取り消しで戻す） */
  let undoGroupDepth = 0
  let undoGroupPushed = false
  const pushUndo = (label?: ToastText) => {
    if (undoGroupDepth > 0) {
      if (undoGroupPushed) return
      undoGroupPushed = true
    }
    finalizeTop()
    const pending: PendingEntry = { before: dataView(get()), entry: null }
    undoStack.push(pending)
    if (undoStack.length > MAX_UNDO) undoStack.shift()
    redoStack.length = 0
    queueMicrotask(() => {
      if (undoGroupDepth === 0) finalize(pending)
    })
    if (label) set({ undoBanner: { text: label, at: Date.now() } })
  }

  const isUnnamedJustCreated = (id: string) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task || task.title.trim()) return false
    const top = undoStack[undoStack.length - 1]
    if (!top) return false
    return finalize(top).rows.tasks?.get(id) === null
  }

  /** 取り消し・やり直しで戻した削除は、削除のトーストの一覧からも外す */
  const pruneDeletedTasks = () => {
    const stillDeleted = new Set(get().tasks.filter((t) => t.deletedAt).map((t) => t.id))
    const batches = get().recentDeletes
    if (batches.some((b) => b.ids.some((id) => !stillDeleted.has(id)))) {
      set({ recentDeletes: batches.map((b) => ({ ...b, ids: b.ids.filter((id) => stillDeleted.has(id)) })).filter((b) => b.ids.length > 0) })
    }
  }

  return {
    pushUndo,
    isUnnamedJustCreated,
    dropLastUndo: () => {
      undoStack.pop()
    },
    clear: () => {
      undoStack.length = 0
      redoStack.length = 0
    },
    actions: {
      asOneUndo: (fn) => {
        if (undoGroupDepth === 0) undoGroupPushed = false
        undoGroupDepth++
        try {
          fn()
        } finally {
          undoGroupDepth--
        }
      },
      undoLastOperation: () => {
        // 何も変えなかった操作（同じ値の保存など）は飛ばす
        while (undoStack.length > 0) {
          const entry = finalize(undoStack.pop()!)
          if (isEmpty(entry)) continue
          const { next, inverse } = applyEntry(dataView(get()), entry, new Date().toISOString())
          set(next)
          redoStack.push(inverse)
          if (redoStack.length > MAX_UNDO) redoStack.shift()
          pruneDeletedTasks()
          return true
        }
        return false
      },

      redoLastOperation: () => {
        const entry = redoStack.pop()
        if (!entry) return false
        const { next, inverse } = applyEntry(dataView(get()), entry, new Date().toISOString())
        set(next)
        undoStack.push({ before: dataView(get()), entry: inverse })
        if (undoStack.length > MAX_UNDO) undoStack.shift()
        pruneDeletedTasks()
        return true
      },
    },
  }
}
