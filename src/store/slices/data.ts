/** バックアップ・取り込み・同期の状態・ログアウト時の初期化 */
import type { Task } from '../../types/task'
import { newId } from '../../lib/id'
import { assignColorsInOrder } from '../../lib/logCategoryColors'
import { buildBackupPayload, parseBackupJson, withFreshStamps } from '../../lib/backupFormat'
import { parseTasksCsv } from '../../lib/importTasksCsv'
import { clearImportRollback, loadImportRollback, saveImportRollback } from '../../lib/importRollback'
import { restoreMissing } from '../../lib/autoBackup'
import { INBOX_ID } from '../storeConstants'
import { initialLists } from '../storeDefaults'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'
import { toDateKey } from '../../lib/dateKey'
import { TASK_DEFAULTS, withTaskDefaults } from '../../lib/taskDefaults'

type DataActions = Pick<
  TaskState,
  | 'setSyncState'
  | 'setSyncRejected'
  | 'setDataOwner'
  | 'resetLocalData'
  | 'backupJson'
  | 'restoreMissingFromBackup'
  | 'exportData'
  | 'importData'
  | 'restoreBeforeImport'
  | 'importTasksFromCsv'
>

export function createDataSlice({ set, get, undo }: SliceContext): DataActions {
  const { pushUndo } = undo
  return {
    setSyncState: (state, lastSyncedAt) =>
      set(lastSyncedAt ? { syncState: state, lastSyncedAt } : { syncState: state }),

    setSyncRejected: (rows) => set({ syncRejected: rows }),

    setDataOwner: (userId) => set({ dataOwner: userId }),

    resetLocalData: () => {
      // 取り消しの履歴や取り込み前の控えにも前の人のデータが残っている
      undo.clear()
      clearImportRollback()
      set({
        tasks: [],
        lists: initialLists(),
        sections: [],
        habits: [],
        recentDeletes: [],
        activeTimer: null,
        selectedListId: INBOX_ID,
        quickAddSectionId: null,
        completePromptTaskId: null,
        undoBanner: null,
        moveBannerText: null,
        syncState: 'idle',
        lastSyncedAt: null,
        dataOwner: null,
      })
    },

    backupJson: () => {
      const { tasks, lists, habits, listColorPaletteId, sections, timeLogTagPresets, logCategoryColors } = get()
      return JSON.stringify(
        buildBackupPayload({
          tasks,
          lists,
          habits,
          sections,
          listColorPaletteId,
          timeLogTagPresets,
          logCategoryColors,
        }),
      )
    },

    restoreMissingFromBackup: (json) => {
      const parsed = parseBackupJson(json)
      if (!parsed) return null
      const s = get()
      const { next, addedTasks } = restoreMissing(
        { lists: s.lists, sections: s.sections, tasks: s.tasks, habits: s.habits },
        parsed,
        new Date().toISOString(),
      )
      if (addedTasks === 0 && next.lists.length === s.lists.length && next.habits.length === s.habits.length) return 0
      pushUndo({ key: 'undo.restoredFromBackup', params: { count: addedTasks } })
      set(next)
      return addedTasks
    },

    exportData: () => {
      const data = JSON.stringify(JSON.parse(get().backupJson()), null, 2)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chronograma-backup-${toDateKey(new Date())}.json`
      a.click()
      URL.revokeObjectURL(url)
    },

    importData: (json) => {
      const read = parseBackupJson(json)
      if (!read) return false
      const parsed = withFreshStamps(read)
      // ⌘Z はメモリ上だけなので、再読み込みをまたげる控えも別に残す
      const before = get()
      saveImportRollback({
        json: JSON.stringify(
          buildBackupPayload({
            tasks: before.tasks,
            lists: before.lists,
            habits: before.habits,
            sections: before.sections,
            listColorPaletteId: before.listColorPaletteId,
            timeLogTagPresets: before.timeLogTagPresets,
            logCategoryColors: before.logCategoryColors,
          }),
        ),
        savedAt: new Date().toISOString(),
        taskCount: before.tasks.length,
      })
      // 取り込みは全置換なので、戻せることを画面に出す
      pushUndo({ key: 'undo.imported', params: { count: parsed.tasks.length } })
      set({
        tasks: parsed.tasks.map(withTaskDefaults),
        lists: parsed.lists,
        habits: parsed.habits,
        listColorPaletteId: parsed.listColorPaletteId ?? get().listColorPaletteId,
        sections: parsed.sections,
        timeLogTagPresets: parsed.timeLogTagPresets ?? [],
        logCategoryColors: parsed.logCategoryColors ?? assignColorsInOrder(parsed.timeLogTagPresets ?? []),
        quickAddSectionId: null,
      })
      return true
    },

    restoreBeforeImport: () => {
      const saved = loadImportRollback()
      if (!saved) return false
      const read = parseBackupJson(saved.json)
      if (!read) {
        clearImportRollback()
        return false
      }
      const parsed = withFreshStamps(read)
      pushUndo()
      set({
        tasks: parsed.tasks.map(withTaskDefaults),
        lists: parsed.lists,
        habits: parsed.habits,
        listColorPaletteId: parsed.listColorPaletteId ?? get().listColorPaletteId,
        sections: parsed.sections,
        timeLogTagPresets: parsed.timeLogTagPresets ?? [],
        logCategoryColors: parsed.logCategoryColors ?? assignColorsInOrder(parsed.timeLogTagPresets ?? []),
        quickAddSectionId: null,
      })
      clearImportRollback()
      return true
    },
    importTasksFromCsv: (csv) => {
      const { rows, skipped, errors } = parseTasksCsv(csv)
      if (errors.length > 0 || rows.length === 0) {
        return { imported: 0, skipped, errors }
      }
      const s = get()
      const listByName = new Map(
        s.lists.map((l) => [l.name.trim().toLowerCase(), l.id]),
      )
      const resolveListId = (name: string | null): string => {
        if (!name?.trim()) return INBOX_ID
        return listByName.get(name.trim().toLowerCase()) ?? INBOX_ID
      }
      let baseOrder = Math.max(0, ...s.tasks.map((t) => t.order))
      const now = new Date().toISOString()
      const newTasks: Task[] = rows.map((row) => {
        baseOrder += 1
        return {
          ...TASK_DEFAULTS,
          id: newId(),
          title: row.title,
          description: row.description,
          completed: row.completed,
          completedAt: row.completed ? now : null,
          createdAt: now,
          updatedAt: now,
          order: baseOrder,
          listId: resolveListId(row.listName),
          sectionId: null,
          parentId: null,
          dueDate: row.dueDate,
          dueTime: null,
          scheduledDate: null,
          endDate: null,
          startTime: null,
          endTime: null,
          location: null,
          priority: row.priority,
          tags: row.tags,
          recurrence: null,
          isTimeLog: false,
          archivedAt: null,
          deletedAt: null,
        }
      })
      // 結果は「元に戻す」付きの通知で知らせる（JSON の取り込みと同じ）
      pushUndo({ key: 'alert.csvImported', params: { count: newTasks.length, skipped } })
      set((st) => ({ tasks: [...st.tasks, ...newTasks] }))
      return { imported: newTasks.length, skipped, errors: [] }
    },
  }
}
