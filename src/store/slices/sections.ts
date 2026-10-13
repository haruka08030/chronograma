/** セクション（リスト内の見出し） */
import i18n from '../../i18n/config'
import { newId } from '../../lib/id'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'

type SectionsActions = Pick<TaskState, 'setQuickAddSectionId' | 'addSection' | 'renameSection' | 'deleteSection' | 'reorderSections'>

export function createSectionsSlice({ set, get, undo }: SliceContext): SectionsActions {
  const { pushUndo } = undo
  return {
    setQuickAddSectionId: (id) => set({ quickAddSectionId: id }),

    addSection: (listId, name) => {
      const listSections = get().sections.filter((s) => s.listId === listId)
      const maxOrder = listSections.length === 0 ? -1 : Math.max(...listSections.map((s) => s.order))
      const sectionId = newId()
      pushUndo()
      set((s) => ({
        sections: [
          ...s.sections,
          {
            id: sectionId,
            listId,
            name: name?.trim() || i18n.t('sections.defaultName'),
            order: maxOrder + 1,
            updatedAt: new Date().toISOString(),
          },
        ],
      }))
      return sectionId
    },
    renameSection: (id, name) => {
      pushUndo()
      return set((s) => ({
        sections: s.sections.map((sec) =>
          sec.id === id ? { ...sec, name: name.trim() || sec.name, updatedAt: new Date().toISOString() } : sec,
        ),
      }))
    },
    deleteSection: (id) => {
      const name = get().sections.find((sec) => sec.id === id)?.name ?? ''
      pushUndo({ key: 'undo.sectionDeleted', params: { name } })
      // 中のタスクはセクションを外すだけで `updatedAt` は変えない（#357）。サーバーではセクションを消すと外部キー（on delete set null）が
      // 外すので、同期はその行を送らない（`pushListsTasksHabits`）。以前は中のタスクを全部書き直して送り、ほかの端末の編集とぶつかっていた
      return set((s) => ({
        sections: s.sections.filter((sec) => sec.id !== id),
        tasks: s.tasks.map((t) => (t.sectionId === id ? { ...t, sectionId: null } : t)),
      }))
    },
    reorderSections: (listId, orderedIds) => {
      pushUndo()
      const now = new Date().toISOString()
      const indexOf = new Map(orderedIds.map((id, i) => [id, i]))
      return set((s) => ({
        sections: s.sections.map((sec) => {
          if (sec.listId !== listId) return sec
          const idx = indexOf.get(sec.id) ?? -1
          return idx >= 0 && sec.order !== idx ? { ...sec, order: idx, updatedAt: now } : sec
        }),
      }))
    },
  }
}
