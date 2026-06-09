import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import type { CalendarEvent } from '../types/calendarEvent'
import { inferHabitTimeMode, type Habit } from '../types/habit'
import { newId } from '../lib/id'
import {
  DEFAULT_LIST_COLOR_PALETTE_ID,
  paletteColors,
  normalizeListColorPaletteId,
  type ListColorPaletteId,
} from '../lib/listColorPalettes'
import { normalizeTimeLogTagPresetList } from '../lib/tagColors'
import { addDays, addWeeks, addMonths, addYears, format } from 'date-fns'
import i18n from '../i18n/config'
import { isListedTimeLog } from '../lib/timeLogTask'
import { canNestUnder } from '../lib/taskDepth'
import { buildBackupPayload, parseBackupJson } from '../lib/backupFormat'
import { parseTasksCsv } from '../lib/importTasksCsv'

const PERSIST_STORAGE_KEY = 'chronograma-storage'
const LEGACY_PERSIST_STORAGE_KEY = 'tickdo-storage'

/** Renamed app: copy persisted state once from the old localStorage key. */
function migrateLegacyPersistKey(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const legacy = localStorage.getItem(LEGACY_PERSIST_STORAGE_KEY)
    if (!legacy || localStorage.getItem(PERSIST_STORAGE_KEY)) return
    localStorage.setItem(PERSIST_STORAGE_KEY, legacy)
    localStorage.removeItem(LEGACY_PERSIST_STORAGE_KEY)
  } catch {
    // ignore quota / private mode
  }
}
migrateLegacyPersistKey()

const INBOX_ID = '__inbox__'

export type CalendarMode = 'month' | 'week'

export type SmartView =
  | 'all'
  | 'today'
  | 'upcoming'
  | 'overdue'
  | 'calendar'
  | 'plan-vs-actual'
  | 'activity-log'
  | 'stats'
  | 'habits'
  | 'settings'

/** 設定画面を開いたときの一度きりのスクロール先（永続化しない） */
export type SettingsScrollTarget = 'appearance' | 'account'

export type SortMode = 'manual' | 'dueDate' | 'priority' | 'title' | 'createdAt'

export type { ListColorPaletteId }
export {
  DEFAULT_LIST_COLOR_PALETTE_ID,
  paletteColors,
  LIST_COLOR_PALETTES,
  normalizeListColorPaletteId,
} from '../lib/listColorPalettes'

const defaultPaletteColors = paletteColors(DEFAULT_LIST_COLOR_PALETTE_ID)

export interface ActiveTimer {
  taskTitle: string
  startedAt: string
  tags: string[]
}

interface TaskState {
  tasks: Task[]
  lists: TaskList[]
  selectedListId: string | null
  selectedView: SmartView | null
  /** 設定を開いた直後のみ使い、スクロール後にクリア */
  settingsScrollTarget: SettingsScrollTarget | null
  /** カレンダーハブ内の月 / 週表示（永続化） */
  calendarMode: CalendarMode
  /** カレンダーハブ・習慣一覧などで共有するフォーカス日（yyyy-MM-dd） */
  selectedCalendarDateKey: string
  theme: 'light' | 'dark'
  searchQuery: string
  sortMode: SortMode
  deletedTasks: { task: Task; deletedAt: number }[]
  quickAddRequested: boolean
  filterTag: string | null
  notificationsEnabled: boolean
  listColorPaletteId: ListColorPaletteId
  /** 活動ログのタグ候補（設定で編集、順序はタイムライン色の優先度に使う） */
  timeLogTagPresets: string[]

  calendarEvents: CalendarEvent[]
  googleConnected: boolean
  googleAccessToken: string | null

  activeTimer: ActiveTimer | null

  habits: Habit[]

  sections: ListSection[]
  /** Quick Add 時に付与するセクション（そのリストを開いているときのみ有効） */
  quickAddSectionId: string | null
  setQuickAddSectionId: (id: string | null) => void

  addSection: (listId: string, name?: string) => string
  renameSection: (id: string, name: string) => void
  deleteSection: (id: string) => void
  reorderSections: (listId: string, orderedIds: string[]) => void
  /** 手動ソート: 表示中のルート未完了タスクの順と order を一致させ、任意で複数ルートの sectionId を更新 */
  reorderManualRootTasks: (
    orderedTaskIds: string[],
    sectionUpdate?: { taskIds: string[]; sectionId: string | null },
  ) => void
  /**
   * サブタスクを別のルート親の下へ移動、または同一親内で順序変更。
   * `insertBeforeChildId` が兄弟に存在すればその手前、なければ末尾。
   */
  moveSubtaskInList: (
    taskId: string,
    newParentId: string,
    insertBeforeChildId: string | null,
  ) => void
  /** ルートタスクを別タスクの子へ（TickTick のネスト DnD）。`insertBeforeChildId` なしは末尾 */
  nestRootUnderParent: (
    taskId: string,
    parentId: string,
    insertBeforeChildId: string | null,
  ) => void

  toggleTheme: () => void
  setListColorPalette: (id: ListColorPaletteId) => void
  setTimeLogTagPresets: (presets: string[]) => void

  selectList: (id: string) => void
  selectView: (view: SmartView) => void
  openSettingsWithScroll: (target: SettingsScrollTarget) => void
  clearSettingsScrollTarget: () => void
  setCalendarMode: (mode: CalendarMode) => void
  setSelectedCalendarDateKey: (key: string) => void
  setSearchQuery: (q: string) => void
  setSortMode: (mode: SortMode) => void
  requestQuickAdd: () => void
  clearQuickAddRequest: () => void
  setFilterTag: (tag: string | null) => void

  setCalendarEvents: (events: CalendarEvent[]) => void
  setGoogleConnected: (connected: boolean) => void
  setGoogleAccessToken: (token: string | null) => void

  addHabit: (fields: Pick<Habit, 'title' | 'color' | 'timeMode' | 'startTime' | 'endTime' | 'frequency'>) => void
  updateHabit: (id: string, patch: Partial<Pick<Habit, 'title' | 'color' | 'timeMode' | 'startTime' | 'endTime' | 'frequency'>>) => void
  deleteHabit: (id: string) => void
  toggleHabitDate: (habitId: string, dateKey: string) => void

  addList: (name: string) => void
  renameList: (id: string, name: string) => void
  updateListColor: (id: string, color: string) => void
  deleteList: (id: string) => void
  reorderList: (id: string, newOrder: number) => void
  reorderLists: (orderedIds: string[]) => void

  addTask: (title: string, listId?: string, parentId?: string) => string | undefined
  addTaskAfter: (afterTaskId: string, title: string) => string | undefined
  addTaskWithDate: (title: string, dueDate: string, listId?: string) => void
  addTaskWithTime: (title: string, dueDate: string, startTime: string, endTime: string, listId?: string) => void
  addCompletedTaskWithTime: (title: string, dueDate: string, startTime: string, endTime: string) => void
  addTimeLog: (
    title: string,
    date: string,
    startTime: string,
    endTime: string,
    tags?: string[],
    description?: string,
    endDate?: string | null,
  ) => void
  startTimer: (title: string, tags?: string[]) => void
  stopTimer: () => void
  toggleTask: (id: string) => void
  updateTask: (
    id: string,
    patch: Partial<
      Pick<
        Task,
        | 'title'
        | 'description'
        | 'dueDate'
        | 'endDate'
        | 'startTime'
        | 'endTime'
        | 'priority'
        | 'tags'
        | 'listId'
        | 'parentId'
        | 'recurrence'
        | 'isTimeLog'
        | 'completed'
        | 'completedAt'
        | 'sectionId'
      >
    >,
  ) => void
  bulkUpdateTasks: (
    ids: string[],
    patch: Partial<Pick<Task, 'listId' | 'priority' | 'dueDate' | 'sectionId'>>,
  ) => void
  deleteTask: (id: string) => void
  deleteTasks: (ids: string[]) => void
  undoDelete: () => void
  /** 直前のデータ変更を 1 段階戻す（⌘Z）。成功時 true */
  undoLastOperation: () => boolean
  clearDeletedTasks: () => void
  reorderTask: (id: string, newOrder: number) => void
  reorderTasks: (orderedIds: string[]) => void
  /** ルートタスクを別リストへ。子タスクは listId のみ追随。末尾 order。同一リストは no-op */
  moveTaskToList: (
    taskId: string,
    listId: string,
  ) => { moved: boolean; listName?: string; listId?: string }
  /** 複数ルートを同一リストへ（相対順維持・末尾に連続 order）。各ルートの子は追随 */
  moveTasksToList: (
    rootTaskIds: string[],
    listId: string,
  ) => { moved: boolean; listName?: string; listId?: string; count?: number }

  moveBannerText: string | null
  showMoveBanner: (text: string) => void
  clearMoveBanner: () => void

  /** タスクドラッグ中のドロップ先リスト（ホバー風ハイライト用・永続化しない） */
  taskDragHoverListId: string | null
  setTaskDragHoverListId: (id: string | null) => void

  toggleNotifications: () => void
  exportData: () => void
  importData: (json: string) => boolean
  /** CSV からタスクを追加（既存データは保持） */
  importTasksFromCsv: (csv: string) => { imported: number; skipped: number; errors: string[] }
}

const defaultInbox: TaskList = {
  id: INBOX_ID,
  name: '未分類',
  color: defaultPaletteColors[0],
  order: 0,
}

export const INBOX_LIST_ID = INBOX_ID

function nextDueDate(current: string, recurrence: NonNullable<Task['recurrence']>): string {
  const d = new Date(current + 'T00:00:00')
  switch (recurrence.type) {
    case 'daily': return format(addDays(d, recurrence.interval), 'yyyy-MM-dd')
    case 'weekly': return format(addWeeks(d, recurrence.interval), 'yyyy-MM-dd')
    case 'monthly': return format(addMonths(d, recurrence.interval), 'yyyy-MM-dd')
    case 'yearly': return format(addYears(d, recurrence.interval), 'yyyy-MM-dd')
  }
}

/** 子孫（任意の深さ）を含む。一括削除・リスト移動で親子の整合を取る */
/** `nodeId` の祖先チェーンに `possibleAncestorId` が現れるか（自身含む） */
function isAncestorInChain(tasks: Task[], possibleAncestorId: string, nodeId: string): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  let cur: string | null = nodeId
  for (let i = 0; i < 10_000 && cur; i++) {
    if (cur === possibleAncestorId) return true
    cur = byId.get(cur)?.parentId ?? null
  }
  return false
}

function siblingIdsOrdered(tasks: Task[], parentId: string | null, excludeTaskId?: string): string[] {
  return tasks
    .filter((t) => t.parentId === parentId && (!excludeTaskId || t.id !== excludeTaskId))
    .sort((a, b) => a.order - b.order)
    .map((t) => t.id)
}

function expandDescendantIds(rootIds: Iterable<string>, allTasks: Task[]): Set<string> {
  const out = new Set(rootIds)
  let added = true
  while (added) {
    added = false
    for (const t of allTasks) {
      if (t.parentId && out.has(t.parentId) && !out.has(t.id)) {
        out.add(t.id)
        added = true
      }
    }
  }
  return out
}

function applyTaskPatch(
  task: Task,
  patch: Partial<
    Pick<
      Task,
      | 'title'
      | 'description'
      | 'dueDate'
      | 'endDate'
      | 'startTime'
      | 'endTime'
      | 'priority'
      | 'tags'
      | 'listId'
      | 'parentId'
      | 'recurrence'
      | 'isTimeLog'
      | 'completed'
      | 'completedAt'
      | 'sectionId'
    >
  >,
): Task {
  const now = new Date().toISOString()
  const applied = { ...task, ...patch, updatedAt: now }
  if (patch.completed === true) {
    if (!task.completed) {
      applied.completedAt = typeof patch.completedAt === 'string' ? patch.completedAt : now
    } else if (patch.completedAt !== undefined) {
      applied.completedAt = patch.completedAt
    }
  } else if (patch.completed === false) {
    applied.completedAt = null
  } else if (patch.completedAt !== undefined) {
    applied.completedAt = patch.completedAt
  }
  if (patch.listId !== undefined && patch.listId !== task.listId) {
    applied.sectionId = null
  }
  if (patch.dueDate === null) {
    applied.startTime = null
    applied.endTime = null
    applied.endDate = null
    applied.recurrence = null
  }
  return applied
}

/** ⌘Z 用。永続化しない */
interface ChronogramaUndoSnapshot {
  tasks: Task[]
  lists: TaskList[]
  sections: ListSection[]
  habits: Habit[]
  deletedTasks: { task: Task; deletedAt: number }[]
  listColorPaletteId: ListColorPaletteId
  timeLogTagPresets: string[]
  selectedListId: string | null
  selectedView: SmartView | null
  quickAddSectionId: string | null
  sortMode: SortMode
  filterTag: string | null
  calendarMode: CalendarMode
  selectedCalendarDateKey: string
  activeTimer: ActiveTimer | null
}

function orderForNewSiblingAtFront(
  tasks: Task[],
  listId: string,
  parentId: string | null,
  sectionId: string | null = null,
): number {
  const siblings = tasks.filter((t) => {
    if (t.listId !== listId || t.parentId !== parentId) return false
    if (parentId !== null) return true
    return (t.sectionId ?? null) === (sectionId ?? null)
  })
  if (siblings.length === 0) return 0
  return Math.min(...siblings.map((t) => t.order)) - 1
}

function makeTask(
  fields: {
    title: string
    listId: string
    sectionId?: string | null
    dueDate?: string | null
    endDate?: string | null
    startTime?: string | null
    endTime?: string | null
    isTimeLog?: boolean
    completed?: boolean
    tags?: string[]
  },
  order: number,
): Task {
  const now = new Date().toISOString()
  return {
    id: newId(),
    title: fields.title,
    description: '',
    completed: fields.completed ?? false,
    completedAt: fields.completed === true ? now : null,
    createdAt: now,
    updatedAt: now,
    order,
    listId: fields.listId,
    sectionId: fields.sectionId ?? null,
    parentId: null,
    dueDate: fields.dueDate ?? null,
    endDate: fields.endDate ?? null,
    startTime: fields.startTime ?? null,
    endTime: fields.endTime ?? null,
    priority: 'none',
    tags: fields.tags ?? [],
    recurrence: null,
    isTimeLog: fields.isTimeLog ?? false,
  }
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => {
      const undoStack: ChronogramaUndoSnapshot[] = []
      const MAX_UNDO = 50

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
          selectedListId: s.selectedListId,
          selectedView: s.selectedView,
          quickAddSectionId: s.quickAddSectionId,
          sortMode: s.sortMode,
          filterTag: s.filterTag,
          calendarMode: s.calendarMode,
          selectedCalendarDateKey: s.selectedCalendarDateKey,
          activeTimer: s.activeTimer ? structuredClone(s.activeTimer) : null,
        }
      }

      const pushUndo = () => {
        undoStack.push(captureUndoSnapshot())
        if (undoStack.length > MAX_UNDO) undoStack.shift()
      }

      return {
      tasks: [],
      lists: [defaultInbox],
      selectedListId: INBOX_ID,
      selectedView: null,
      settingsScrollTarget: null as SettingsScrollTarget | null,
      calendarMode: 'month' as CalendarMode,
      selectedCalendarDateKey: format(new Date(), 'yyyy-MM-dd'),
      theme: 'light',
      searchQuery: '',
      sortMode: 'manual' as SortMode,
      deletedTasks: [],
      moveBannerText: null as string | null,
      taskDragHoverListId: null as string | null,
      quickAddRequested: false,
      filterTag: null,
      notificationsEnabled: false,
      listColorPaletteId: DEFAULT_LIST_COLOR_PALETTE_ID,
      timeLogTagPresets: [] as string[],

      calendarEvents: [],
      googleConnected: false,
      googleAccessToken: null,
      activeTimer: null,

      habits: [],

      sections: [] as ListSection[],
      quickAddSectionId: null as string | null,

      setQuickAddSectionId: (id) => set({ quickAddSectionId: id }),

      addSection: (listId, name) => {
        const listSections = get().sections.filter((s) => s.listId === listId)
        const maxOrder = listSections.length === 0 ? -1 : Math.max(...listSections.map((s) => s.order))
        const sectionId = newId()
        pushUndo()
        set((s) => ({
          sections: [
            ...s.sections,
            { id: sectionId, listId, name: name?.trim() || i18n.t('sections.defaultName'), order: maxOrder + 1 },
          ],
        }))
        return sectionId
      },
      renameSection: (id, name) => {
        pushUndo()
        return set((s) => ({
          sections: s.sections.map((sec) => (sec.id === id ? { ...sec, name: name.trim() || sec.name } : sec)),
        }))
      },
      deleteSection: (id) => {
        pushUndo()
        return set((s) => ({
          sections: s.sections.filter((sec) => sec.id !== id),
          tasks: s.tasks.map((t) => (t.sectionId === id ? { ...t, sectionId: null, updatedAt: new Date().toISOString() } : t)),
        }))
      },
      reorderSections: (listId, orderedIds) => {
        pushUndo()
        return set((s) => ({
          sections: s.sections.map((sec) => {
            if (sec.listId !== listId) return sec
            const idx = orderedIds.indexOf(sec.id)
            return idx >= 0 ? { ...sec, order: idx } : sec
          }),
        }))
      },

      reorderManualRootTasks: (orderedTaskIds, sectionUpdate) => {
        const now = new Date().toISOString()
        const sectionSet =
          sectionUpdate && sectionUpdate.taskIds.length > 0
            ? new Set(sectionUpdate.taskIds)
            : null
        pushUndo()
        set((s) => ({
          tasks: s.tasks.map((t) => {
            const idx = orderedTaskIds.indexOf(t.id)
            if (idx < 0) return t
            let next: Task = { ...t, order: idx, updatedAt: now }
            if (sectionSet?.has(t.id) && sectionUpdate) {
              next = { ...next, sectionId: sectionUpdate.sectionId }
            }
            return next
          }),
        }))
      },

      moveSubtaskInList: (taskId, newParentId, insertBeforeChildId) => {
        const s0 = get()
        const moved = s0.tasks.find((t) => t.id === taskId)
        const parent = s0.tasks.find((t) => t.id === newParentId)
        if (!moved || moved.parentId == null) return
        if (!parent) return
        if (taskId === newParentId) return
        if (isListedTimeLog(moved) || isListedTimeLog(parent)) return
        if (isAncestorInChain(s0.tasks, taskId, newParentId)) return
        if (moved.parentId !== newParentId && !canNestUnder(s0.tasks, taskId, newParentId)) return

        pushUndo()
        set((s) => {
          const now = new Date().toISOString()
          const oldParentId = moved.parentId

          let newChildOrder = siblingIdsOrdered(s.tasks, newParentId, taskId)
          if (insertBeforeChildId && newChildOrder.includes(insertBeforeChildId)) {
            newChildOrder.splice(newChildOrder.indexOf(insertBeforeChildId), 0, taskId)
          } else {
            newChildOrder = [...newChildOrder, taskId]
          }

          const orderAtNewParent = new Map<string, number>()
          newChildOrder.forEach((id, i) => orderAtNewParent.set(id, i))

          const orderAtOldParent = new Map<string, number>()
          if (oldParentId !== newParentId) {
            const oldSiblings = siblingIdsOrdered(s.tasks, oldParentId, taskId)
            oldSiblings.forEach((id, i) => orderAtOldParent.set(id, i))
          }

          const subtree = expandDescendantIds([taskId], s.tasks)
          const listIdChanged = parent.listId !== moved.listId

          return {
            tasks: s.tasks.map((t) => {
              if (t.id === taskId) {
                return {
                  ...t,
                  parentId: newParentId,
                  listId: parent.listId,
                  sectionId: null,
                  order: orderAtNewParent.get(taskId) ?? 0,
                  updatedAt: now,
                }
              }
              if (listIdChanged && subtree.has(t.id) && t.id !== taskId) {
                return { ...t, listId: parent.listId, sectionId: null, updatedAt: now }
              }
              if (orderAtNewParent.has(t.id) && t.parentId === newParentId) {
                const o = orderAtNewParent.get(t.id)
                if (o === undefined || o === t.order) return t
                return { ...t, order: o, updatedAt: now }
              }
              if (oldParentId !== newParentId && orderAtOldParent.has(t.id) && t.parentId === oldParentId) {
                const o = orderAtOldParent.get(t.id)
                if (o === undefined || o === t.order) return t
                return { ...t, order: o, updatedAt: now }
              }
              return t
            }),
          }
        })
      },

      nestRootUnderParent: (taskId, parentId, insertBeforeChildId) => {
        const s0 = get()
        const moved = s0.tasks.find((t) => t.id === taskId)
        const parent = s0.tasks.find((t) => t.id === parentId)
        if (!moved || moved.parentId !== null) return
        if (!parent) return
        if (taskId === parentId) return
        if (isListedTimeLog(moved) || isListedTimeLog(parent)) return
        if (isAncestorInChain(s0.tasks, taskId, parentId)) return
        if (!canNestUnder(s0.tasks, taskId, parentId)) return

        pushUndo()
        set((s) => {
          const now = new Date().toISOString()
          const subtree = expandDescendantIds([taskId], s.tasks)
          const listIdChanged = parent.listId !== moved.listId

          let newChildOrder = siblingIdsOrdered(s.tasks, parentId)
          if (insertBeforeChildId && newChildOrder.includes(insertBeforeChildId)) {
            newChildOrder.splice(newChildOrder.indexOf(insertBeforeChildId), 0, taskId)
          } else {
            newChildOrder = [...newChildOrder, taskId]
          }

          const orderAtNewParent = new Map<string, number>()
          newChildOrder.forEach((id, i) => orderAtNewParent.set(id, i))

          return {
            tasks: s.tasks.map((t) => {
              if (t.id === taskId) {
                return {
                  ...t,
                  parentId,
                  listId: parent.listId,
                  sectionId: null,
                  order: orderAtNewParent.get(taskId) ?? 0,
                  updatedAt: now,
                }
              }
              if (listIdChanged && subtree.has(t.id) && t.id !== taskId) {
                return { ...t, listId: parent.listId, sectionId: null, updatedAt: now }
              }
              if (orderAtNewParent.has(t.id) && t.parentId === parentId && t.id !== taskId) {
                const o = orderAtNewParent.get(t.id)
                if (o === undefined || o === t.order) return t
                return { ...t, order: o, updatedAt: now }
              }
              return t
            }),
          }
        })
      },

      setCalendarEvents: (events) => set({ calendarEvents: events }),
      setGoogleConnected: (connected) => set({ googleConnected: connected }),
      setGoogleAccessToken: (token) => set({ googleAccessToken: token }),

      addHabit: (fields) => {
        pushUndo()
        const now = new Date().toISOString()
        const habit: Habit = {
          id: newId(),
          title: fields.title,
          color: fields.color,
          timeMode: fields.timeMode,
          startTime: fields.startTime,
          endTime: fields.endTime,
          frequency: fields.frequency,
          createdAt: now,
          updatedAt: now,
          completedDates: [],
        }
        set((s) => ({ habits: [...s.habits, habit] }))
      },
      updateHabit: (id, patch) => {
        pushUndo()
        return set((s) => ({
          habits: s.habits.map((h) =>
            h.id === id ? { ...h, ...patch, updatedAt: new Date().toISOString() } : h,
          ),
        }))
      },
      deleteHabit: (id) => {
        pushUndo()
        return set((s) => ({ habits: s.habits.filter((h) => h.id !== id) }))
      },
      toggleHabitDate: (habitId, dateKey) => {
        pushUndo()
        return set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== habitId) return h
            const has = h.completedDates.includes(dateKey)
            const completedDates = has
              ? h.completedDates.filter((d) => d !== dateKey)
              : [...h.completedDates, dateKey].sort()
            return { ...h, completedDates, updatedAt: new Date().toISOString() }
          }),
        }))
      },

      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

      setListColorPalette: (id) => {
        pushUndo()
        set({ listColorPaletteId: id })
      },

      setTimeLogTagPresets: (presets) => {
        pushUndo()
        set({ timeLogTagPresets: normalizeTimeLogTagPresetList(presets) })
      },

      selectList: (id) => set({ selectedListId: id, selectedView: null, quickAddSectionId: null, settingsScrollTarget: null }),
      selectView: (view) =>
        set({
          selectedView: view,
          selectedListId: null,
          quickAddSectionId: null,
          settingsScrollTarget: null,
        }),
      openSettingsWithScroll: (target) =>
        set({
          selectedView: 'settings',
          selectedListId: null,
          quickAddSectionId: null,
          settingsScrollTarget: target,
        }),
      clearSettingsScrollTarget: () => set({ settingsScrollTarget: null }),
      setCalendarMode: (mode) => {
        pushUndo()
        set({ calendarMode: mode })
      },
      setSelectedCalendarDateKey: (key) => {
        pushUndo()
        set({ selectedCalendarDateKey: key })
      },
      setSearchQuery: (q) => set({ searchQuery: q }),
      setSortMode: (mode) => {
        pushUndo()
        set({ sortMode: mode })
      },
      setFilterTag: (tag) => {
        pushUndo()
        set({ filterTag: tag })
      },
      requestQuickAdd: () => {
        const s = get()
        if (s.selectedView !== null) {
          set({ selectedListId: s.selectedListId ?? INBOX_ID, selectedView: null, quickAddRequested: true })
        } else {
          set({ quickAddRequested: true })
        }
      },
      clearQuickAddRequest: () => set({ quickAddRequested: false }),

      addList: (name) => {
        pushUndo()
        const maxOrder = Math.max(0, ...get().lists.map((l) => l.order))
        const cols = paletteColors(get().listColorPaletteId)
        const colorIdx = get().lists.length % cols.length
        set((s) => ({
          lists: [...s.lists, { id: newId(), name, color: cols[colorIdx], order: maxOrder + 1 }],
        }))
      },
      renameList: (id, name) => {
        pushUndo()
        return set((s) => ({
          lists: s.lists.map((l) => (l.id === id ? { ...l, name } : l)),
        }))
      },
      updateListColor: (id, color) => {
        pushUndo()
        return set((s) => ({
          lists: s.lists.map((l) => (l.id === id ? { ...l, color } : l)),
        }))
      },
      deleteList: (id) => {
        if (id === INBOX_ID) return
        pushUndo()
        set((s) => ({
          lists: s.lists.filter((l) => l.id !== id),
          sections: s.sections.filter((sec) => sec.listId !== id),
          tasks: s.tasks.map((t) =>
            t.listId === id ? { ...t, listId: INBOX_ID, sectionId: null } : t,
          ),
          selectedListId:
            s.selectedListId === id ? INBOX_ID : s.selectedListId,
        }))
      },
      reorderList: (id, newOrder) => {
        pushUndo()
        return set((s) => ({
          lists: s.lists.map((l) =>
            l.id === id ? { ...l, order: newOrder } : l,
          ),
        }))
      },
      reorderLists: (orderedIds) => {
        pushUndo()
        return set((s) => ({
          lists: s.lists.map((l) => {
            const idx = orderedIds.indexOf(l.id)
            return idx >= 0 ? { ...l, order: idx } : l
          }),
        }))
      },

      addTask: (title, listId, parentId) => {
        const s = get()
        const pid = parentId ?? null
        const parent = pid ? s.tasks.find((t) => t.id === pid) : null
        const targetList = parent?.listId ?? listId ?? s.selectedListId ?? INBOX_ID
        const q = s.quickAddSectionId
        const sectionResolved =
          pid === null &&
          targetList === s.selectedListId &&
          q !== null &&
          (q === '' || s.sections.some((sec) => sec.id === q && sec.listId === targetList))
            ? q === ''
              ? null
              : q
            : null
        const ord = orderForNewSiblingAtFront(s.tasks, targetList, pid, pid === null ? sectionResolved : null)
        const task = makeTask(
          { title, listId: targetList, sectionId: pid === null ? sectionResolved ?? undefined : undefined },
          ord,
        )
        if (parentId) task.parentId = parentId
        pushUndo()
        set((st) => ({ tasks: [...st.tasks, task] }))
        return task.id
      },
      addTaskAfter: (afterTaskId, title) => {
        const s = get()
        const afterTask = s.tasks.find((t) => t.id === afterTaskId)
        if (!afterTask) return undefined
        const siblings = s.tasks
          .filter((t) => {
            if (t.listId !== afterTask.listId || t.parentId !== afterTask.parentId) return false
            if (afterTask.parentId !== null) return true
            return (t.sectionId ?? null) === (afterTask.sectionId ?? null)
          })
          .sort((a, b) => a.order - b.order)
        const afterIndex = siblings.findIndex((t) => t.id === afterTaskId)
        if (afterIndex < 0) return undefined
        const nextSibling = siblings[afterIndex + 1]
        const order = nextSibling
          ? (afterTask.order + nextSibling.order) / 2
          : afterTask.order + 1
        const task = makeTask(
          {
            title,
            listId: afterTask.listId,
            sectionId: afterTask.parentId === null ? afterTask.sectionId : undefined,
          },
          order,
        )
        if (afterTask.parentId) task.parentId = afterTask.parentId
        pushUndo()
        set((st) => ({ tasks: [...st.tasks, task] }))
        return task.id
      },
      addTaskWithDate: (title, dueDate, listId) => {
        pushUndo()
        const targetList = listId ?? get().selectedListId ?? INBOX_ID
        const ord = orderForNewSiblingAtFront(get().tasks, targetList, null)
        set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: targetList, dueDate }, ord)] }))
      },
      addTaskWithTime: (title, dueDate, startTime, endTime, listId) => {
        pushUndo()
        const targetList = listId ?? get().selectedListId ?? INBOX_ID
        const ord = orderForNewSiblingAtFront(get().tasks, targetList, null)
        set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: targetList, dueDate, startTime, endTime }, ord)] }))
      },
      addCompletedTaskWithTime: (title, dueDate, startTime, endTime) => {
        pushUndo()
        const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
        set((s) => ({
          tasks: [
            ...s.tasks,
            makeTask({ title, listId: INBOX_ID, dueDate, startTime, endTime, isTimeLog: true, completed: true }, maxOrder + 1),
          ],
        }))
      },
      addTimeLog: (title, date, startTime, endTime, tags, description, endDateArg) => {
        const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
        const endDate =
          endDateArg !== undefined && endDateArg !== null && endDateArg !== date ? endDateArg : null
        const log = makeTask(
          {
            title,
            listId: INBOX_ID,
            dueDate: date,
            endDate,
            startTime,
            endTime,
            isTimeLog: true,
            completed: true,
            tags,
          },
          maxOrder + 1,
        )
        if (description !== undefined) {
          log.description = description
        }
        pushUndo()
        set((s) => ({ tasks: [...s.tasks, log] }))
      },
      startTimer: (title, tags) => {
        set({ activeTimer: { taskTitle: title, startedAt: new Date().toISOString(), tags: tags ?? [] } })
      },
      stopTimer: () => {
        const timer = get().activeTimer
        if (!timer) return
        const start = new Date(timer.startedAt)
        const end = new Date()
        const dueDate = format(start, 'yyyy-MM-dd')
        const endDay = format(end, 'yyyy-MM-dd')
        const endDate = endDay !== dueDate ? endDay : null
        const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
        const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
        const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
        pushUndo()
        set((s) => ({
          activeTimer: null,
          tasks: [
            ...s.tasks,
            makeTask({
              title: timer.taskTitle,
              listId: INBOX_ID,
              dueDate,
              endDate,
              startTime,
              endTime,
              isTimeLog: true,
              completed: true,
              tags: timer.tags,
            }, maxOrder + 1),
          ],
        }))
      },
      toggleTask: (id) => {
        const s0 = get()
        const task = s0.tasks.find((t) => t.id === id)
        if (!task) return
        pushUndo()
        set((s) => {
          const tsk = s.tasks.find((t) => t.id === id)
          if (!tsk) return s
          const willComplete = !tsk.completed
          const now = new Date().toISOString()
          let newTasks = s.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  completed: willComplete,
                  updatedAt: now,
                  completedAt: willComplete ? now : null,
                }
              : t,
          )
          if (willComplete && tsk.recurrence && tsk.dueDate) {
            const next: Task = {
              ...tsk,
              id: newId(),
              completed: false,
              completedAt: null,
              dueDate: nextDueDate(tsk.dueDate, tsk.recurrence),
              createdAt: now,
              updatedAt: now,
            }
            newTasks = [...newTasks, next]
          }
          return { tasks: newTasks }
        })
      },
      updateTask: (id, patch) => {
        pushUndo()
        return set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? applyTaskPatch(t, patch) : t)),
        }))
      },
      bulkUpdateTasks: (ids, patch) => {
        if (ids.length === 0) return
        pushUndo()
        set((s) => {
          const selected = new Set(ids)
          const listTargets =
            patch.listId !== undefined ? expandDescendantIds(selected, s.tasks) : null
          return {
            tasks: s.tasks.map((t) => {
              const listHit = listTargets?.has(t.id)
              const prioHit = patch.priority !== undefined && selected.has(t.id)
              const dueHit = patch.dueDate !== undefined && selected.has(t.id)
              const secHit = patch.sectionId !== undefined && selected.has(t.id)
              if (!listHit && !prioHit && !dueHit && !secHit) return t
              const piece: Partial<Pick<Task, 'listId' | 'priority' | 'dueDate' | 'sectionId'>> = {}
              if (listHit && patch.listId !== undefined) piece.listId = patch.listId
              if (prioHit) piece.priority = patch.priority
              if (dueHit) piece.dueDate = patch.dueDate
              if (secHit) piece.sectionId = patch.sectionId
              return applyTaskPatch(t, piece)
            }),
          }
        })
      },
      deleteTask: (id) => {
        pushUndo()
        return set((s) => {
          const del = expandDescendantIds([id], s.tasks)
          const toDelete = s.tasks.filter((t) => del.has(t.id))
          const deletedAt = Date.now()
          return {
            tasks: s.tasks.filter((t) => !del.has(t.id)),
            deletedTasks: [
              ...s.deletedTasks,
              ...toDelete.map((t) => ({ task: t, deletedAt })),
            ],
          }
        })
      },
      deleteTasks: (ids) => {
        if (ids.length === 0) return
        const s0 = get()
        const del = expandDescendantIds(ids, s0.tasks)
        const toDelete = s0.tasks.filter((t) => del.has(t.id))
        if (toDelete.length === 0) return
        pushUndo()
        const deletedAt = Date.now()
        set((s) => ({
          tasks: s.tasks.filter((t) => !del.has(t.id)),
          deletedTasks: [
            ...s.deletedTasks,
            ...toDelete.map((t) => ({ task: t, deletedAt })),
          ],
        }))
      },
      undoDelete: () =>
        set((s) => {
          if (s.deletedTasks.length === 0) return s
          const lastDeletedAt = Math.max(...s.deletedTasks.map((d) => d.deletedAt))
          const toRestore = s.deletedTasks.filter((d) => d.deletedAt === lastDeletedAt)
          return {
            tasks: [...s.tasks, ...toRestore.map((d) => d.task)],
            deletedTasks: s.deletedTasks.filter((d) => d.deletedAt !== lastDeletedAt),
          }
        }),
      clearDeletedTasks: () => set({ deletedTasks: [] }),
      reorderTask: (id, newOrder) => {
        pushUndo()
        return set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, order: newOrder } : t,
          ),
        }))
      },
      reorderTasks: (orderedIds) => {
        pushUndo()
        return set((s) => ({
          tasks: s.tasks.map((t) => {
            const idx = orderedIds.indexOf(t.id)
            return idx >= 0 ? { ...t, order: idx } : t
          }),
        }))
      },

      moveTaskToList: (taskId, listId) => {
        const s = get()
        const task = s.tasks.find((t) => t.id === taskId)
        if (!task || task.listId === listId) return { moved: false }
        const listName = s.lists.find((l) => l.id === listId)?.name ?? i18n.t('lists.unnamedList')
        const descendants = expandDescendantIds([taskId], s.tasks)
        pushUndo()
        set((state) => {
          const maxOrder = Math.max(
            0,
            ...state.tasks
              .filter(
                (t) =>
                  t.listId === listId &&
                  t.parentId === null &&
                  !t.completed &&
                  !descendants.has(t.id),
              )
              .map((t) => t.order),
          )
          const rootNewOrder = maxOrder + 1
          const now = new Date().toISOString()
          return {
            tasks: state.tasks.map((t) => {
              if (!descendants.has(t.id)) return t
              if (t.id === taskId)
                return { ...t, listId, order: rootNewOrder, sectionId: null, updatedAt: now }
              return { ...t, listId, sectionId: null, updatedAt: now }
            }),
          }
        })
        return { moved: true, listName, listId }
      },

      moveTasksToList: (rootTaskIds, listId) => {
        const s = get()
        const uniqueRoots = [...new Set(rootTaskIds)]
        const rootsToMove = uniqueRoots.filter((id) => {
          const t = s.tasks.find((x) => x.id === id)
          return Boolean(t && t.parentId == null && t.listId !== listId)
        })
        if (rootsToMove.length === 0) return { moved: false }
        const listName = s.lists.find((l) => l.id === listId)?.name ?? i18n.t('lists.unnamedList')
        const descendantsUnion = new Set<string>()
        const taskToRoot = new Map<string, string>()
        for (const rid of rootsToMove) {
          for (const tid of expandDescendantIds([rid], s.tasks)) {
            descendantsUnion.add(tid)
            taskToRoot.set(tid, rid)
          }
        }
        pushUndo()
        set((state) => {
          const maxOrder = Math.max(
            0,
            ...state.tasks
              .filter(
                (t) =>
                  t.listId === listId &&
                  t.parentId === null &&
                  !t.completed &&
                  !descendantsUnion.has(t.id),
              )
              .map((t) => t.order),
          )
          const rootOrder = new Map<string, number>()
          rootsToMove.forEach((rid, i) => {
            rootOrder.set(rid, maxOrder + 1 + i)
          })
          const now = new Date().toISOString()
          return {
            tasks: state.tasks.map((t) => {
              if (!descendantsUnion.has(t.id)) return t
              const rootId = taskToRoot.get(t.id)
              if (!rootId) return t
              const ord = rootOrder.get(rootId)
              if (t.id === rootId && ord !== undefined)
                return { ...t, listId, order: ord, sectionId: null, updatedAt: now }
              return { ...t, listId, sectionId: null, updatedAt: now }
            }),
          }
        })
        return { moved: true, listName, listId, count: rootsToMove.length }
      },

      showMoveBanner: (text) => set({ moveBannerText: text }),
      clearMoveBanner: () => set({ moveBannerText: null }),

      setTaskDragHoverListId: (id) => set({ taskDragHoverListId: id }),

      toggleNotifications: () =>
        set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),

      exportData: () => {
        const { tasks, lists, habits, listColorPaletteId, sections, timeLogTagPresets } = get()
        const data = JSON.stringify(
          buildBackupPayload({
            tasks,
            lists,
            habits,
            sections,
            listColorPaletteId,
            timeLogTagPresets,
          }),
          null,
          2,
        )
        const blob = new Blob([data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `chronograma-backup-${format(new Date(), 'yyyy-MM-dd')}.json`
        a.click()
        URL.revokeObjectURL(url)
      },

      importData: (json) => {
        const parsed = parseBackupJson(json)
        if (!parsed) return false
        pushUndo()
        set({
          tasks: parsed.tasks,
          lists: parsed.lists,
          habits: parsed.habits,
          listColorPaletteId: parsed.listColorPaletteId ?? get().listColorPaletteId,
          sections: parsed.sections,
          timeLogTagPresets: parsed.timeLogTagPresets ?? [],
          quickAddSectionId: null,
        })
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
            endDate: null,
            startTime: null,
            endTime: null,
            priority: row.priority,
            tags: row.tags,
            recurrence: null,
            isTimeLog: false,
          }
        })
        pushUndo()
        set((st) => ({ tasks: [...st.tasks, ...newTasks] }))
        return { imported: newTasks.length, skipped, errors: [] }
      },

      undoLastOperation: () => {
        const snap = undoStack.pop()
        if (!snap) return false
        set({ ...snap })
        return true
      },
      }
    },
    {
      name: PERSIST_STORAGE_KEY,
      version: 22,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>
        if (version < 2) {
          const tasks = (state.tasks as Record<string, unknown>[]) ?? []
          state.tasks = tasks.map((t) => ({
            ...t,
            description: (t as Record<string, unknown>).description ?? '',
            updatedAt: (t as Record<string, unknown>).updatedAt ?? (t as Record<string, unknown>).createdAt ?? new Date().toISOString(),
          }))
        }
        if (version < 3) {
          const tasks = (state.tasks as Record<string, unknown>[]) ?? []
          state.tasks = tasks.map((t) => ({
            ...t,
            recurrence: (t as Record<string, unknown>).recurrence ?? null,
            description: (t as Record<string, unknown>).description ?? '',
            updatedAt: (t as Record<string, unknown>).updatedAt ?? new Date().toISOString(),
          }))
          state.searchQuery = state.searchQuery ?? ''
          state.sortMode = state.sortMode ?? 'manual'
          state.deletedTasks = state.deletedTasks ?? []
        }
        if (version < 4) {
          const tasks = (state.tasks as Record<string, unknown>[]) ?? []
          state.tasks = tasks.map((t) => ({
            ...t,
            startTime: (t as Record<string, unknown>).startTime ?? null,
            endTime: (t as Record<string, unknown>).endTime ?? null,
          }))
        }
        if (version < 5) {
          const lists = (state.lists as Record<string, unknown>[]) ?? []
          const cols = defaultPaletteColors
          state.lists = lists.map((l, i) => ({
            ...l,
            color: (l as Record<string, unknown>).color ?? cols[i % cols.length],
          }))
        }
        if (version < 6) {
          state.notificationsEnabled = state.notificationsEnabled ?? false
        }
        if (version < 7) {
          state.googleConnected = state.googleConnected ?? false
        }
        if (version < 8) {
          const tasks = (state.tasks as Record<string, unknown>[]) ?? []
          state.tasks = tasks.map((t) => ({
            ...t,
            isTimeLog: (t as Record<string, unknown>).isTimeLog ?? false,
          }))
          state.activeTimer = state.activeTimer ?? null
        }
        if (version < 9) {
          state.habits = state.habits ?? []
        }
        if (version < 10) {
          state.listColorPaletteId = normalizeListColorPaletteId(state.listColorPaletteId)
        }
        if (version < 11) {
          state.sections = Array.isArray(state.sections) ? state.sections : []
          state.quickAddSectionId =
            typeof state.quickAddSectionId === 'string' || state.quickAddSectionId === null
              ? state.quickAddSectionId
              : null
          const tasks = (state.tasks as Record<string, unknown>[]) ?? []
          state.tasks = tasks.map((t) => ({
            ...t,
            sectionId: (t as Record<string, unknown>).sectionId ?? null,
          }))
        }
        if (version < 12) {
          if (state.selectedView === 'week-calendar') {
            state.selectedView = 'calendar'
            state.calendarMode = 'week'
          } else {
            const cm = state.calendarMode
            state.calendarMode = cm === 'week' || cm === 'month' ? cm : 'month'
          }
        }
        if (version < 13) {
          const tasks = (state.tasks as Record<string, unknown>[]) ?? []
          state.tasks = tasks.map((t) => ({
            ...t,
            isTimeLog: t.isTimeLog === true || t.is_time_log === true,
          }))
        }
        if (version < 14) {
          const lists = (state.lists as Record<string, unknown>[]) ?? []
          state.lists = lists.map((l) => {
            const rec = l as Record<string, unknown>
            if (rec.id === INBOX_ID && rec.name === '受信トレイ') {
              return { ...rec, name: '未分類' }
            }
            return l
          })
        }
        if (version < 15) {
          const habits = (state.habits as Record<string, unknown>[]) ?? []
          state.habits = habits.map((h) => {
            const rec = h as Record<string, unknown>
            const startTime = typeof rec.startTime === 'string' ? rec.startTime : null
            const endTime = typeof rec.endTime === 'string' ? rec.endTime : null
            const timeMode =
              rec.timeMode === 'none' || rec.timeMode === 'fixed' || rec.timeMode === 'range'
                ? rec.timeMode
                : inferHabitTimeMode(startTime, endTime)
            return {
              ...rec,
              timeMode,
              startTime,
              endTime,
            }
          })
        }
        if (version < 16) {
          const raw = state.timeLogTagPresets
          state.timeLogTagPresets = Array.isArray(raw)
            ? normalizeTimeLogTagPresetList(raw.filter((x): x is string => typeof x === 'string'))
            : []
        }
        if (version < 17) {
          const raw = state.selectedCalendarDateKey
          state.selectedCalendarDateKey =
            typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
              ? raw
              : format(new Date(), 'yyyy-MM-dd')
        }
        if (version < 18) {
          state.todayIncludeOverdue = state.todayIncludeOverdue === true
        }
        if (version < 19) {
          const tasks = (state.tasks as Record<string, unknown>[]) ?? []
          state.tasks = tasks.map((t) => ({
            ...t,
            endDate:
              typeof (t as Record<string, unknown>).endDate === 'string'
                ? ((t as Record<string, unknown>).endDate as string)
                : null,
          }))
        }
        if (version < 20) {
          const tasks = (state.tasks as Record<string, unknown>[]) ?? []
          state.tasks = tasks.map((t) => {
            const { pinned, ...rest } = t as Record<string, unknown>
            void pinned
            return rest
          })
        }
        if (version < 21) {
          const tasks = (state.tasks as Record<string, unknown>[]) ?? []
          state.tasks = tasks.map((t) => {
            const rec = t as Record<string, unknown>
            const completed = rec.completed === true
            const has = typeof rec.completedAt === 'string'
            if (completed && !has) {
              return {
                ...rec,
                completedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : null,
              }
            }
            if (!completed) {
              return { ...rec, completedAt: null }
            }
            return { ...rec }
          })
        }
        if (version < 22) {
          delete state.todayIncludeOverdue
        }
        return state as unknown as TaskState
      },
      partialize: (state) => {
        const {
          searchQuery,
          deletedTasks,
          quickAddRequested,
          filterTag,
          calendarEvents,
          googleAccessToken,
          moveBannerText,
          taskDragHoverListId,
          settingsScrollTarget,
          ...rest
        } = state
        void searchQuery
        void deletedTasks
        void quickAddRequested
        void filterTag
        void calendarEvents
        void googleAccessToken
        void moveBannerText
        void taskDragHoverListId
        void settingsScrollTarget
        return rest as unknown as TaskState
      },
    },
  ),
)
