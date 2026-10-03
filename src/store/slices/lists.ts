/** リスト */
import { newId } from '../../lib/id'
import { paletteColors } from '../../lib/listColorPalettes'
import { INBOX_ID } from '../storeConstants'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'

type ListsActions = Pick<
  TaskState,
  | 'setListKind'
  | 'addList'
  | 'renameList'
  | 'updateListColor'
  | 'deleteList'
  | 'reorderList'
  | 'reorderLists'
>

export function createListsSlice({ set, get, undo }: SliceContext): ListsActions {
  const { pushUndo } = undo
  return {
    setListKind: (id, kind) => {
      pushUndo()
      set((s) => ({ lists: s.lists.map((l) => (l.id === id ? { ...l, kind, updatedAt: new Date().toISOString() } : l)) }))
    },
    addList: (name, kind) => {
      pushUndo()
      const maxOrder = Math.max(0, ...get().lists.map((l) => l.order))
      const cols = paletteColors(get().listColorPaletteId)
      const colorIdx = get().lists.length % cols.length
      set((s) => ({
        lists: [...s.lists, { id: newId(), name, color: cols[colorIdx], order: maxOrder + 1, kind: kind ?? 'tasks', updatedAt: new Date().toISOString() }],
      }))
    },
    renameList: (id, name) => {
      pushUndo()
      return set((s) => ({
        lists: s.lists.map((l) => (l.id === id ? { ...l, name, updatedAt: new Date().toISOString() } : l)),
      }))
    },
    updateListColor: (id, color) => {
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
        tasks: s.tasks.map((t) =>
          t.listId === id ? { ...t, listId: INBOX_ID, sectionId: null, updatedAt: now } : t,
        ),
        selectedListId:
          s.selectedListId === id ? INBOX_ID : s.selectedListId,
      }))
    },
    reorderList: (id, newOrder) => {
      pushUndo()
      return set((s) => ({
        lists: s.lists.map((l) =>
          l.id === id ? { ...l, order: newOrder, updatedAt: new Date().toISOString() } : l,
        ),
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
