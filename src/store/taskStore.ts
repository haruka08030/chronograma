import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { CalendarEvent } from '../types/calendarEvent'
import { newId } from '../lib/id'
import { addDays, addWeeks, addMonths, addYears, format } from 'date-fns'

const INBOX_ID = '__inbox__'

export type SmartView = 'all' | 'today' | 'upcoming' | 'calendar' | 'week-calendar' | 'plan-vs-actual' | 'activity-log' | 'stats'
export type SortMode = 'manual' | 'dueDate' | 'priority' | 'title' | 'createdAt'

export const LIST_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#64748b',
]

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
  theme: 'light' | 'dark'
  searchQuery: string
  sortMode: SortMode
  deletedTasks: { task: Task; deletedAt: number }[]
  quickAddRequested: boolean
  filterTag: string | null
  notificationsEnabled: boolean

  calendarEvents: CalendarEvent[]
  googleConnected: boolean
  googleAccessToken: string | null

  activeTimer: ActiveTimer | null

  toggleTheme: () => void

  selectList: (id: string) => void
  selectView: (view: SmartView) => void
  setSearchQuery: (q: string) => void
  setSortMode: (mode: SortMode) => void
  requestQuickAdd: () => void
  clearQuickAddRequest: () => void
  setFilterTag: (tag: string | null) => void

  setCalendarEvents: (events: CalendarEvent[]) => void
  setGoogleConnected: (connected: boolean) => void
  setGoogleAccessToken: (token: string | null) => void

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
  updateTask: (id: string, patch: Partial<Pick<Task, 'title' | 'description' | 'dueDate' | 'startTime' | 'endTime' | 'priority' | 'tags' | 'listId' | 'parentId' | 'recurrence'>>) => void
  deleteTask: (id: string) => void
  undoDelete: () => void
  clearDeletedTasks: () => void
  reorderTask: (id: string, newOrder: number) => void
  reorderTasks: (orderedIds: string[]) => void

  toggleNotifications: () => void
  exportData: () => void
  importData: (json: string) => boolean
}

const defaultInbox: TaskList = { id: INBOX_ID, name: '受信トレイ', color: '#6366f1', order: 0 }

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

function makeTask(fields: { title: string; listId: string; dueDate?: string | null; startTime?: string | null; endTime?: string | null; isTimeLog?: boolean; completed?: boolean; tags?: string[] }, maxOrder: number): Task {
  const now = new Date().toISOString()
  return {
    id: newId(),
    title: fields.title,
    description: '',
    completed: fields.completed ?? false,
    createdAt: now,
    updatedAt: now,
    order: maxOrder + 1,
    listId: fields.listId,
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
      theme: 'light',
      searchQuery: '',
      sortMode: 'manual' as SortMode,
      deletedTasks: [],
      quickAddRequested: false,
      filterTag: null,
      notificationsEnabled: false,

      calendarEvents: [],
      googleConnected: false,
      googleAccessToken: null,
      activeTimer: null,

      setCalendarEvents: (events) => set({ calendarEvents: events }),
      setGoogleConnected: (connected) => set({ googleConnected: connected }),
      setGoogleAccessToken: (token) => set({ googleAccessToken: token }),

      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

      selectList: (id) => set({ selectedListId: id, selectedView: null }),
      selectView: (view) => set({ selectedView: view, selectedListId: null }),
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
        const colorIdx = get().lists.length % LIST_COLORS.length
        set((s) => ({
          lists: [...s.lists, { id: newId(), name, color: LIST_COLORS[colorIdx], order: maxOrder + 1 }],
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
          tasks: s.tasks.map((t) =>
            t.listId === id ? { ...t, listId: INBOX_ID } : t,
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
        const maxOrder = Math.max(0, ...get().tasks.filter((t) => t.listId === targetList).map((t) => t.order))
        const task = makeTask({ title, listId: targetList }, maxOrder)
        if (parentId) task.parentId = parentId
        set((s) => ({ tasks: [...s.tasks, task] }))
      },
      addTaskWithDate: (title, dueDate, listId) => {
        const targetList = listId ?? get().selectedListId ?? INBOX_ID
        const maxOrder = Math.max(0, ...get().tasks.filter((t) => t.listId === targetList).map((t) => t.order))
        set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: targetList, dueDate }, maxOrder)] }))
      },
      addTaskWithTime: (title, dueDate, startTime, endTime, listId) => {
        const targetList = listId ?? get().selectedListId ?? INBOX_ID
        const maxOrder = Math.max(0, ...get().tasks.filter((t) => t.listId === targetList).map((t) => t.order))
        set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: targetList, dueDate, startTime, endTime }, maxOrder)] }))
      },
      addCompletedTaskWithTime: (title, dueDate, startTime, endTime) => {
        const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
        set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: INBOX_ID, dueDate, startTime, endTime, completed: true }, maxOrder)] }))
      },
      addTimeLog: (title, date, startTime, endTime, tags) => {
        const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
        set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: INBOX_ID, dueDate: date, startTime, endTime, isTimeLog: true, completed: true, tags }, maxOrder)] }))
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
          tasks: [...s.tasks, makeTask({ title: timer.taskTitle, listId: INBOX_ID, dueDate, startTime, endTime, isTimeLog: true, completed: true, tags: timer.tags }, maxOrder)],
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
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t
            const applied = { ...t, ...patch, updatedAt: new Date().toISOString() }
            if (patch.dueDate === null) {
              applied.startTime = null
              applied.endTime = null
              applied.recurrence = null
            }
            return applied
          }),
        })),
      deleteTask: (id) =>
        set((s) => {
          const toDelete = s.tasks.filter((t) => t.id === id || t.parentId === id)
          return {
            tasks: s.tasks.filter((t) => t.id !== id && t.parentId !== id),
            deletedTasks: [
              ...s.deletedTasks,
              ...toDelete.map((t) => ({ task: t, deletedAt: Date.now() })),
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

      toggleNotifications: () =>
        set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),

      exportData: () => {
        const { tasks, lists } = get()
        const data = JSON.stringify({ tasks, lists }, null, 2)
        const blob = new Blob([data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `tickdo-backup-${format(new Date(), 'yyyy-MM-dd')}.json`
        a.click()
        URL.revokeObjectURL(url)
      },

      importData: (json) => {
        try {
          const data = JSON.parse(json)
          if (!Array.isArray(data.tasks) || !Array.isArray(data.lists)) return false
          set({ tasks: data.tasks, lists: data.lists })
          return true
        } catch {
          return false
        }
      },
    }),
    {
      name: 'tickdo-storage',
      version: 8,
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
          state.lists = lists.map((l, i) => ({
            ...l,
            color: (l as Record<string, unknown>).color ?? LIST_COLORS[i % LIST_COLORS.length],
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
        return state as unknown as TaskState
      },
      partialize: (state) => {
        const { searchQuery: _sq, deletedTasks: _dt, quickAddRequested: _qa, filterTag: _ft, calendarEvents: _ce, googleAccessToken: _gat, ...rest } = state
        return rest as unknown as TaskState
      },
    },
  ),
)
