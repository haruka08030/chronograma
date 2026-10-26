import { DEFAULT_SLEEP_PREFS } from '../lib/sleepPrefs'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { assignColorsInOrder } from '../lib/logCategoryColors'
import { clearImportRollback, loadImportRollback } from '../lib/importRollback'
import { setAppTimeZoneSetting, appTodayKey } from '../lib/timeZone'
import { reanchorTasks } from '../lib/taskTimeZone'
import { foldTaskFolders, needsFold } from '../lib/foldTaskFolders'
import type { ExtraTimeZone } from '../lib/extraTimeZones'
import type { EventTemplate } from '../lib/eventTemplates'
import { withCourseLink, type CourseLink } from '../lib/courseLinks'
import { withRemoved, withSkipped, withoutRestored, type SkippedEvent } from '../lib/skippedEvents'
import { fitMyEventTimes, withMyEventTimes, withMyTime, withRemovedTime, type MyEventTime } from '../lib/myEventTimes'
import { shortDate } from '../lib/moveToast'
import { appTimeZone, wallInZone } from '../lib/timeZone'
import { sameValue } from '../lib/sameValue'
import { DEFAULT_WEEK_STARTS_ON, setAppWeekStartSetting, type WeekStartDay } from '../lib/weekStart'
import {
  blockPersisting,
  createPersistStorage,
  markRawKnown,
  readChangedRaw,
  setPersistWriteHandlers,
  withoutPersisting,
} from '../lib/persistStorage'
import {
  BASELINE_KEY_PREFIX,
  RECOVERED_BASELINE_PREFIX,
  RECOVERED_LOCAL_KEY,
  onOtherTabChange,
  reloadWhenSaved,
  storedKeys,
  readStored,
  refreshStored,
  usingIndexedDb,
  writeStored,
} from '../lib/dataStore'
import { dropRowsDeletedInRecovered, mergeRecoveredState } from './recoverLocal'
import {
  BEFORE_RECOVERY_COPY_PREFIX,
  UNREADABLE_COPY_PREFIX,
  clearStorageCopies,
  keepStorageCopy,
  pruneStorageCopies,
  shrinkBaselines,
  clearSyncMirrors,
} from '../lib/deviceCleanup'
import {
  INBOX_ID,
  INBOX_LIST_ID,
  LEGACY_DATA_OWNER,
  LEGACY_PERSIST_STORAGE_KEY,
  PERSIST_STORAGE_KEY,
  STORE_VERSION,
} from './storeConstants'
import type { CalendarMode, DailyReminders, SectionGrouping, SettingsScrollTarget, SmartView, SortMode, TaskState } from './storeTypes'
import type { SyncState } from '../types/sync'
import { defaultLogCategories, initialLists } from './storeDefaults'
import { migratePersistedState, migrateTaskState } from './migrate'
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
import { createEventTemplatesSlice } from './slices/eventTemplates'
import { createDayMoodsSlice } from './slices/dayMoods'
import type { DayMoods } from '../lib/dayMood'
import { DEFAULT_TIMETABLE, type Timetable } from '../lib/timetable'
import { DEFAULT_ADDONS, withAddonOn, type Addons } from '../lib/addons'
import type { SleepTimer } from '../lib/sleepTimer'
import { normalizeDues } from '../lib/dues'
import { renameCourse, withAbsence, withAbsenceLimit, withAddedCourse, withRemovedCourse } from '../lib/schoolTerms'
import { schoolOfState } from './schoolOfState'
import { createEventSeriesSlice } from './slices/eventSeries'
import { DATA_KEYS, VIEW_KEYS, pickKeys } from './persistKeys'
import { SETTING_STAMPS, normalizeStoredState } from './storedSettings'

/*
 * タスク・リスト・習慣・記録・設定をまとめて持つストア（`lib/dataStore.ts` に保存。IndexedDB、使えない端末は localStorage）。
 * ここは作成と保存の設定だけ。操作は `slices/*.ts`、純粋な計算は `taskHelpers.ts` ほか、保存データの移行は `migrate.ts`
 */

export { MAX_EXTRA_TIME_ZONES, LEGACY_DATA_OWNER, INBOX_LIST_ID } from './storeConstants'
export type { ActiveTimer, CalendarMode, DailyReminders, SectionGrouping, SettingsScrollTarget, SmartView, SortMode } from './storeTypes'
export { recurrenceNextId } from './taskRecurrence'
export { selectLiveHabits } from './liveHabits'
import { asIncomingChange, isIncomingChange } from '../lib/changeOrigin'
import { pendingAddsAfterImport } from '../lib/labelPendingAdds'
import { clearBaseline } from '../lib/syncMerge'
import { readViewState } from './viewState'
import { DEFAULT_CANDIDATE_VIEW } from '../lib/plannerCandidates'
import { NO_COMPLETED_FILTER, NO_TODO_FILTER } from '../lib/taskFilter'
import { reportFailure } from '../lib/errorReport'
import { releaseOldestBackup } from '../lib/autoBackup'
import { flushPendingEdits } from '../lib/pendingEdits'

/** Renamed app: copy persisted state once from the old localStorage key（IndexedDB に移すときは `dataStore.ts` が移す） */
function migrateLegacyPersistKey(): void {
  if (typeof localStorage === 'undefined' || usingIndexedDb()) return
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

/**
 * 読めなかった保存データを、上書きされる前に別のキーへ写す（写しは新しい 1 つだけ。`deviceCleanup.ts`）。
 * 記録に残すのは どこで読めなかったか（`stage`）とエラーのメッセージだけ（中身は送らない）
 */
function preserveUnreadableStorage(stage: string, error: unknown) {
  reportFailure('storage', stage, error)
  try {
    const raw = readStored(PERSIST_STORAGE_KEY)
    if (raw) keepStorageCopy(UNREADABLE_COPY_PREFIX, raw)
  } catch {
    /* 写せなくても続ける */
  }
}

/**
 * 読めない行を外したら、その人の前回同期の控え（baseline）も捨てる（#484）。控えが残ると、外した行を次の同期で
 * 「この端末で消した」と読み、サーバーの正しい行を全端末から消していた。控えが無ければ次の同期は両方を残す合わせ方になり、
 * 外した行はサーバーから戻る。持ち主の分からない古いデータ（*legacy*）は、誰の控えか分からないので触らない
 */
function forgetBaselineOf(owner: unknown) {
  if (typeof owner === 'string' && owner !== LEGACY_DATA_OWNER) clearBaseline(owner)
}

/** 他のタブの変更を取り込む前に、手元の ⌘Z の一番上を差分にしておく（取り込んだ行をその操作に数えない） */
let settleUndoHistory = () => {}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => {
      const undo = createUndoHistory(set, get)
      settleUndoHistory = undo.settle
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
        plannerDateKey: appTodayKey(),
        habitsDateKey: appTodayKey(),
        theme: 'system' as 'light' | 'dark' | 'system',
        searchQuery: '',
        sortByKey: {} as Record<string, SortMode>,
        sectionGrouping: { lists: true, dueViews: false } as SectionGrouping,
        plannerCandidateView: DEFAULT_CANDIDATE_VIEW,
        todoFilter: NO_TODO_FILTER,
        completedFilter: NO_COMPLETED_FILTER,
        recentDeletes: [],
        moveBannerText: null as string | null,
        undoBanner: null as TaskState['undoBanner'],
        googleUndo: null as { id: string; text: string; at: number } | null,
        taskDragHoverListId: null as string | null,
        syncState: 'idle' as SyncState,
        lastSyncedAt: null as string | null,
        cloudPulledAt: null as string | null,
        syncRejected: [],
        dataOwner: null as string | null,
        quickAddRequested: false,
        quickAddPrefill: null,
        filterTag: null,
        filterColor: null,
        notificationsEnabled: false,
        recordPrompts: false,
        recordPromptTaskId: null as string | null,
        // 新規ユーザーは分類の候補が空だと記録がほぼ「未分類」になるので、よく使う分類を最初から置く
        timeLogTagPresets: defaultLogCategories(),
        logCategoryColors: assignColorsInOrder(defaultLogCategories()),
        logLabelTargets: {},
        logLabelIds: {},
        logLabelsUpdatedAt: null,
        logLabelPendingAdds: [],

        calendarEvents: [],
        googleEventColors: {},
        googleConnected: false,
        googleAccessToken: null,
        googleConnectionError: null,
        googleReconnectNeeded: false,
        googleCanWrite: false,
        googlePushFailed: 0,
        activeTimer: null,
        activeTimerUpdatedAt: null as string | null,
        sleepTimer: null as SleepTimer | null,
        sleepTimerUpdatedAt: null as string | null,
        completePromptTaskId: null as string | null,
        labelPromptLogId: null as string | null,
        dailyReminders: { planTime: null, wrapUpTime: null } as DailyReminders,
        reminderPromptDismissed: false,
        googleConnectLineDismissed: false,
        onboardingDone: false,
        onboardingCompleted: false,
        onboardingFinishedOn: null,
        installNudgeDismissed: false,
        signInNudgeDismissed: false,
        dailyCapacityMinutes: 480,
        sleepPrefs: DEFAULT_SLEEP_PREFS,
        defaultBlockMinutes: 60,
        eventReminderMinutes: null as number | null,
        appTimeZone: null as string | null,
        weekStartsOn: DEFAULT_WEEK_STARTS_ON as WeekStartDay,
        extraTimeZones: [] as ExtraTimeZone[],
        extraTimeZonesUpdatedAt: null as string | null,
        eventTemplates: [] as EventTemplate[],
        eventTemplatesUpdatedAt: null as string | null,
        courseLinks: [] as CourseLink[],
        courseLinksUpdatedAt: null as string | null,
        skippedEvents: [] as SkippedEvent[],
        skippedEventsUpdatedAt: null as string | null,
        myEventTimes: [] as MyEventTime[],
        myEventTimesUpdatedAt: null as string | null,
        dayMoods: {} as DayMoods,
        timetable: DEFAULT_TIMETABLE as Timetable,
        timetableUpdatedAt: null as string | null,
        addons: DEFAULT_ADDONS as Addons,
        addonsUpdatedAt: null as string | null,
        seriesEditScope: null,

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
        ...createEventTemplatesSlice(ctx),
        setCourseLink: (eventTitle: string, course: string) => {
          const next = withCourseLink(get().courseLinks, eventTitle, course)
          // 同じ中身なら時刻を付けない（同期で送り直さない）
          if (sameValue(next, get().courseLinks)) return
          set({ courseLinks: next })
        },
        addSkippedEvents: (events) => {
          const next = withSkipped(get().skippedEvents, events)
          if (next !== get().skippedEvents) set({ skippedEvents: next })
        },
        dropRestoredSkipped: (liveIds) => {
          const next = withoutRestored(get().skippedEvents, liveIds)
          if (next !== get().skippedEvents) set({ skippedEvents: next })
        },
        removeSkippedEvent: (id) => set({ skippedEvents: withRemoved(get().skippedEvents, id) }),
        setMyEventTime: (event, mine) => {
          if (event.isAllDay || event.skipped) return
          const cur = get().myEventTimes
          const next = withMyTime(cur, event, mine)
          if (next === cur || sameValue(next, cur)) return
          const tz = appTimeZone()
          const start = wallInZone(Date.parse(mine.start), tz)
          const end = wallInZone(Date.parse(mine.end), tz)
          undo.pushUndo({
            key: 'undo.myEventTime',
            params: { title: event.summary, date: shortDate(start.date), time: `${start.time}–${end.time}` },
          })
          set({ myEventTimes: next })
        },
        clearMyEventTime: (eventId) => {
          const cur = get().myEventTimes
          const next = withRemovedTime(cur, eventId)
          if (next === cur) return
          const event = get().calendarEvents.find((e) => e.id === eventId)
          undo.pushUndo({ key: 'undo.myEventTimeCleared', params: { title: event?.summary ?? '' } })
          set({ myEventTimes: next })
        },
        fitMyEventTimes: (events) => {
          const cur = get().myEventTimes
          const next = fitMyEventTimes(cur, events)
          if (next !== cur) set({ myEventTimes: next })
        },
        setAddonOn: (id, on) => {
          const next = withAddonOn(get().addons, id, on)
          if (sameValue(next, get().addons)) return
          set({ addons: next })
        },
        saveDue: (item) => {
          const cur = get().addons
          const has = cur.dues.some((d) => d.id === item.id)
          const dues = normalizeDues(has ? cur.dues.map((d) => (d.id === item.id ? item : d)) : [...cur.dues, item])
          if (sameValue(dues, cur.dues)) return
          undo.pushUndo()
          set({ addons: { ...cur, dues } })
        },
        deleteDue: (id) => {
          const cur = get().addons
          const due = cur.dues.find((d) => d.id === id)
          if (!due) return
          undo.pushUndo({ key: 'undo.dueDeleted', params: { name: due.title } })
          set({ addons: { ...cur, dues: cur.dues.filter((d) => d.id !== id) } })
        },
        saveSchool: (school) => {
          const cur = get().addons
          if (sameValue(school, schoolOfState(get()))) return
          // 学期・欠席・休める回数・授業も ⌘Z とトーストで戻せる
          undo.pushUndo()
          set({ addons: { ...cur, school } })
        },
        setCourseAbsent: (title, date, absent) => get().saveSchool(withAbsence(schoolOfState(get()), title, date, absent)),
        setCourseAbsenceLimit: (termId, title, limit) => get().saveSchool(withAbsenceLimit(schoolOfState(get()), termId, title, limit)),
        addCourse: (termId, title) => get().saveSchool(withAddedCourse(schoolOfState(get()), termId, title.trim())),
        renameAddedCourse: (from, to) => get().saveSchool(renameCourse(schoolOfState(get()), from, to.trim())),
        removeCourse: (termId, title, lms) =>
          get().asOneUndo(() => {
            const next = withRemovedCourse(schoolOfState(get()), termId, title, lms)
            if (sameValue(next, schoolOfState(get()))) return
            undo.pushUndo({ key: 'undo.absenceCourseRemoved', params: { name: title } })
            set({ addons: { ...get().addons, school: next } })
          }),
        ...createDayMoodsSlice(ctx),
        ...createEventSeriesSlice(ctx),
        ...undo.actions,
      }
    },
    {
      name: PERSIST_STORAGE_KEY,
      version: STORE_VERSION,
      storage: createPersistStorage<TaskState>(),
      // 読み込み（migrate）に失敗すると初期状態のまま動き、次の保存で元のデータを上書きしていた。
      // 保存を止め（#485）、保存されていた中身を別のキーへ写しておく（バナーから書き出せる。`StorageFullBanner`）
      onRehydrateStorage: () => (_state, error) => {
        if (!error) return
        console.error('[storage] could not load saved data', error)
        blockPersisting('unreadable')
        preserveUnreadableStorage('load', error)
      },
      // 一覧が配列でない・中身が壊れた行は、画面を描く前（読み込んだ直後の処理）で落ちて真っ白になる。
      // 読める行だけ使い、元の中身は別のキーに写しておく
      merge: (persisted, current) => {
        // 前の版は画面の状態や選んだ日も本体に保存していた。読むのはデータと画面の好みだけ（選んだ日などは今日から）
        const saved = pickKeys((persisted ?? {}) as Record<string, unknown>, [...DATA_KEYS, ...VIEW_KEYS])
        // 行の中身もバックアップの取り込みと同じ基準でそろえる（`title` が文字列でない・`tags` が配列でない行で描画が落ちていた）。
        // 設定も同じ表でそろえる（他のタブ・localStorage で動いた回と同じ、`storedSettings.ts`）。読めない一覧・前の版の保存に無い項目は既定値
        const { broken } = normalizeStoredState(saved)
        const merged = { ...current, ...(saved as Partial<TaskState>) } as TaskState
        if (broken) {
          preserveUnreadableStorage('load-rows', 'unreadable rows were dropped')
          forgetBaselineOf(merged.dataOwner)
        }
        return merged
      },
      migrate: migratePersistedState,
      // 保存するのはデータと設定だけ（一覧は persistKeys.ts）。画面の状態は別の保存先、通知・同期の状態は保存しない
      partialize: (state) => pickKeys(state as unknown as Record<string, unknown>, DATA_KEYS) as unknown as TaskState,
    },
  ),
)

/**
 * IndexedDB に移した後に localStorage で動いた回（開けなかった）の本体を合わせる（`dataStore.ts` の `RECOVERED_LOCAL_KEY`）。
 * 既定値（ストアの初期状態）と比べてその回で変えた分だけを入れる（`recoverLocal.ts`）。合わせた本体と取り込んだ印を消すのは
 * 同じトランザクション（書けなければ次に開いたときにもう一度）。ラベル表などの変えた時刻を進める購読より前に呼ぶ
 */
function takeInRecoveredLocal() {
  let raw: string | null
  try {
    raw = readStored(RECOVERED_LOCAL_KEY)
  } catch {
    return
  }
  if (raw === null) return
  try {
    const local = JSON.parse(raw) as { state?: Record<string, unknown>; version?: unknown }
    if (!local.state || typeof local.version !== 'number' || local.version > STORE_VERSION) throw new Error('unreadable recovered data')
    const localState = (local.version < STORE_VERSION ? migrateTaskState(local.state, local.version) : local.state) as unknown as Record<
      string,
      unknown
    >
    const pick = (s: TaskState) => pickKeys(s as unknown as Record<string, unknown>, DATA_KEYS) as Record<string, unknown>
    const merged = mergeRecoveredState(pick(useTaskStore.getState()), localState, pick(useTaskStore.getInitialState()))
    const { replaced } = merged
    let { state } = merged
    // その回で完全に消した行は戻さない（その回の控えと、置き換える前の控えを比べる）
    const owner = typeof localState.dataOwner === 'string' ? localState.dataOwner : null
    if (!replaced && owner) {
      const before = readStored(`${RECOVERED_BASELINE_PREFIX}${BASELINE_KEY_PREFIX}${owner}`)
      const after = readStored(`${BASELINE_KEY_PREFIX}${owner}`)
      if (before && after) state = dropRowsDeletedInRecovered(state, localState, JSON.parse(before), JSON.parse(after))
    }
    // 読み込み・他のタブと同じ基準でそろえる（読めない一覧はいまのストアの値のまま）
    normalizeStoredState(state)
    if (replaced) {
      // 別の人のデータだった: その回のほうにして、IndexedDB の本体は別のキーに残す
      const before = readStored(PERSIST_STORAGE_KEY)
      if (before) keepStorageCopy(BEFORE_RECOVERY_COPY_PREFIX, before)
    }
    useTaskStore.setState(state as Partial<TaskState>)
  } catch (err) {
    // 読めない・新しい版の中身: 合わせずに別のキーに残す
    reportFailure('storage', 'recovered', err)
    keepStorageCopy(UNREADABLE_COPY_PREFIX, raw)
  }
  writeStored(RECOVERED_LOCAL_KEY, null)
  for (const key of storedKeys()) if (key.startsWith(RECOVERED_BASELINE_PREFIX)) writeStored(key, null)
}
takeInRecoveredLocal()
// 前の版で溜まった写しは、新しい 1 つだけ残す。取り込み前の控えは期限を過ぎていれば読んだときに捨てる
pruneStorageCopies()
loadImportRollback()

/**
 * 開いていた画面・並び順などの好み（`VIEW_KEYS`）は、データとは別の小さな保存先に置く。
 * 画面を切り替えるたびに全データを書き直したり、他のタブに読み直させたりしないため
 */
const VIEW_STORAGE_KEY = 'chronograma-view-v1'
function restoreViewState() {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY)
    if (raw) {
      const saved = readViewState(JSON.parse(raw) as unknown)
      withoutPersisting(() => useTaskStore.setState(saved))
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
// 週の開始日も、React の外（`appWeekStartsOn()`）から読めるように合わせておく（読み込み直後・設定・他のタブ）
setAppWeekStartSetting(useTaskStore.getState().weekStartsOn)
useTaskStore.subscribe((s, prev) => {
  if (s.weekStartsOn !== prev.weekStartsOn) setAppWeekStartSetting(s.weekStartsOn)
})

/**
 * 取り込み（Notion・フォルダを畳む）でラベル表を変えた結果を当てる（#357）。ラベル表の変えた時刻は進めず、足した名前を覚えておき、
 * 次の同期で「無ければ足す」だけ送る（`labelSync.ts`）。時刻を進めると手元が新しい扱いになり、ほかの端末の編集を上書きしていた
 */
export function setStateWithImportedLabels(patch: Partial<TaskState>): void {
  const s = useTaskStore.getState()
  const pending = patch.timeLogTagPresets
    ? pendingAddsAfterImport(s.logLabelPendingAdds, s.timeLogTagPresets, patch.timeLogTagPresets)
    : s.logLabelPendingAdds
  asIncomingChange(() =>
    useTaskStore.setState(pending.length === s.logLabelPendingAdds.length ? patch : { ...patch, logLabelPendingAdds: pending }),
  )
}

/** 覚えておいた取り込みのラベルから外す（サーバーに届いた・手元で消した） */
export function dropPendingLabelAdds(names: readonly string[]): void {
  const s = useTaskStore.getState()
  const next = s.logLabelPendingAdds.filter((n) => !names.includes(n))
  if (next.length !== s.logLabelPendingAdds.length) useTaskStore.setState({ logLabelPendingAdds: next })
}

// 設定（ラベル表・他のタイムゾーン・よく入れる予定・科目のつながり・やらなかった予定・時間割・追加機能・睡眠のタイマー・動いているタイマー）を変えたら時刻を付ける
// （ほかの端末とどちらが新しいかを比べる）。同期・他のタブ・連携で届いた変更では付けない。どの設定がどの時刻かは `STORED_SETTINGS`
for (const [stamp, keys] of Object.entries(SETTING_STAMPS)) {
  useTaskStore.subscribe((s, prev) => {
    const cur = s as unknown as Record<string, unknown>
    const before = prev as unknown as Record<string, unknown>
    if (keys.every((k) => cur[k] === before[k])) return
    if (isIncomingChange() || isAdoptingFromOtherTab()) return
    useTaskStore.setState({ [stamp]: new Date().toISOString() } as Partial<TaskState>)
  })
}
useTaskStore.subscribe((s, prev) => {
  if (s.appTimeZone !== prev.appTimeZone || s.tasks !== prev.tasks) applyTimeZoneState()
})
// 自分の時間（#625）が変わったら（操作・同期・元に戻す・他のタブ）、出ている Google の予定に当て直す（入れるときは `setCalendarEvents`）
useTaskStore.subscribe((s, prev) => {
  if (s.myEventTimes === prev.myEventTimes) return
  const calendarEvents = withMyEventTimes(s.calendarEvents, s.myEventTimes)
  if (calendarEvents !== s.calendarEvents) useTaskStore.setState({ calendarEvents })
})

/**
 * To-Do のリスト（フォルダ）はラベルに畳む（`foldTaskFolders`）。前の版のデータ・前の版の端末から同期で届いたフォルダ・
 * 取り込んだバックアップのどれもここで畳む。同期で届いた変更の中でも、畳んだ結果はこの端末の変更として送る（`queueMicrotask` で同期の取り込みの外に出す）。
 * 畳んで作ったラベルはラベル表の変えた時刻を進めず、取り込みと同じく「無ければ足す」だけ送る（#357）。
 * 他のタブから取り込んだものは、そのタブが畳んで送る
 */
function foldFolders() {
  const s = useTaskStore.getState()
  const folded = foldTaskFolders(s, new Date().toISOString())
  // 畳んで作ったラベルは「無ければ足す」だけ送る（タスクの変更は届いた変更の扱いでも同期で送る）
  if (folded) setStateWithImportedLabels(folded)
}
/** To-Do はリストを開かず「すべて」で見る。未分類・消えたリストを開いていたら「すべて」へ */
function settleTodoView() {
  const s = useTaskStore.getState()
  if (s.selectedView !== null) return
  if (s.selectedListId && s.selectedListId !== INBOX_ID && s.lists.some((l) => l.id === s.selectedListId)) return
  useTaskStore.setState({ selectedView: 'all', selectedListId: null, quickAddSectionId: null })
}

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
    // 打っている途中のメモ・場所は先にストアに入れて保存する（読み込み直すと手元の書きかけは消える）
    if (typeof parsed.version === 'number' && parsed.version > STORE_VERSION) {
      flushPendingEdits()
      reloadWhenSaved()
    }
    return
  }
  const incoming: Record<string, unknown> = { ...parsed.state }
  // 取り込むのはデータだけ（画面の状態はタブごと。前の版の保存に残っていても無視する）
  for (const key of Object.keys(incoming)) if (!(DATA_KEYS as readonly string[]).includes(key)) delete incoming[key]
  // 行・設定の中身は読み込みと同じ基準でそろえる（`storedSettings.ts`）。読めない行は外し、元の中身は別のキーに写す
  const { broken } = normalizeStoredState(incoming)
  if (broken) {
    preserveUnreadableStorage('other-tab-rows', 'unreadable rows were dropped')
    forgetBaselineOf(typeof incoming.dataOwner === 'string' ? incoming.dataOwner : useTaskStore.getState().dataOwner)
  }
  const lists = Array.isArray(incoming.lists) ? (incoming.lists as TaskList[]) : null
  const sel = useTaskStore.getState().selectedListId
  if (lists && sel && !lists.some((l) => l.id === sel)) incoming.selectedListId = INBOX_LIST_ID
  // 打っている途中のメモ・場所（`pendingEdits.ts`）はここでは入れない。止まったときに取り込んだ後のタスクへ 1 項目だけ当たる
  adoptingFromOtherTab = true
  try {
    // ⌘Z の履歴は残す（行ごとに戻すので、取り込んだ他のタブの行は消さない）
    settleUndoHistory()
    // 保存し直さない（同じ内容を書くだけで、表示の状態だけが違う書き込みがタブ間を往復する）
    withoutPersisting(() => useTaskStore.setState(incoming as Partial<TaskState>))
  } finally {
    adoptingFromOtherTab = false
  }
}

// 他のタブが書いた（IndexedDB では BroadcastChannel、localStorage では storage イベント）
onOtherTabChange((keys) => {
  if (keys.includes(PERSIST_STORAGE_KEY)) adoptOtherTabChanges()
})
if (typeof window !== 'undefined') {
  // 戻る・進むでページごと復元されたとき・裏から戻ったときは、止まっていた間の知らせが届かないことがある。
  // 古いまま次の編集で全データを書き戻さないよう、1 回読み直す（中身が同じなら文字列を比べるだけ）
  const readAgain = () => {
    if (usingIndexedDb()) void refreshStored().then(adoptOtherTabChanges)
    else adoptOtherTabChanges()
  }
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) readAgain()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') readAgain()
  })
}

/**
 * 保存領域がいっぱいのとき。以前は保存が黙って失敗し（操作も途中で例外になり）、
 * 再読み込みすると、いっぱいになってからの編集がすべて消えていた
 */
let lostReported = false
setPersistWriteHandlers({
  // 取り込み前の控え・保存データの写し（どれも全データの写し）と、ログイン中の人以外の前回同期の控えの中身を手放してもう一度書く
  freeSpace: () => {
    let freed = false
    if (loadImportRollback() !== null) {
      clearImportRollback()
      freed = true
    }
    if (clearStorageCopies()) freed = true
    // 前回取得したサーバーの内容（次に開いたときに全部を取るだけ）
    if (clearSyncMirrors()) freed = true
    // 持ち主の分からない（*legacy*）・まだ同期していないデータは、ログイン中の人の控えがあるかで誰のものかを決めるので触らない
    const owner = useTaskStore.getState().dataOwner
    if (owner !== null && owner !== LEGACY_DATA_OWNER && shrinkBaselines(owner)) freed = true
    return freed
  },
  // 自動バックアップ（どれも全データの写しで、いちばん大きい）を古いものから手放す
  freeMoreSpace: releaseOldestBackup,
  // 保存先との接続が切れて開き直せなかった。バナー（`StorageFullBanner`）は `dataStoreLost` を見て再読み込みを促す
  onLost: () => {
    if (lostReported) return
    lostReported = true
    reportFailure('storage', 'connection-lost', 'the IndexedDB connection was lost and could not be reopened')
  },
  onFailed: (err) => {
    console.error('[storage] save failed', err)
    reportFailure('storage', 'save', err)
    // 保存の途中なので、知らせるのは今の更新が終わってから（保存し直すとまた失敗するので保存しない）
    queueMicrotask(() => {
      if (!useTaskStore.getState().storageFull) withoutPersisting(() => useTaskStore.setState({ storageFull: true }))
    })
  },
  onRecovered: () => {
    queueMicrotask(() => withoutPersisting(() => useTaskStore.setState({ storageFull: false })))
  },
})

// 他のタブからの取り込み（`isAdoptingFromOtherTab`）を見るので、それより後で
foldFolders()
settleTodoView()
// ゴミ箱に入れて 30 日たったものを消す（同期でサーバーからも消える。ほかの端末でその後に戻していれば、同期で戻る）
useTaskStore.getState().purgeExpiredDeleted()
useTaskStore.subscribe((s, prev) => {
  if (s.selectedListId !== prev.selectedListId || s.selectedView !== prev.selectedView || s.lists !== prev.lists) settleTodoView()
  if (s.lists === prev.lists && s.sections === prev.sections) return
  if (isAdoptingFromOtherTab() || !needsFold(s)) return
  queueMicrotask(foldFolders)
})
