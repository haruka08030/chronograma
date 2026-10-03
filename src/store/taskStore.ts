import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { DEFAULT_LIST_COLOR_PALETTE_ID } from '../lib/listColorPalettes'
import { assignColorsInOrder } from '../lib/logCategoryColors'
import { clearImportRollback, loadImportRollback } from '../lib/importRollback'
import { setAppTimeZoneSetting, appTodayKey } from '../lib/timeZone'
import { reanchorTasks } from '../lib/taskTimeZone'
import { markRawKnown, persistStorage, readChangedRaw, setPersistWriteHandlers, withoutPersisting } from '../lib/persistStorage'
import {
  INBOX_ID,
  INBOX_LIST_ID,
  LEGACY_PERSIST_STORAGE_KEY,
  PERSIST_STORAGE_KEY,
  STORE_VERSION,
} from './storeConstants'
import type { CalendarMode, DailyReminders, SectionGrouping, SettingsScrollTarget, SmartView, SortMode, SyncState, TaskState } from './storeTypes'
import { defaultLogCategories, initialLists } from './storeDefaults'
import { migrateTaskState } from './migrate'
import { createUndoHistory } from './undo'
import { createSectionsSlice } from './slices/sections'
import { createTaskTreeSlice } from './slices/taskTree'
import { createTasksSlice } from './slices/tasks'
import { createListsSlice } from './slices/lists'
import { createHabitsSlice } from './slices/habits'
import { createTimeLogsSlice } from './slices/timeLogs'
import { createGoogleSlice } from './slices/google'
import { createSettingsSlice } from './slices/settings'
import { createUiSlice } from './slices/ui'
import { createDataSlice } from './slices/data'
import { DATA_KEYS, VIEW_KEYS, pickKeys } from './persistKeys'

/*
 * タスク・リスト・習慣・記録・設定をまとめて持つストア（localStorage に保存）。
 * ここは作成と保存の設定だけ。操作は `slices/*.ts`、純粋な計算は `taskHelpers.ts` ほか、保存データの移行は `migrate.ts`
 */

export { MAX_EXTRA_TIME_ZONES, LEGACY_DATA_OWNER, INBOX_LIST_ID } from './storeConstants'
export type {
  ActiveTimer,
  CalendarMode,
  DailyReminders,
  SectionGrouping,
  SettingsScrollTarget,
  SmartView,
  SortMode,
} from './storeTypes'
export { recurrenceNextId } from './taskRecurrence'
export type { ListColorPaletteId } from '../lib/listColorPalettes'
export {
  DEFAULT_LIST_COLOR_PALETTE_ID,
  paletteColors,
  LIST_COLOR_PALETTES,
  normalizeListColorPaletteId,
} from '../lib/listColorPalettes'
import { withTaskDefaults } from '../lib/taskDefaults'

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

/** 読めなかった保存データを、上書きされる前に別のキーへ写す */
function preserveUnreadableStorage() {
  try {
    const raw = localStorage.getItem(PERSIST_STORAGE_KEY)
    if (raw) localStorage.setItem(`${PERSIST_STORAGE_KEY}-unreadable-${Date.now()}`, raw)
  } catch {
    /* 写せなくても続ける */
  }
}

/** 他のタブの変更を取り込んだとき、手元の ⌘Z の履歴（取り込む前の状態）を捨てる */
let clearUndoHistory = () => {}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => {
      const undo = createUndoHistory(set, get)
      clearUndoHistory = undo.clear
      const ctx = { set, get, undo }

      return {
      tasks: [],
      lists: initialLists(),
      selectedListId: INBOX_ID,
      selectedView: 'planner' as SmartView | null,
      settingsScrollTarget: null as SettingsScrollTarget | null,
      storageFull: false,
      sectionScrollTarget: null as string | null,
      calendarMode: 'week' as CalendarMode,
      selectedCalendarDateKey: appTodayKey(),
      theme: 'system' as 'light' | 'dark' | 'system',
      searchQuery: '',
      sortByKey: {} as Record<string, SortMode>,
      sectionGrouping: { lists: true, dueViews: false } as SectionGrouping,
      recentDeletes: [],
      moveBannerText: null as string | null,
      undoBanner: null as { text: string; at: number } | null,
      googleUndo: null as { id: string; text: string; at: number } | null,
      taskDragHoverListId: null as string | null,
      syncState: 'idle' as SyncState,
      lastSyncedAt: null as string | null,
      syncRejected: [],
      dataOwner: null as string | null,
      quickAddRequested: false,
      filterTag: null,
      filterColor: null,
      notificationsEnabled: false,
      recordPrompts: true,
      recordPromptTaskId: null as string | null,
      tagsEnabled: false,
      listColorPaletteId: DEFAULT_LIST_COLOR_PALETTE_ID,
      // 新規ユーザーは分類の候補が空だと記録がほぼ「未分類」になるので、よく使う分類を最初から置く
      timeLogTagPresets: defaultLogCategories(),
      logCategoryColors: assignColorsInOrder(defaultLogCategories()),

      calendarEvents: [],
      googleEventColors: {},
      googleConnected: false,
      googleAccessToken: null,
      googleConnectionError: null,
      googleCanWrite: false,
      activeTimer: null,
      completePromptTaskId: null as string | null,
      dailyReminders: { planTime: null } as DailyReminders,
      reminderPromptDismissed: false,
      dailyCapacityMinutes: 480,
      eventReminderMinutes: null as number | null,
      appTimeZone: null as string | null,
      extraTimeZones: [] as string[],

      habits: [],

      sections: [] as ListSection[],
      quickAddSectionId: null as string | null,

      ...createSectionsSlice(ctx),
      ...createTaskTreeSlice(ctx),
      ...createTasksSlice(ctx),
      ...createListsSlice(ctx),
      ...createHabitsSlice(ctx),
      ...createTimeLogsSlice(ctx),
      ...createGoogleSlice(ctx),
      ...createSettingsSlice(ctx),
      ...createUiSlice(ctx),
      ...createDataSlice(ctx),
      ...undo.actions,
      }
    },
    {
      name: PERSIST_STORAGE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => persistStorage),
      // 読み込み（migrate）に失敗すると初期状態のまま動き、次の保存で元のデータを上書きしていた。
      // 上書きされる前に、保存されていた中身を別のキーへ写しておく（設定 → データ の書き出しとは別に残る）
      onRehydrateStorage: () => (_state, error) => {
        if (!error) return
        console.error('[storage] could not load saved data', error)
        preserveUnreadableStorage()
      },
      // 一覧が配列でない・中身が壊れた行は、画面を描く前（読み込んだ直後の処理）で落ちて真っ白になる。
      // 読める行だけ使い、元の中身は別のキーに写しておく
      merge: (persisted, current) => {
        // 前の版は画面の状態や選んだ日も本体に保存していた。読むのはデータと画面の好みだけ（選んだ日などは今日から）
        const saved = pickKeys((persisted ?? {}) as Record<string, unknown>, [...DATA_KEYS, ...VIEW_KEYS])
        const merged = { ...current, ...(saved as Partial<TaskState>) } as TaskState
        let broken = false
        for (const key of ['tasks', 'lists', 'habits', 'sections'] as const) {
          const value = merged[key] as unknown
          const rows = Array.isArray(value)
            ? value.filter((x) => typeof x === 'object' && x !== null && typeof (x as { id?: unknown }).id === 'string')
            : null
          if (!rows || rows.length !== (value as unknown[]).length) broken = true
          ;(merged as unknown as Record<string, unknown>)[key] = rows ?? current[key]
        }
        // 前の版の保存には無い項目がある。必ず持つ項目は既定値で埋める
        merged.tasks = merged.tasks.map(withTaskDefaults)
        if (broken) preserveUnreadableStorage()
        return merged
      },
      migrate: migrateTaskState,
      // 保存するのはデータと設定だけ（一覧は persistKeys.ts）。画面の状態は別の保存先、通知・同期の状態は保存しない
      partialize: (state) => pickKeys(state as unknown as Record<string, unknown>, DATA_KEYS) as unknown as TaskState,
    },
  ),
)

/**
 * 開いていた画面・並び順などの好み（`VIEW_KEYS`）は、データとは別の小さな保存先に置く。
 * 画面を切り替えるたびに全データを書き直したり、他のタブに読み直させたりしないため
 */
const VIEW_STORAGE_KEY = 'chronograma-view-v1'
function restoreViewState() {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY)
    if (raw) {
      const saved = pickKeys(JSON.parse(raw) as Record<string, unknown>, VIEW_KEYS)
      withoutPersisting(() => useTaskStore.setState(saved as Partial<TaskState>))
    }
  } catch {
    /* 読めなければ既定の画面から */
  }
  let last = ''
  const save = (s: TaskState) => {
    const json = JSON.stringify(pickKeys(s as unknown as Record<string, unknown>, VIEW_KEYS))
    if (json === last) return
    last = json
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, json)
    } catch {
      /* 保存できなくても困らない */
    }
  }
  save(useTaskStore.getState())
  useTaskStore.subscribe(save)
}

/**
 * アプリのタイムゾーンを読み込み直後・変更時に反映する。タイムゾーンを決めたタスクの列が
 * 別のタイムゾーンで書かれていたら（設定の変更・他の端末から同期・元に戻す）同じ瞬間のまま書き直す
 */
function applyTimeZoneState() {
  const s = useTaskStore.getState()
  setAppTimeZoneSetting(s.appTimeZone)
  const tasks = reanchorTasks(s.tasks)
  if (tasks !== s.tasks) useTaskStore.setState({ tasks })
}
restoreViewState()
applyTimeZoneState()
useTaskStore.subscribe((s, prev) => {
  if (s.appTimeZone !== prev.appTimeZone || s.tasks !== prev.tasks) applyTimeZoneState()
})


let adoptingFromOtherTab = false
/** いまの更新が他のタブからの取り込みか（同期はそのタブが送るので、こちらからは送らない） */
export const isAdoptingFromOtherTab = () => adoptingFromOtherTab

/**
 * 他のタブが保存した内容を取り込む。取り込まないと、古いままのタブが次の同期で
 * 「もう一方のタブで作ったタスク」を自分が消したものと判断し、サーバーからも消していた。
 * ログインしていなくても、最後に書いたタブがもう一方の編集を上書きしていた
 */
export function adoptOtherTabChanges(): void {
  const raw = readChangedRaw(PERSIST_STORAGE_KEY)
  if (!raw) return
  let parsed: { state?: Record<string, unknown>; version?: unknown }
  try {
    parsed = JSON.parse(raw) as typeof parsed
  } catch {
    return
  }
  markRawKnown(raw)
  if (parsed.version !== STORE_VERSION) {
    // 新しい版のアプリを開いたタブが書いた。古いコードで読むと壊すので、このタブも新しい版で開き直す
    if (typeof parsed.version === 'number' && parsed.version > STORE_VERSION) window.location.reload()
    return
  }
  const incoming: Record<string, unknown> = { ...parsed.state }
  // 取り込むのはデータだけ（画面の状態はタブごと。前の版の保存に残っていても無視する）
  for (const key of Object.keys(incoming)) if (!(DATA_KEYS as readonly string[]).includes(key)) delete incoming[key]
  const lists = Array.isArray(incoming.lists) ? (incoming.lists as TaskList[]) : null
  const sel = useTaskStore.getState().selectedListId
  if (lists && sel && !lists.some((l) => l.id === sel)) incoming.selectedListId = INBOX_LIST_ID
  adoptingFromOtherTab = true
  try {
    // 保存し直さない（同じ内容を書くだけで、表示の状態だけが違う書き込みがタブ間を往復する）
    withoutPersisting(() => useTaskStore.setState(incoming as Partial<TaskState>))
    clearUndoHistory()
  } finally {
    adoptingFromOtherTab = false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === PERSIST_STORAGE_KEY) adoptOtherTabChanges()
  })
}

/**
 * 保存領域がいっぱいのとき。以前は保存が黙って失敗し（操作も途中で例外になり）、
 * 再読み込みすると、いっぱいになってからの編集がすべて消えていた
 */
setPersistWriteHandlers({
  // 取り込み前の控え（全データの写し）がいちばん大きい。先に手放してもう一度書く
  freeSpace: () => {
    if (loadImportRollback() === null) return false
    clearImportRollback()
    return true
  },
  onFailed: (err) => {
    console.error('[storage] save failed', err)
    // 保存の途中なので、知らせるのは今の更新が終わってから（保存し直すとまた失敗するので保存しない）
    queueMicrotask(() => {
      if (!useTaskStore.getState().storageFull) withoutPersisting(() => useTaskStore.setState({ storageFull: true }))
    })
  },
  onRecovered: () => {
    queueMicrotask(() => withoutPersisting(() => useTaskStore.setState({ storageFull: false })))
  },
})