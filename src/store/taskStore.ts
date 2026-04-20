import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import type { CalendarEvent } from '../types/calendarEvent'
import type { Habit } from '../types/habit'
import { newId } from '../lib/id'
import {
  DEFAULT_LIST_COLOR_PALETTE_ID,
  paletteColors,
  normalizeListColorPaletteId,
  type ListColorPaletteId,
} from '../lib/listColorPalettes'
import { addDays, addWeeks, addMonths, addYears, format } from 'date-fns'

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
  theme: 'light' | 'dark'
  searchQuery: string
  sortMode: SortMode
  deletedTasks: { task: Task; deletedAt: number }[]
  quickAddRequested: boolean
  filterTag: string | null
  notificationsEnabled: boolean
  listColorPaletteId: ListColorPaletteId

  calendarEvents: CalendarEvent[]
  googleConnected: boolean
  googleAccessToken: string | null

  activeTimer: ActiveTimer | null

  habits: Habit[]

  sections: ListSection[]
  /** Quick Add 時に付与するセクション（そのリストを開いているときのみ有効） */
  quickAddSectionId: string | null
  setQuickAddSectionId: (id: string | null) => void

  addSection: (listId: string, name?: string) => void
  renameSection: (id: string, name: string) => void
  deleteSection: (id: string) => void
  reorderSections: (listId: string, orderedIds: string[]) => void
  /** 手動ソート: 表示中のルート未完了タスクの順と order を一致させ、任意で 1 件の sectionId を更新 */
  reorderManualRootTasks: (
    orderedTaskIds: string[],
    sectionUpdate?: { taskId: string; sectionId: string | null },
  ) => void

  toggleTheme: () => void
  setListColorPalette: (id: ListColorPaletteId) => void

  selectList: (id: string) => void
  selectView: (view: SmartView) => void
  openSettingsWithScroll: (target: SettingsScrollTarget) => void
  clearSettingsScrollTarget: () => void
  setCalendarMode: (mode: CalendarMode) => void
  setSearchQuery: (q: string) => void
  setSortMode: (mode: SortMode) => void
  requestQuickAdd: () => void
  clearQuickAddRequest: () => void
  setFilterTag: (tag: string | null) => void

  setCalendarEvents: (events: CalendarEvent[]) => void
  setGoogleConnected: (connected: boolean) => void
  setGoogleAccessToken: (token: string | null) => void

  addHabit: (fields: Pick<Habit, 'title' | 'color' | 'startTime' | 'endTime' | 'frequency'>) => void
  updateHabit: (id: string, patch: Partial<Pick<Habit, 'title' | 'color' | 'startTime' | 'endTime' | 'frequency'>>) => void
  deleteHabit: (id: string) => void
  toggleHabitDate: (habitId: string, dateKey: string) => void

  addList: (name: string) => void
  renameList: (id: string, name: string) => void
  updateListColor: (id: string, color: string) => void
  deleteList: (id: string) => void
  reorderList: (id: string, newOrder: number) => void
  reorderLists: (orderedIds: string[]) => void

  addTask: (title: string, listId?: string, parentId?: string) => void
  addTaskWithDate: (title: string, dueDate: string, listId?: string) => void
  addTaskWithTime: (title: string, dueDate: string, startTime: string, endTime: string, listId?: string) => void
  addCompletedTaskWithTime: (title: string, dueDate: string, startTime: string, endTime: string) => void
  addTimeLog: (title: string, date: string, startTime: string, endTime: string, tags?: string[]) => void
  startTimer: (title: string, tags?: string[]) => void
  stopTimer: () => void
  toggleTask: (id: string) => void
  updateTask: (id: string, patch: Partial<Pick<Task, 'title' | 'description' | 'dueDate' | 'startTime' | 'endTime' | 'priority' | 'tags' | 'listId' | 'parentId' | 'recurrence' | 'isTimeLog' | 'completed' | 'sectionId'>>) => void
  bulkUpdateTasks: (ids: string[], patch: Partial<Pick<Task, 'listId' | 'priority' | 'dueDate' | 'sectionId'>>) => void
  deleteTask: (id: string) => void
  deleteTasks: (ids: string[]) => void
  undoDelete: () => void
  clearDeletedTasks: () => void
  reorderTask: (id: string, newOrder: number) => void
  reorderTasks: (orderedIds: string[]) => void
  /** ルートタスクを別リストへ。子タスクは listId のみ追随。末尾 order。同一リストは no-op */
  moveTaskToList: (taskId: string, listId: string) => { moved: boolean; listName?: string }

  moveBannerText: string | null
  showMoveBanner: (text: string) => void
  clearMoveBanner: () => void

  /** タスクドラッグ中のドロップ先リスト（ホバー風ハイライト用・永続化しない） */
  taskDragHoverListId: string | null
  setTaskDragHoverListId: (id: string | null) => void

  toggleNotifications: () => void
  exportData: () => void
  importData: (json: string) => boolean
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

function applyTaskPatch(task: Task, patch: Partial<Pick<Task, 'title' | 'description' | 'dueDate' | 'startTime' | 'endTime' | 'priority' | 'tags' | 'listId' | 'parentId' | 'recurrence' | 'isTimeLog' | 'completed' | 'sectionId'>>): Task {
  const applied = { ...task, ...patch, updatedAt: new Date().toISOString() }
  if (patch.listId !== undefined && patch.listId !== task.listId) {
    applied.sectionId = null
  }
  if (patch.dueDate === null) {
    applied.startTime = null
    applied.endTime = null
    applied.recurrence = null
  }
  return applied
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
    createdAt: now,
    updatedAt: now,
    order,
    listId: fields.listId,
    sectionId: fields.sectionId ?? null,
    parentId: null,
    dueDate: fields.dueDate ?? null,
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
    (set, get) => ({
      tasks: [],
      lists: [defaultInbox],
      selectedListId: INBOX_ID,
      selectedView: null,
      settingsScrollTarget: null as SettingsScrollTarget | null,
      calendarMode: 'month' as CalendarMode,
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
        set((s) => ({
          sections: [
            ...s.sections,
            { id: newId(), listId, name: name?.trim() || 'セクション', order: maxOrder + 1 },
          ],
        }))
      },
      renameSection: (id, name) =>
        set((s) => ({
          sections: s.sections.map((sec) => (sec.id === id ? { ...sec, name: name.trim() || sec.name } : sec)),
        })),
      deleteSection: (id) =>
        set((s) => ({
          sections: s.sections.filter((sec) => sec.id !== id),
          tasks: s.tasks.map((t) => (t.sectionId === id ? { ...t, sectionId: null, updatedAt: new Date().toISOString() } : t)),
        })),
      reorderSections: (listId, orderedIds) =>
        set((s) => ({
          sections: s.sections.map((sec) => {
            if (sec.listId !== listId) return sec
            const idx = orderedIds.indexOf(sec.id)
            return idx >= 0 ? { ...sec, order: idx } : sec
          }),
        })),

      reorderManualRootTasks: (orderedTaskIds, sectionUpdate) => {
        const now = new Date().toISOString()
        set((s) => ({
          tasks: s.tasks.map((t) => {
            const idx = orderedTaskIds.indexOf(t.id)
            if (idx < 0) return t
            let next: Task = { ...t, order: idx, updatedAt: now }
            if (sectionUpdate && sectionUpdate.taskId === t.id) {
              next = { ...next, sectionId: sectionUpdate.sectionId }
            }
            return next
          }),
        }))
      },

      setCalendarEvents: (events) => set({ calendarEvents: events }),
      setGoogleConnected: (connected) => set({ googleConnected: connected }),
      setGoogleAccessToken: (token) => set({ googleAccessToken: token }),

      addHabit: (fields) => {
        const now = new Date().toISOString()
        const habit: Habit = {
          id: newId(),
          title: fields.title,
          color: fields.color,
          startTime: fields.startTime,
          endTime: fields.endTime,
          frequency: fields.frequency,
          createdAt: now,
          updatedAt: now,
          completedDates: [],
        }
        set((s) => ({ habits: [...s.habits, habit] }))
      },
      updateHabit: (id, patch) =>
        set((s) => ({
          habits: s.habits.map((h) =>
            h.id === id ? { ...h, ...patch, updatedAt: new Date().toISOString() } : h,
          ),
        })),
      deleteHabit: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),
      toggleHabitDate: (habitId, dateKey) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== habitId) return h
            const has = h.completedDates.includes(dateKey)
            const completedDates = has
              ? h.completedDates.filter((d) => d !== dateKey)
              : [...h.completedDates, dateKey].sort()
            return { ...h, completedDates, updatedAt: new Date().toISOString() }
          }),
        })),

      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

      setListColorPalette: (id) => set({ listColorPaletteId: id }),

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
      setCalendarMode: (mode) => set({ calendarMode: mode }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setSortMode: (mode) => set({ sortMode: mode }),
      setFilterTag: (tag) => set({ filterTag: tag }),
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
        const maxOrder = Math.max(0, ...get().lists.map((l) => l.order))
        const cols = paletteColors(get().listColorPaletteId)
        const colorIdx = get().lists.length % cols.length
        set((s) => ({
          lists: [...s.lists, { id: newId(), name, color: cols[colorIdx], order: maxOrder + 1 }],
        }))
      },
      renameList: (id, name) =>
        set((s) => ({
          lists: s.lists.map((l) => (l.id === id ? { ...l, name } : l)),
        })),
      updateListColor: (id, color) =>
        set((s) => ({
          lists: s.lists.map((l) => (l.id === id ? { ...l, color } : l)),
        })),
      deleteList: (id) => {
        if (id === INBOX_ID) return
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
      reorderList: (id, newOrder) =>
        set((s) => ({
          lists: s.lists.map((l) =>
            l.id === id ? { ...l, order: newOrder } : l,
          ),
        })),
      reorderLists: (orderedIds) =>
        set((s) => ({
          lists: s.lists.map((l) => {
            const idx = orderedIds.indexOf(l.id)
            return idx >= 0 ? { ...l, order: idx } : l
          }),
        })),

      addTask: (title, listId, parentId) => {
        const targetList = listId ?? get().selectedListId ?? INBOX_ID
        const pid = parentId ?? null
        const s = get()
        const q = s.quickAddSectionId
        const sectionOk =
          pid === null &&
          Boolean(q) &&
          targetList === s.selectedListId &&
          s.sections.some((sec) => sec.id === q && sec.listId === targetList)
        const sectionForAdd = sectionOk ? q : null
        const ord = orderForNewSiblingAtFront(get().tasks, targetList, pid, sectionForAdd)
        const task = makeTask({ title, listId: targetList, sectionId: sectionForAdd }, ord)
        if (parentId) task.parentId = parentId
        set((st) => ({ tasks: [...st.tasks, task] }))
      },
      addTaskWithDate: (title, dueDate, listId) => {
        const targetList = listId ?? get().selectedListId ?? INBOX_ID
        const ord = orderForNewSiblingAtFront(get().tasks, targetList, null)
        set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: targetList, dueDate }, ord)] }))
      },
      addTaskWithTime: (title, dueDate, startTime, endTime, listId) => {
        const targetList = listId ?? get().selectedListId ?? INBOX_ID
        const ord = orderForNewSiblingAtFront(get().tasks, targetList, null)
        set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: targetList, dueDate, startTime, endTime }, ord)] }))
      },
      addCompletedTaskWithTime: (title, dueDate, startTime, endTime) => {
        const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
        set((s) => ({
          tasks: [
            ...s.tasks,
            makeTask({ title, listId: INBOX_ID, dueDate, startTime, endTime, isTimeLog: true, completed: true }, maxOrder + 1),
          ],
        }))
      },
      addTimeLog: (title, date, startTime, endTime, tags) => {
        const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
        set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: INBOX_ID, dueDate: date, startTime, endTime, isTimeLog: true, completed: true, tags }, maxOrder + 1)] }))
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
        const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
        const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
        const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
        set((s) => ({
          activeTimer: null,
          tasks: [...s.tasks, makeTask({ title: timer.taskTitle, listId: INBOX_ID, dueDate, startTime, endTime, isTimeLog: true, completed: true, tags: timer.tags }, maxOrder + 1)],
        }))
      },
      toggleTask: (id) =>
        set((s) => {
          const task = s.tasks.find((t) => t.id === id)
          if (!task) return s
          const willComplete = !task.completed
          const now = new Date().toISOString()
          let newTasks = s.tasks.map((t) =>
            t.id === id ? { ...t, completed: willComplete, updatedAt: now } : t,
          )
          if (willComplete && task.recurrence && task.dueDate) {
            const next: Task = {
              ...task,
              id: newId(),
              completed: false,
              dueDate: nextDueDate(task.dueDate, task.recurrence),
              createdAt: now,
              updatedAt: now,
            }
            newTasks = [...newTasks, next]
          }
          return { tasks: newTasks }
        }),
      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? applyTaskPatch(t, patch) : t)),
        })),
      bulkUpdateTasks: (ids, patch) =>
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
        }),
      deleteTask: (id) =>
        set((s) => {
          const toDelete = s.tasks.filter((t) => t.id === id || t.parentId === id)
          const deletedAt = Date.now()
          return {
            tasks: s.tasks.filter((t) => t.id !== id && t.parentId !== id),
            deletedTasks: [
              ...s.deletedTasks,
              ...toDelete.map((t) => ({ task: t, deletedAt })),
            ],
          }
        }),
      deleteTasks: (ids) =>
        set((s) => {
          if (ids.length === 0) return s
          const del = expandDescendantIds(ids, s.tasks)
          const toDelete = s.tasks.filter((t) => del.has(t.id))
          if (toDelete.length === 0) return s
          const deletedAt = Date.now()
          return {
            tasks: s.tasks.filter((t) => !del.has(t.id)),
            deletedTasks: [
              ...s.deletedTasks,
              ...toDelete.map((t) => ({ task: t, deletedAt })),
            ],
          }
        }),
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
      reorderTask: (id, newOrder) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, order: newOrder } : t,
          ),
        })),
      reorderTasks: (orderedIds) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            const idx = orderedIds.indexOf(t.id)
            return idx >= 0 ? { ...t, order: idx } : t
          }),
        })),

      moveTaskToList: (taskId, listId) => {
        const s = get()
        const task = s.tasks.find((t) => t.id === taskId)
        if (!task || task.listId === listId) return { moved: false }
        const listName = s.lists.find((l) => l.id === listId)?.name ?? 'リスト'
        const descendants = expandDescendantIds([taskId], s.tasks)
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
        return { moved: true, listName }
      },

      showMoveBanner: (text) => set({ moveBannerText: text }),
      clearMoveBanner: () => set({ moveBannerText: null }),

      setTaskDragHoverListId: (id) => set({ taskDragHoverListId: id }),

      toggleNotifications: () =>
        set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),

      exportData: () => {
        const { tasks, lists, habits, listColorPaletteId, sections } = get()
        const data = JSON.stringify({ tasks, lists, habits, listColorPaletteId, sections }, null, 2)
        const blob = new Blob([data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `chronograma-backup-${format(new Date(), 'yyyy-MM-dd')}.json`
        a.click()
        URL.revokeObjectURL(url)
      },

      importData: (json) => {
        try {
          const data = JSON.parse(json)
          if (!Array.isArray(data.tasks) || !Array.isArray(data.lists)) return false
          // Basic structure validation
          const validTasks = data.tasks.every((t: unknown) => 
            typeof t === 'object' && t !== null && 'id' in t && 'title' in t && 'listId' in t
          )
          const validLists = data.lists.every((l: unknown) => 
            typeof l === 'object' && l !== null && 'id' in l && 'name' in l
          )
          const rawSections = (data as { sections?: unknown }).sections
          const sections: ListSection[] = Array.isArray(rawSections)
            ? rawSections.filter((sec: unknown): sec is ListSection => {
                if (typeof sec !== 'object' || sec === null) return false
                const o = sec as Record<string, unknown>
                return typeof o.id === 'string' && typeof o.listId === 'string' && typeof o.name === 'string' && typeof o.order === 'number'
              })
            : []
          if (!validTasks || !validLists) return false
          const paletteRaw = (data as { listColorPaletteId?: unknown }).listColorPaletteId
          const listColorPaletteId =
            paletteRaw !== undefined && paletteRaw !== null
              ? normalizeListColorPaletteId(paletteRaw)
              : get().listColorPaletteId
          const importedTasks = (data.tasks as unknown[]).map((raw) => {
            const row = raw as Record<string, unknown>
            const t = raw as Task
            const isTimeLog =
              t.isTimeLog === true || row.is_time_log === true || row.is_time_log === 'true'
            return {
              ...t,
              sectionId: t.sectionId ?? null,
              isTimeLog: Boolean(isTimeLog),
            }
          })
          set({
            tasks: importedTasks,
            lists: data.lists,
            habits: Array.isArray(data.habits) ? data.habits : [],
            listColorPaletteId,
            sections,
            quickAddSectionId: null,
          })
          return true
        } catch {
          return false
        }
      },
    }),
    {
      name: PERSIST_STORAGE_KEY,
      version: 14,
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
