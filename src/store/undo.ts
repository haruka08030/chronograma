/**
 * ⌘Z / ⌘⇧Z の履歴（メモリ上だけ。永続化しない）。ストアを作るときに 1 つ作り、各 slice へ `pushUndo` などを渡す
 */
import type { ChronogramaUndoSnapshot, TaskState } from './storeTypes'
import type { StoreGet, StoreSet } from './slices/sliceTypes'

const MAX_UNDO = 50

export interface UndoHistory {
  /**
   * 直前の状態を控える。`label` を渡した操作だけ「元に戻す」トーストを出す。
   * 削除は従来どおり `deletedTasks` 由来のトーストが出るので渡さない
   * （二重に出さないため）。
   */
  pushUndo: (label?: string) => void
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

export function createUndoHistory(set: StoreSet, get: StoreGet): UndoHistory {
  const undoStack: ChronogramaUndoSnapshot[] = []
  const redoStack: ChronogramaUndoSnapshot[] = []

  const captureUndoSnapshot = (): ChronogramaUndoSnapshot => {
    const s = get()
    return {
      tasks: structuredClone(s.tasks),
      lists: structuredClone(s.lists),
      sections: structuredClone(s.sections),
      habits: structuredClone(s.habits),
      deletedTasks: structuredClone(s.deletedTasks),
      listColorPaletteId: s.listColorPaletteId,
      timeLogTagPresets: structuredClone(s.timeLogTagPresets),
      logCategoryColors: structuredClone(s.logCategoryColors),
      selectedListId: s.selectedListId,
      selectedView: s.selectedView,
      quickAddSectionId: s.quickAddSectionId,
      sortByKey: { ...s.sortByKey },
      filterTag: s.filterTag,
      filterColor: s.filterColor,
      calendarMode: s.calendarMode,
      selectedCalendarDateKey: s.selectedCalendarDateKey,
      activeTimer: s.activeTimer ? structuredClone(s.activeTimer) : null,
    }
  }

  /** `asOneUndo` の中では最初の 1 回だけ積む（複数の操作を 1 回の取り消しで戻す） */
  let undoGroupDepth = 0
  let undoGroupPushed = false
  const pushUndo = (label?: string) => {
    if (undoGroupDepth > 0) {
      if (undoGroupPushed) return
      undoGroupPushed = true
    }
    undoStack.push(captureUndoSnapshot())
    if (undoStack.length > MAX_UNDO) undoStack.shift()
    redoStack.length = 0
    if (label) set({ undoBanner: { text: label, at: Date.now() } })
  }

  const isUnnamedJustCreated = (id: string) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task || task.title.trim()) return false
    const top = undoStack[undoStack.length - 1]
    return Boolean(top) && !top.tasks.some((t) => t.id === id)
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
        const snap = undoStack.pop()
        if (!snap) return false
        redoStack.push(captureUndoSnapshot())
        if (redoStack.length > MAX_UNDO) redoStack.shift()
        set({ ...snap })
        return true
      },

      redoLastOperation: () => {
        const snap = redoStack.pop()
        if (!snap) return false
        undoStack.push(captureUndoSnapshot())
        if (undoStack.length > MAX_UNDO) undoStack.shift()
        set({ ...snap })
        return true
      },
    },
  }
}
