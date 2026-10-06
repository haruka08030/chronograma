/** リスト */
import { newId } from '../../lib/id'
import { GOOGLE_COLOR_HEXES } from '../../lib/googleColors'
import { INBOX_ID } from '../storeConstants'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'

type ListsActions = Pick<
  TaskState,
  'setListKind' | 'addList' | 'renameList' | 'updateListColor' | 'deleteList' | 'reorderList' | 'reorderLists'
>

export function createListsSlice({ set, get, undo }: SliceContext): ListsActions {
  const { pushUndo } = undo
  return {
    setListKind: (id, kind) => {
      // To-Do のリスト（フォルダ）は作らない。未分類の種類も変えない
      if (id === INBOX_ID || kind === 'tasks') return
      if (get().lists.find((l) => l.id === id)?.kind === kind) return
      pushUndo()
      set((s) => ({ lists: s.lists.map((l) => (l.id === id ? { ...l, kind, updatedAt: new Date().toISOString() } : l)) }))
    },
    addList: (name, kind) => {
      pushUndo()
      const maxOrder = Math.max(0, ...get().lists.map((l) => l.order))
      const colorIdx = get().lists.length % GOOGLE_COLOR_HEXES.length
      set((s) => ({
        lists: [
          ...s.lists,
          {
            id: newId(),
            name,
            color: GOOGLE_COLOR_HEXES[colorIdx],
            order: maxOrder + 1,
            kind: kind ?? 'checklist',
            updatedAt: new Date().toISOString(),
          },
        ],
      }))
    },
    renameList: (id, name) => {
      // 同じ値なら何もしない（取り消しの履歴を積まない）
      if (get().lists.find((l) => l.id === id)?.name === name) return
      pushUndo()
      return set((s) => ({
        lists: s.lists.map((l) => (l.id === id ? { ...l, name, updatedAt: new Date().toISOString() } : l)),
      }))
    },
    updateListColor: (id, color) => {
      if (get().lists.find((l) => l.id === id)?.color === color) return
      pushUndo()
      return set((s) => ({
        lists: s.lists.map((l) => (l.id === id ? { ...l, color, updatedAt: new Date().toISOString() } : l)),
      }))
    },
    deleteList: (id) => {
      if (id === INBOX_ID) return
      const name = get().lists.find((l) => l.id === id)?.name ?? ''
      pushUndo({ key: 'undo.listDeleted', params: { name } })
      const now = new Date().toISOString()
      set((s) => ({
        lists: s.lists.filter((l) => l.id !== id),
        sections: s.sections.filter((sec) => sec.listId !== id),
        tasks: s.tasks.map((t) => (t.listId === id ? { ...t, listId: INBOX_ID, sectionId: null, updatedAt: now } : t)),
        selectedListId: s.selectedListId === id ? INBOX_ID : s.selectedListId,
      }))
    },
    reorderList: (id, newOrder) => {
      pushUndo()
      return set((s) => ({
        lists: s.lists.map((l) => (l.id === id ? { ...l, order: newOrder, updatedAt: new Date().toISOString() } : l)),
      }))
    },
    reorderLists: (orderedIds) => {
      pushUndo()
      const now = new Date().toISOString()
      return set((s) => ({
        lists: s.lists.map((l) => {
          const idx = orderedIds.indexOf(l.id)
          return idx >= 0 && l.order !== idx ? { ...l, order: idx, updatedAt: now } : l
        }),
      }))
    },
  }
}
