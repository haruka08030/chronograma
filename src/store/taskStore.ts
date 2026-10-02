import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Task } from '../types/task'
import type { ListKind, TaskList } from '../types/list'
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
import { inferLogCategory } from '../lib/logCategory'
import { CATEGORY_COLOR_KEYS, assignColorsInOrder, categoryHex, labelForHex, logLabelFromTask, nextCategoryColor, type CategoryColorKey } from '../lib/logCategoryColors'
import { nearestGoogleHex } from '../lib/googleColors'
import { eventChoiceKey, resolveEventColors, seriesChoiceKey, type EventColorChoices } from '../lib/googleEventColors'

const INBOX_COLOR = '#7986CB'
import { addDays, addWeeks, addMonths, addYears, format } from 'date-fns'
import i18n from '../i18n/config'
import { isListedTimeLog } from '../lib/timeLogTask'
import { isActiveTask } from '../lib/taskLifecycle'
import { buildHabitRecordIndex, habitDayStatus, habitRecordFor, habitRecordsFor, plannedRecordTimes } from '../lib/habitTiming'
import { canNestUnder, getIndentTargetId } from '../lib/taskDepth'
import { buildBackupPayload, parseBackupJson } from '../lib/backupFormat'
import { parseTasksCsv } from '../lib/importTasksCsv'
import { timerRecordTimes } from '../lib/timerRecord'
import { taskPlacementDate } from '../lib/taskTimeRange'
import { looksLikeSleep, sleepEndingOn, sleepSpan } from '../lib/sleep'
import { clearImportRollback, loadImportRollback, saveImportRollback } from '../lib/importRollback'
import { restoreMissing } from '../lib/autoBackup'
import { appTimeZone, isValidTimeZone, setAppTimeZoneSetting, zonedNow } from '../lib/timeZone'
import { reanchorTasks } from '../lib/taskTimeZone'

/** 時間バーに並べられる別のタイムゾーンの数（多いとタイムラインが狭くなる） */
export const MAX_EXTRA_TIME_ZONES = 2

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

/**
 * `dataOwner` の値。この印を付ける前の版から引き継いだデータで、誰のものか記録が無い。
 * その端末でこれまでどおり同期していた本人のものとして扱う
 */
export const LEGACY_DATA_OWNER = '*legacy*'

export type CalendarMode = 'month' | 'week'

export type SmartView =
  | 'planner'
  | 'all'
  | 'today'
  | 'upcoming'
  | 'overdue'
  | 'calendar'
  | 'stats'
  | 'habits'
  | 'archived'
  | 'deleted'
  | 'settings'

/** 設定画面を開いたときの一度きりのスクロール先（永続化しない） */
export type SettingsScrollTarget = 'appearance' | 'account' | 'install' | 'google'

export type SortMode = 'manual' | 'dueDate' | 'priority' | 'title' | 'createdAt'

/**
 * 手動以外の並び順のとき、セクションの塊で分けるか。リストと、期限で絞った一覧（今日・近日中・期限切れ）で別に持つ。
 * 期限の一覧は「科目をまたいで締切順に見たい」ので、最初から分けない
 */
export type SectionGrouping = { lists: boolean; dueViews: boolean }

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
  /** 「今日の計画」などタスクから開始したときの元タスク。停止時に完了確認を出す */
  taskId?: string | null
  /** 元タスクの名前の無い色。記録にそのまま付ける */
  color?: string | null
}

/** 朝のまとめの通知時刻（`HH:mm`）。null はオフ */
export interface DailyReminders {
  planTime: string | null
}

interface TaskState {
  tasks: Task[]
  lists: TaskList[]
  selectedListId: string | null
  selectedView: SmartView | null
  /** 設定を開いた直後のみ使い、スクロール後にクリア */
  settingsScrollTarget: SettingsScrollTarget | null
  /** サイドバーでセクションを押した直後のみ使い、リストがその見出しまでスクロールしたらクリア */
  sectionScrollTarget: string | null
  /** カレンダーハブ内の月 / 週表示（永続化） */
  calendarMode: CalendarMode
  /** カレンダーハブ・習慣一覧などで共有するフォーカス日（yyyy-MM-dd） */
  selectedCalendarDateKey: string
  /** `system` は OS のライト/ダークに合わせる */
  theme: 'light' | 'dark' | 'system'
  searchQuery: string
  sortMode: SortMode
  sectionGrouping: SectionGrouping
  deletedTasks: { task: Task; deletedAt: number }[]
  quickAddRequested: boolean
  filterTag: string | null
  /** To‑Do を色（ラベル）で絞っているときの `#RRGGBB`（大文字）。「すべて」と組み合わせて「ラベルを開いた」状態になる */
  filterColor: string | null
  /** 締切の前の通知（前日 20:00 ＋ 時刻つきは 3 時間前） */
  notificationsEnabled: boolean
  /** 予定が終わったら「予定どおり / 記録する」を聞く */
  recordPrompts: boolean
  /** To-Do のタグ（自由な文字の目印）を使うか。既定はオフで、詳細・行・統計に出さない */
  tagsEnabled: boolean
  /** 通知の「記録する」から開く、記録を入れる予定（永続化しない） */
  recordPromptTaskId: string | null
  listColorPaletteId: ListColorPaletteId
  /** 活動ログのタグ候補（設定で編集、順序はタイムライン色の優先度に使う） */
  timeLogTagPresets: string[]
  /** 分類名 → 色キー（`logCategoryColors.ts`）。並べ替えても色が変わらないように保存する */
  logCategoryColors: Record<string, string>

  calendarEvents: CalendarEvent[]
  /** Google の予定にアプリで付けた色（`googleEventColors.ts`）。API に出ない新しい色（アボカドなど）の代わり */
  googleEventColors: EventColorChoices
  googleConnected: boolean
  googleAccessToken: string | null
  googleConnectionError: string | null
  /** Google の予定を書き換えられる権限（calendar.events）があるか。古い接続は読み取りのみ */
  googleCanWrite: boolean

  activeTimer: ActiveTimer | null
  /** タイマー停止後に「完了にしますか？」を出すタスク（永続化しない） */
  completePromptTaskId: string | null
  dailyReminders: DailyReminders
  /** 「今日の計画」で通知の案内を閉じたか */
  reminderPromptDismissed: boolean
  /** 1 日に計画してよい時間（分）。超えたら穏やかに知らせる */
  dailyCapacityMinutes: number
  /** 予定の開始何分前に通知するか（null はオフ） */
  eventReminderMinutes: number | null
  /** アプリのタイムゾーン（IANA 名）。null は端末に合わせる */
  appTimeZone: string | null
  /** タイムラインの時間バーに並べて出す別のタイムゾーン（Google カレンダーの「他のタイムゾーンを表示」） */
  extraTimeZones: string[]

  habits: Habit[]

  sections: ListSection[]
  /** Quick Add 時に付与するセクション（そのリストを開いているときのみ有効） */
  quickAddSectionId: string | null
  setQuickAddSectionId: (id: string | null) => void

  addSection: (listId: string, name?: string) => string
  renameSection: (id: string, name: string) => void
  deleteSection: (id: string) => void
  reorderSections: (listId: string, orderedIds: string[]) => void
  /** 手動ソート: 表示中のルート未完了タスクの順と order を一致させ、任意で複数ルートの sectionId（と listId）を更新 */
  reorderManualRootTasks: (
    orderedTaskIds: string[],
    sectionUpdate?: { taskIds: string[]; sectionId: string | null; listId?: string },
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
  /** ルート直下のサブタスクをルートへ昇格（左ドラッグで 1 段上へ）。旧親の直後に同セクションで挿入 */
  promoteSubtaskToRoot: (taskId: string) => void
  /** 右ドラッグで 1 段下げる: 直前の表示兄弟の子にする。兄弟が無ければ何もしない（戻り値 false） */
  indentTaskUnderPrevSibling: (taskId: string) => boolean

  toggleTheme: () => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setListColorPalette: (id: ListColorPaletteId) => void
  setTimeLogTagPresets: (presets: string[]) => void
  /** 分類を追加（色は空いているものを自動で）。既にあれば何もしない */
  /** 分類を候補に足す。色（24 色のキーか `#RRGGBB`）を省くとまだ使っていない色 */
  addLogCategory: (name: string, color?: CategoryColorKey | string) => void
  moveLogCategory: (name: string, delta: -1 | 1) => void
  /**
   * ラベル（Google カレンダーのラベル編集と同じ）をまとめて保存する。Undo は 1 段。
   * - `from` は元の名前（新しい行は null）。名前を変えると記録も付け替える
   * - 消したラベルの記録は分類を外し、色だけ残す（Google と同じ）
   * - 分類の無い記録は、同じ色のラベルがあればその分類になる
   */
  saveLogLabels: (rows: ReadonlyArray<{ from: string | null; name: string; color: string }>) => void

  selectList: (id: string) => void
  selectView: (view: SmartView) => void
  openSettingsWithScroll: (target: SettingsScrollTarget) => void
  clearSettingsScrollTarget: () => void
  /** リストを開き、そのセクションを追加先にして見出しまでスクロールする（サイドバーのセクション） */
  selectListSection: (listId: string, sectionId: string) => void
  clearSectionScrollTarget: () => void
  setCalendarMode: (mode: CalendarMode) => void
  setSelectedCalendarDateKey: (key: string) => void
  setSearchQuery: (q: string) => void
  setSortMode: (mode: SortMode) => void
  setSectionGrouping: (scope: keyof SectionGrouping, on: boolean) => void
  requestQuickAdd: () => void
  clearQuickAddRequest: () => void
  setFilterTag: (tag: string | null) => void
  /** To‑Do の色ラベルを開く（「すべて」をその色で絞る） */
  selectColor: (hex: string) => void

  setCalendarEvents: (events: CalendarEvent[]) => void
  /**
   * Google の予定の色をアプリで付ける。`series` で繰り返しすべて、null で Google の色に戻す（この予定・シリーズとも）。
   * 色なしの予定は、付けた色から似たタイトルのものへ推定で広がる
   */
  setGoogleEventColor: (event: CalendarEvent, hex: string | null, scope: 'event' | 'series') => void
  setGoogleConnected: (connected: boolean) => void
  setGoogleAccessToken: (token: string | null) => void
  setGoogleConnectionError: (error: string | null) => void
  setGoogleCanWrite: (canWrite: boolean) => void

  addHabit: (fields: Pick<Habit, 'title' | 'color' | 'timeMode' | 'startTime' | 'endTime' | 'frequency'>) => void
  updateHabit: (id: string, patch: Partial<Pick<Habit, 'title' | 'color' | 'timeMode' | 'startTime' | 'endTime' | 'frequency'>>) => void
  deleteHabit: (id: string) => void
  /** 達成 ⇄ 未達成。時間を決めた習慣は、達成で予定どおりの時刻の記録を作り、外すとその記録をゴミ箱へ */
  toggleHabitDate: (habitId: string, dateKey: string) => void
  /** 未達成なら達成にして、記録が無ければ予定どおりの時刻で作る（タイムラインの習慣の枠のチェック） */
  completeHabitAsPlanned: (habitId: string, dateKey: string) => void

  addList: (name: string, kind?: ListKind) => void
  setListKind: (id: string, kind: ListKind) => void
  renameList: (id: string, name: string) => void
  updateListColor: (id: string, color: string) => void
  deleteList: (id: string) => void
  reorderList: (id: string, newOrder: number) => void
  reorderLists: (orderedIds: string[]) => void

  addTask: (title: string, listId?: string, parentId?: string) => string | undefined
  addTaskAfter: (afterTaskId: string, title: string) => string | undefined
  addTaskWithDate: (title: string, dueDate: string, listId?: string) => void
  addTaskWithTime: (title: string, dueDate: string, startTime: string, endTime: string, listId?: string) => void
  /** 予定から記録を作る。`color` は元の予定の色（Google の予定から写すとき） */
  addCompletedTaskWithTime: (title: string, dueDate: string, startTime: string, endTime: string, color?: string | null) => void
  addTimeLog: (
    title: string,
    date: string,
    startTime: string,
    endTime: string,
    tags?: string[],
    description?: string,
    endDate?: string | null,
    /** 名前の無い色（To-Do の色を引き継ぐとき）。あれば分類は推定しない */
    color?: string | null,
  ) => void
  /** 朝に入れる睡眠（寝た時刻・起きた時刻）。その朝の睡眠が既にあれば書き換える */
  logSleep: (wakeDateKey: string, bedTime: string, wakeTime: string) => void
  /** 記録を開始。既に走っていれば先にそれを記録として閉じる（黙って捨てない） */
  startTimer: (title: string, tags?: string[], taskId?: string | null, color?: string | null) => void
  stopTimer: () => void
  /** 止め忘れたタイマーを、指定した終了時刻までの記録にして閉じる */
  resolveStaleTimer: (endedAt: string) => void
  /** 止め忘れたタイマーを記録にせず捨てる */
  discardActiveTimer: () => void
  dismissCompletePrompt: () => void
  setDailyReminders: (patch: Partial<DailyReminders>) => void
  dismissReminderPrompt: () => void
  setDailyCapacityMinutes: (minutes: number) => void
  setEventReminderMinutes: (minutes: number | null) => void
  setAppTimeZone: (tz: string | null) => void
  setExtraTimeZones: (zones: string[]) => void
  toggleTask: (id: string) => void
  updateTask: (
    id: string,
    patch: Partial<
      Pick<
        Task,
        | 'title'
        | 'description'
        | 'dueDate'
        | 'dueTime'
        | 'scheduledDate'
        | 'endDate'
        | 'startTime'
        | 'endTime'
        | 'location'
        | 'timeZone'
        | 'reminders'
        | 'color'
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
  /** 予定日をまとめて付け替える（持ち越し・明日へ回す）。時刻はクリアし、Undo は 1 段 */
  rescheduleTasks: (ids: string[], dateKey: string) => void
  bulkUpdateTasks: (
    ids: string[],
    patch: Partial<Pick<Task, 'listId' | 'priority' | 'dueDate' | 'sectionId'>>,
  ) => void
  /** ソフト削除（ゴミ箱へ）。対象と全子孫に deletedAt を付与。トースト/Undo 用に deletedTasks も更新 */
  deleteTask: (id: string) => void
  deleteTasks: (ids: string[]) => void
  /** チェックリストの「全部戻す」: 完了をまとめて外す（繰り返しの次回は作らない）。Undo は 1 段 */
  uncheckTasks: (ids: string[]) => void
  /** いつか → 「やること」（未分類）へ移して予定日を付ける。Undo は 1 段 */
  promoteToPlanned: (id: string, dateKey: string) => void
  /** ゴミ箱から復元（対象と全子孫の deletedAt をクリア） */
  restoreDeletedTask: (id: string) => void
  /** ゴミ箱から完全に削除（対象と全子孫をストアから除去） */
  permanentlyDeleteTask: (id: string) => void
  /** ゴミ箱を空にする（deletedAt を持つ全タスクを完全削除） */
  emptyDeleted: () => void
  /** 名前を入れずに離れた新規タスクを、無かったことにする（ゴミ箱に入れず、取り消し履歴も残さない） */
  discardBlankTask: (id: string) => void
  /** アーカイブする（対象と全子孫に archivedAt を付与） */
  archiveTask: (id: string) => void
  /** 複数タスクをアーカイブ */
  archiveTasks: (ids: string[]) => void
  /** アーカイブから戻す（対象と全子孫の archivedAt をクリア） */
  unarchiveTask: (id: string) => void
  undoDelete: () => void
  /** 直前のデータ変更を 1 段階戻す（⌘Z）。成功時 true */
  /** 中の操作をまとめて 1 回の取り消しで戻せるようにする */
  asOneUndo: (fn: () => void) => void
  undoLastOperation: () => boolean
  /** ⌘Z で戻した変更をやり直す（⌘⇧Z）。成功時 true */
  redoLastOperation: () => boolean
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

  /**
   * 「元に戻す」を出す操作の説明（永続化しない）。削除以外の取り消せる操作
   * （一括アーカイブ・セクション削除・リスト移動など）でどれが戻せるのかを示す。
   * `at` は同じ文言が続いたときにトーストを出し直すための時刻。
   */
  undoBanner: { text: string; at: number } | null
  clearUndoBanner: () => void
  /** 消したばかりで、まだ Google に送っていない予定（トーストの「元に戻す」で取り消せる） */
  googleUndo: { id: string; text: string; at: number } | null
  setGoogleUndo: (next: { id: string; text: string } | null) => void

  /** タスクドラッグ中のドロップ先リスト（ホバー風ハイライト用・永続化しない） */
  taskDragHoverListId: string | null
  setTaskDragHoverListId: (id: string | null) => void

  /**
   * クラウド同期の状態（永続化しない）。以前は失敗が console にしか出ず、
   * 預けたデータが届いているのか利用者から分からなかった。
   * `error` は「最後の同期が失敗して未送信の変更がある」という意味。
   */
  syncState: 'idle' | 'syncing' | 'error'
  /** 最後に同期が成功した時刻（ISO）。一度も成功していなければ null */
  lastSyncedAt: string | null
  setSyncState: (state: 'idle' | 'syncing' | 'error', lastSyncedAt?: string) => void
  /**
   * 手元のタスク・リスト・習慣が誰のものか（ユーザー ID）。null はログインせずに作ったデータ。
   * 以前は記録が無く、ログアウト後に別の人がログインすると前の人のデータがその人のアカウントに混ざった
   */
  dataOwner: string | null
  setDataOwner: (userId: string | null) => void
  /** ログアウト時に、手元のタスク・リスト・習慣を消して初期状態に戻す（表示などの設定は残す） */
  resetLocalData: () => void

  toggleNotifications: () => void
  setRecordPrompts: (on: boolean) => void
  setTagsEnabled: (on: boolean) => void
  /** おすすめの通知をまとめてオン（朝のまとめ 8:00・予定の 10 分前・締切の前・記録の確認） */
  enableRecommendedNotifications: () => void
  openRecordPrompt: (taskId: string | null) => void
  /** 予定を予定どおりの時刻の記録にして完了（今より先の分は記録しない）。Undo は 1 段 */
  logPlanAsPlanned: (taskId: string) => void
  exportData: () => void
  importData: (json: string) => boolean
  /**
   * 直前の取り込みを取り消して、置き換える前の状態に戻す。
   * ⌘Z と違い、ページを再読み込みしたあとでも使える。控えが無ければ false
   */
  restoreBeforeImport: () => boolean
  /** 今の全データをバックアップと同じ JSON にする（自動バックアップ用） */
  backupJson: () => string
  /** 自動バックアップにあって今は無いものだけを戻す。戻したタスク数（読めなければ null） */
  restoreMissingFromBackup: (json: string) => number | null
  /** CSV からタスクを追加（既存データは保持） */
  importTasksFromCsv: (csv: string) => { imported: number; skipped: number; errors: string[] }
}

const defaultInbox: TaskList = {
  id: INBOX_ID,
  name: '未分類',
  // 予定はリストの色で塗るので、いちばん多い未分類は落ち着いたラベンダーに
  color: INBOX_COLOR,
  order: 0,
}

export const INBOX_LIST_ID = INBOX_ID

function defaultLogCategories(): string[] {
  return i18n.t('logCategories.defaults', { returnObjects: true }) as string[]
}

/** 分類が空なら推定で補う（`inferLogCategory`: 元タスク → 同じタイトル → 似たタイトル → Google の色 → 分類名） */
function withInferredCategory(
  tags: string[],
  state: Pick<TaskState, 'tasks' | 'timeLogTagPresets' | 'logCategoryColors'>,
  title: string,
  opts: { taskId?: string | null; colorHex?: string | null } = {},
): string[] {
  if (tags.length > 0) return tags
  const inferred = inferLogCategory(state.tasks, title, {
    sourceTaskId: opts.taskId,
    colorHex: opts.colorHex,
    categoryHexes: state.timeLogTagPresets.map((n) => [n, categoryHex(n, state.logCategoryColors)] as const),
    colorNames: new Set(CATEGORY_COLOR_KEYS.map((k) => i18n.t(`googleColors.${k}`))),
  })
  return inferred ? [inferred] : []
}

/**
 * 新規ユーザーの初期リスト。「未分類」だけだと Wish も買い物も全部そこに入って混ざるので、
 * 最初から「いつか」「買い物」を分けておく（既存ユーザーは永続化データが優先されるので作られない）
 */
function initialLists(): TaskList[] {
  return [
    defaultInbox,
    { id: newId(), name: i18n.t('lists.defaultSomeday'), color: '#F6BF26', order: 1, kind: 'someday' },
    { id: newId(), name: i18n.t('lists.defaultShopping'), color: '#33B679', order: 2, kind: 'checklist' },
  ]
}

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
      | 'dueTime'
      | 'scheduledDate'
      | 'endDate'
      | 'startTime'
      | 'endTime'
      | 'location'
      | 'timeZone'
      | 'reminders'
      | 'color'
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
  // 日付・時刻の列はいつもアプリのタイムゾーンで書く（`taskTimeZone.ts`）
  if (patch.timeZone !== undefined) applied.timeZoneAnchor = patch.timeZone ? appTimeZone() : null
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
  // 色＝分類: 記録の分類を選び直したら、Google から写した色より分類の色を優先する
  if (task.isTimeLog && patch.tags !== undefined && patch.color === undefined && patch.tags[0] && patch.tags[0] !== task.tags[0]) {
    applied.color = null
  }
  // 期限（dueDate）を外したら締め切り時刻と繰り返しもクリア（予定の時間幅は予定日側に紐づくので残す）
  if (patch.dueDate === null) {
    applied.dueTime = null
    applied.recurrence = null
  }
  // 予定日（scheduledDate）を外したら予定の時間幅もクリア
  if (patch.scheduledDate === null) {
    applied.startTime = null
    applied.endTime = null
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
  /** 分類名 → 色キー（`logCategoryColors.ts`）。並べ替えても色が変わらないように保存する */
  logCategoryColors: Record<string, string>
  selectedListId: string | null
  selectedView: SmartView | null
  quickAddSectionId: string | null
  sortMode: SortMode
  filterTag: string | null
  filterColor: string | null
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
    dueTime?: string | null
    scheduledDate?: string | null
    endDate?: string | null
    startTime?: string | null
    endTime?: string | null
    isTimeLog?: boolean
    completed?: boolean
    tags?: string[]
    color?: string | null
    habitId?: string | null
    isSleep?: boolean
  },
  order: number,
): Task {
  const now = new Date().toISOString()
  const task: Task = {
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
    dueTime: fields.dueTime ?? null,
    scheduledDate: fields.scheduledDate ?? null,
    endDate: fields.endDate ?? null,
    startTime: fields.startTime ?? null,
    endTime: fields.endTime ?? null,
    location: null,
    color: fields.color ?? null,
    priority: 'none',
    tags: fields.tags ?? [],
    recurrence: null,
    isTimeLog: fields.isTimeLog ?? false,
    habitId: fields.habitId ?? null,
    isSleep: fields.isSleep ?? false,
    archivedAt: null,
    deletedAt: null,
  }
  // 「睡眠」と付けた記録（後から記録・タイマー）も睡眠として扱う
  if (looksLikeSleep(task)) task.isSleep = true
  return task
}

/** 予定から作る記録（完了した時間ログ） */
function completedRecordPatch(
  s: TaskState,
  fields: { title: string; dueDate: string; startTime: string; endTime: string; color?: string | null; habitId?: string | null },
): Pick<TaskState, 'tasks'> {
  const { title, dueDate, startTime, endTime, color, habitId } = fields
  const maxOrder = Math.max(0, ...s.tasks.map((t) => t.order))
  const tags = withInferredCategory([], s, title, { colorHex: color })
  return {
    tasks: [
      ...s.tasks,
      makeTask({
        title, listId: INBOX_ID, dueDate, startTime, endTime, isTimeLog: true, completed: true,
        tags,
        // 色＝ラベル。ラベルが決まればその色で描き、決まらないときは Google の色をそのまま残す（名前の無い色）
        color: tags.length > 0 ? null : color ?? null,
        habitId: habitId ?? null,
      }, maxOrder + 1),
    ],
  }
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => {
      const undoStack: ChronogramaUndoSnapshot[] = []
      const redoStack: ChronogramaUndoSnapshot[] = []
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
          logCategoryColors: structuredClone(s.logCategoryColors),
          selectedListId: s.selectedListId,
          selectedView: s.selectedView,
          quickAddSectionId: s.quickAddSectionId,
          sortMode: s.sortMode,
          filterTag: s.filterTag,
          filterColor: s.filterColor,
          calendarMode: s.calendarMode,
          selectedCalendarDateKey: s.selectedCalendarDateKey,
          activeTimer: s.activeTimer ? structuredClone(s.activeTimer) : null,
        }
      }

      /**
       * 直前の状態を控える。`label` を渡した操作だけ「元に戻す」トーストを出す。
       * 削除は従来どおり `deletedTasks` 由来のトーストが出るので渡さない
       * （二重に出さないため）。
       */
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

      /**
       * Enter で増やした空の行がまだ名前を持たないまま、取り消し履歴の一番上が
       * 「その行を作る直前」の控えになっているか。名前付けと作成を 1 手として扱うのに使う
       */
      const isUnnamedJustCreated = (id: string) => {
        const task = get().tasks.find((t) => t.id === id)
        if (!task || task.title.trim()) return false
        const top = undoStack[undoStack.length - 1]
        return Boolean(top) && !top.tasks.some((t) => t.id === id)
      }

      return {
      tasks: [],
      lists: initialLists(),
      selectedListId: INBOX_ID,
      selectedView: 'planner' as SmartView | null,
      settingsScrollTarget: null as SettingsScrollTarget | null,
      sectionScrollTarget: null as string | null,
      calendarMode: 'week' as CalendarMode,
      selectedCalendarDateKey: format(zonedNow(), 'yyyy-MM-dd'),
      theme: 'system' as 'light' | 'dark' | 'system',
      searchQuery: '',
      sortMode: 'manual' as SortMode,
      sectionGrouping: { lists: true, dueViews: false } as SectionGrouping,
      deletedTasks: [],
      moveBannerText: null as string | null,
      undoBanner: null as { text: string; at: number } | null,
      googleUndo: null as { id: string; text: string; at: number } | null,
      taskDragHoverListId: null as string | null,
      syncState: 'idle' as 'idle' | 'syncing' | 'error',
      lastSyncedAt: null as string | null,
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

      setQuickAddSectionId: (id) => set({ quickAddSectionId: id }),

      addSection: (listId, name) => {
        const listSections = get().sections.filter((s) => s.listId === listId)
        const maxOrder = listSections.length === 0 ? -1 : Math.max(...listSections.map((s) => s.order))
        const sectionId = newId()
        pushUndo()
        set((s) => ({
          sections: [
            ...s.sections,
            { id: sectionId, listId, name: name?.trim() || i18n.t('sections.defaultName'), order: maxOrder + 1, updatedAt: new Date().toISOString() },
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
        pushUndo(i18n.t('undo.sectionDeleted', { name }))
        return set((s) => ({
          sections: s.sections.filter((sec) => sec.id !== id),
          tasks: s.tasks.map((t) => (t.sectionId === id ? { ...t, sectionId: null, updatedAt: new Date().toISOString() } : t)),
        }))
      },
      reorderSections: (listId, orderedIds) => {
        pushUndo()
        const now = new Date().toISOString()
        return set((s) => ({
          sections: s.sections.map((sec) => {
            if (sec.listId !== listId) return sec
            const idx = orderedIds.indexOf(sec.id)
            return idx >= 0 && sec.order !== idx ? { ...sec, order: idx, updatedAt: now } : sec
          }),
        }))
      },

      reorderManualRootTasks: (orderedTaskIds, sectionUpdate) => {
        const now = new Date().toISOString()
        const sectionSet =
          sectionUpdate && sectionUpdate.taskIds.length > 0
            ? new Set(sectionUpdate.taskIds)
            : null
        const targetListId = sectionUpdate?.listId
        const descendantsForListMove =
          targetListId && sectionSet
            ? expandDescendantIds(sectionUpdate!.taskIds, get().tasks)
            : null
        pushUndo()
        set((s) => ({
          tasks: s.tasks.map((t) => {
            const idx = orderedTaskIds.indexOf(t.id)
            const inSectionPatch = Boolean(sectionSet?.has(t.id))
            const inDescendantListMove = Boolean(
              descendantsForListMove?.has(t.id) && targetListId && t.listId !== targetListId,
            )
            if (idx < 0 && !inDescendantListMove) return t

            let next: Task = idx >= 0 ? { ...t, order: idx, updatedAt: now } : { ...t, updatedAt: now }
            if (inSectionPatch && sectionUpdate) {
              next = { ...next, sectionId: sectionUpdate.sectionId }
              if (targetListId) next = { ...next, listId: targetListId }
            } else if (inDescendantListMove && targetListId) {
              // ルートのリスト移動に子を追随（セクションはクリア）
              next = { ...next, listId: targetListId, sectionId: null }
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

      promoteSubtaskToRoot: (taskId) => {
        const s0 = get()
        const moved = s0.tasks.find((t) => t.id === taskId)
        if (!moved || moved.parentId == null) return
        const parent = s0.tasks.find((t) => t.id === moved.parentId)
        if (!parent) return
        // 親自身がサブタスクの場合は moveSubtaskInList で祖父母へ動かす。ここはルート直下のみ。
        if (parent.parentId != null) return
        if (isListedTimeLog(moved)) return

        pushUndo()
        set((s) => {
          const now = new Date().toISOString()
          const targetSectionId = parent.sectionId ?? null

          const rootOrder = s.tasks
            .filter(
              (t) =>
                t.parentId === null &&
                t.id !== taskId &&
                t.listId === parent.listId &&
                (t.sectionId ?? null) === targetSectionId,
            )
            .sort((a, b) => a.order - b.order)
            .map((t) => t.id)
          const parentIdx = rootOrder.indexOf(parent.id)
          if (parentIdx >= 0) rootOrder.splice(parentIdx + 1, 0, taskId)
          else rootOrder.push(taskId)

          const orderAtRoot = new Map<string, number>()
          rootOrder.forEach((id, i) => orderAtRoot.set(id, i))

          const oldSiblings = siblingIdsOrdered(s.tasks, parent.id, taskId)
          const orderAtOldParent = new Map<string, number>()
          oldSiblings.forEach((id, i) => orderAtOldParent.set(id, i))

          return {
            tasks: s.tasks.map((t) => {
              if (t.id === taskId) {
                return {
                  ...t,
                  parentId: null,
                  listId: parent.listId,
                  sectionId: targetSectionId,
                  order: orderAtRoot.get(taskId) ?? 0,
                  updatedAt: now,
                }
              }
              if (orderAtRoot.has(t.id) && t.parentId === null) {
                const o = orderAtRoot.get(t.id)
                if (o === undefined || o === t.order) return t
                return { ...t, order: o, updatedAt: now }
              }
              if (orderAtOldParent.has(t.id) && t.parentId === parent.id) {
                const o = orderAtOldParent.get(t.id)
                if (o === undefined || o === t.order) return t
                return { ...t, order: o, updatedAt: now }
              }
              return t
            }),
          }
        })
      },

      indentTaskUnderPrevSibling: (taskId) => {
        const s = get()
        const task = s.tasks.find((t) => t.id === taskId)
        const prevId = getIndentTargetId(s.tasks, taskId)
        if (!task || !prevId) return false

        if (task.parentId == null) get().nestRootUnderParent(taskId, prevId, null)
        else get().moveSubtaskInList(taskId, prevId, null)
        return true
      },

      setCalendarEvents: (events) => set((s) => ({ calendarEvents: resolveEventColors(events, s.googleEventColors) })),
      setGoogleEventColor: (event, hex, scope) => {
        set((s) => {
          const choices = { ...s.googleEventColors }
          const eKey = eventChoiceKey(event.id)
          const sKey = event.recurringEventId ? seriesChoiceKey(event.recurringEventId) : null
          if (hex === null) {
            delete choices[eKey]
            if (sKey && scope === 'series') delete choices[sKey]
          } else if (scope === 'series' && sKey) {
            choices[sKey] = { hex, title: event.summary }
            delete choices[eKey]
          } else {
            choices[eKey] = { hex, title: event.summary }
          }
          return { googleEventColors: choices, calendarEvents: resolveEventColors(s.calendarEvents, choices) }
        })
      },
      setGoogleConnected: (connected) => set({ googleConnected: connected }),
      setGoogleAccessToken: (token) => set({ googleAccessToken: token }),
      setGoogleConnectionError: (error) => set({ googleConnectionError: error }),
      setGoogleCanWrite: (canWrite) => set({ googleCanWrite: canWrite }),

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
        const name = get().habits.find((h) => h.id === id)?.title ?? ''
        pushUndo(i18n.t('undo.habitDeleted', { name }))
        return set((s) => ({ habits: s.habits.filter((h) => h.id !== id) }))
      },
      toggleHabitDate: (habitId, dateKey) => {
        const s0 = get()
        const habit = s0.habits.find((h) => h.id === habitId)
        if (!habit) return
        if (habitDayStatus(habit, dateKey, buildHabitRecordIndex(s0.tasks)) === 'missed') {
          get().completeHabitAsPlanned(habitId, dateKey)
          return
        }
        // その日の習慣の記録（チェックで作った記録・同じ名前の記録）も一緒に外す。ゴミ箱から戻せる
        const removeIds = new Set(habitRecordsFor(buildHabitRecordIndex(s0.tasks), habit, dateKey).map((t) => t.id))
        pushUndo()
        const nowIso = new Date().toISOString()
        const deletedAt = Date.now()
        set((s) => ({
          habits: s.habits.map((h) =>
            h.id === habitId
              ? { ...h, completedDates: h.completedDates.filter((d) => d !== dateKey), updatedAt: nowIso }
              : h,
          ),
          tasks: s.tasks.map((t) => (removeIds.has(t.id) ? { ...t, deletedAt: nowIso, updatedAt: nowIso } : t)),
          deletedTasks: [
            ...s.deletedTasks,
            ...s.tasks.filter((t) => removeIds.has(t.id)).map((t) => ({ task: t, deletedAt })),
          ],
        }))
      },
      completeHabitAsPlanned: (habitId, dateKey) => {
        const s0 = get()
        const habit = s0.habits.find((h) => h.id === habitId)
        if (!habit) return
        const index = buildHabitRecordIndex(s0.tasks)
        const times = plannedRecordTimes(habit)
        // その日に同じ名前の記録があれば（タイマーや手入力で記録済み）、それで判定するので新しく作らない
        const needsRecord = times !== null && !habitRecordFor(index, habit, dateKey)
        const alreadyChecked = habit.completedDates.includes(dateKey)
        if (alreadyChecked && !needsRecord) return
        pushUndo()
        const nowIso = new Date().toISOString()
        set((s) => {
          const habits = alreadyChecked
            ? s.habits
            : s.habits.map((h) =>
                h.id === habitId
                  ? { ...h, completedDates: [...h.completedDates, dateKey].sort(), updatedAt: nowIso }
                  : h,
              )
          if (!needsRecord) return { habits }
          return {
            habits,
            // 習慣の色を記録にも引き継ぐ。ラベルの色ならそのラベル（分類）になる
            ...completedRecordPatch(s, { title: habit.title, dueDate: dateKey, ...times, color: habit.color, habitId }),
          }
        })
      },

      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (theme) => set({ theme }),

      setListColorPalette: (id) => {
        pushUndo()
        set({ listColorPaletteId: id })
      },

      setTimeLogTagPresets: (presets) => {
        pushUndo()
        set({ timeLogTagPresets: normalizeTimeLogTagPresetList(presets) })
      },
      addLogCategory: (raw, color) => {
        const name = raw.trim()
        const s0 = get()
        if (!name || s0.timeLogTagPresets.includes(name)) return
        pushUndo()
        set({
          timeLogTagPresets: [...s0.timeLogTagPresets, name],
          logCategoryColors: {
            ...s0.logCategoryColors,
            [name]: color ?? s0.logCategoryColors[name] ?? nextCategoryColor(name, s0.logCategoryColors, s0.timeLogTagPresets),
          },
        })
      },
      moveLogCategory: (name, delta) => {
        const list = [...get().timeLogTagPresets]
        const i = list.indexOf(name)
        const j = i + delta
        if (i < 0 || j < 0 || j >= list.length) return
        pushUndo()
        ;[list[i], list[j]] = [list[j]!, list[i]!]
        set({ timeLogTagPresets: list })
      },
      saveLogLabels: (rows) => {
        pushUndo()
        const now = new Date().toISOString()
        set((s) => {
          const presets: string[] = []
          const colors: Record<string, string> = {}
          const rename = new Map<string, string>()
          for (const row of rows) {
            const name = row.name.trim()
            if (!name) continue
            if (row.from && row.from !== name) rename.set(row.from, name)
            if (presets.includes(name)) continue
            presets.push(name)
            colors[name] = row.color
          }
          // 予定・タスクは色（hex）だけ持つので、ラベルの色を変えたら同じ色の予定・タスクも新しい色へ
          const recolor = new Map<string, string>()
          for (const row of rows) {
            const name = row.name.trim()
            const from = row.from ?? name
            if (!name || !s.timeLogTagPresets.includes(from)) continue
            const oldHex = categoryHex(from, s.logCategoryColors).toUpperCase()
            const newHex = categoryHex(name, { ...s.logCategoryColors, ...colors }).toUpperCase()
            if (oldHex !== newHex) recolor.set(oldHex, newHex)
          }
          const kept = new Set([...presets, ...rename.keys()])
          const removedHex = new Map(
            s.timeLogTagPresets.filter((n) => !kept.has(n)).map((n) => [n, categoryHex(n, s.logCategoryColors)] as const),
          )
          const tasks = s.tasks.map((t) => {
            if (!t.isTimeLog) {
              const next = t.color ? recolor.get(t.color.toUpperCase()) : undefined
              return next ? { ...t, color: next, updatedAt: now } : t
            }
            const tag = t.tags[0]
            if (tag && rename.has(tag)) return { ...t, tags: [rename.get(tag)!], updatedAt: now }
            if (tag && removedHex.has(tag)) return { ...t, tags: [], color: removedHex.get(tag)!, updatedAt: now }
            if (!tag && t.color) {
              const label = labelForHex(t.color, presets, colors)
              if (label) return { ...t, tags: [label], color: null, updatedAt: now }
            }
            return t
          })
          return { timeLogTagPresets: presets, logCategoryColors: { ...s.logCategoryColors, ...colors }, tasks }
        })
      },

      // 色ラベルの絞り込みはラベルを開いている間だけ。別のリスト・ビューへ移ったら外す
      selectList: (id) => set({ selectedListId: id, selectedView: null, quickAddSectionId: null, settingsScrollTarget: null, filterColor: null }),
      selectView: (view) =>
        set({
          selectedView: view,
          selectedListId: null,
          quickAddSectionId: null,
          settingsScrollTarget: null,
          filterColor: null,
        }),
      selectColor: (hex) =>
        set({
          selectedView: 'all',
          selectedListId: null,
          quickAddSectionId: null,
          settingsScrollTarget: null,
          filterColor: hex.toUpperCase(),
        }),
      openSettingsWithScroll: (target) =>
        set({
          selectedView: 'settings',
          selectedListId: null,
          quickAddSectionId: null,
          settingsScrollTarget: target,
        }),
      clearSettingsScrollTarget: () => set({ settingsScrollTarget: null }),
      selectListSection: (listId, sectionId) =>
        set({
          selectedListId: listId,
          selectedView: null,
          quickAddSectionId: sectionId,
          sectionScrollTarget: sectionId,
          settingsScrollTarget: null,
          filterColor: null,
        }),
      clearSectionScrollTarget: () => set({ sectionScrollTarget: null }),
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
      setSectionGrouping: (scope, on) => set((s) => ({ sectionGrouping: { ...s.sectionGrouping, [scope]: on } })),
      setFilterTag: (tag) => {
        pushUndo()
        set({ filterTag: tag })
      },
      requestQuickAdd: () => {
        const s = get()
        // 色ラベルを開いているときはその場で追加する（追加したタスクにその色が付く）
        const colorView = s.selectedView === 'all' && s.filterColor !== null
        if (s.selectedView !== null && !colorView) {
          set({ selectedListId: s.selectedListId ?? INBOX_ID, selectedView: null, quickAddRequested: true })
        } else {
          set({ quickAddRequested: true })
        }
      },
      clearQuickAddRequest: () => set({ quickAddRequested: false }),

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
        pushUndo(i18n.t('undo.listDeleted', { name }))
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
        // カレンダーの日付セルからの追加は「予定日」として扱う
        set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: targetList, scheduledDate: dueDate }, ord)] }))
      },
      addTaskWithTime: (title, dueDate, startTime, endTime, listId) => {
        pushUndo()
        const targetList = listId ?? get().selectedListId ?? INBOX_ID
        const ord = orderForNewSiblingAtFront(get().tasks, targetList, null)
        // タイムライン上での作成は「予定日＋時間幅」
        set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: targetList, scheduledDate: dueDate, startTime, endTime }, ord)] }))
      },
      addCompletedTaskWithTime: (title, dueDate, startTime, endTime, color) => {
        pushUndo()
        set((s) => completedRecordPatch(s, { title, dueDate, startTime, endTime, color }))
      },
      addTimeLog: (title, date, startTime, endTime, tags, description, endDateArg, color) => {
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
            tags: color ? (tags ?? []) : withInferredCategory(tags ?? [], get(), title),
            color: color ?? null,
          },
          maxOrder + 1,
        )
        if (description !== undefined) {
          log.description = description
        }
        pushUndo()
        set((s) => ({ tasks: [...s.tasks, log] }))
      },
      logSleep: (wakeDateKey, bedTime, wakeTime) => {
        if (bedTime === wakeTime) return
        const { dueDate, endDate } = sleepSpan(wakeDateKey, bedTime, wakeTime)
        const existing = sleepEndingOn(get().tasks, wakeDateKey)
        pushUndo()
        if (existing) {
          const now = new Date().toISOString()
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === existing.id ? { ...t, dueDate, endDate, startTime: bedTime, endTime: wakeTime, updatedAt: now } : t,
            ),
          }))
          return
        }
        const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
        const log = makeTask(
          {
            title: i18n.t('sleep.title'),
            listId: INBOX_ID,
            dueDate,
            endDate,
            startTime: bedTime,
            endTime: wakeTime,
            isTimeLog: true,
            completed: true,
            isSleep: true,
          },
          maxOrder + 1,
        )
        set((s) => ({ tasks: [...s.tasks, log] }))
      },
      startTimer: (title, tags, taskId, color) => {
        // 走っているものを黙って捨てると記録が消える。先に記録にして閉じてから始め、切り替えたことを知らせる
        const previous = get().activeTimer
        if (previous) {
          // 1 分未満は記録に残らない（stopTimer と同じ判定）ので「保存して」とは言わない
          const saved = timerRecordTimes(previous.startedAt, new Date().toISOString()) !== null
          get().stopTimer()
          get().showMoveBanner(i18n.t(saved ? 'quickLog.switched' : 'quickLog.switchedUnsaved', { title: previous.taskTitle }))
        }
        set({
          activeTimer: {
            taskTitle: title,
            startedAt: new Date().toISOString(),
            tags: color ? (tags ?? []) : withInferredCategory(tags ?? [], get(), title, { taskId }),
            taskId: taskId ?? null,
            color: color ?? null,
          },
          completePromptTaskId: null,
        })
      },
      /** 取り残したタイマーを、指定の終了時刻までの記録にして閉じる */
      resolveStaleTimer: (endedAt) => {
        const timer = get().activeTimer
        if (!timer) return
        const times = timerRecordTimes(timer.startedAt, endedAt)
        if (!times) {
          set({ activeTimer: null, completePromptTaskId: null })
          return
        }
        const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
        pushUndo()
        set((s) => ({
          activeTimer: null,
          completePromptTaskId: null,
          tasks: [
            ...s.tasks,
            makeTask({
              title: timer.taskTitle,
              listId: INBOX_ID,
              ...times,
              isTimeLog: true,
              completed: true,
              tags: timer.tags,
              color: timer.color ?? null,
            }, maxOrder + 1),
          ],
        }))
      },
      discardActiveTimer: () => set({ activeTimer: null, completePromptTaskId: null }),
      dismissCompletePrompt: () => set({ completePromptTaskId: null }),
      setDailyReminders: (patch) => set((s) => ({ dailyReminders: { ...s.dailyReminders, ...patch } })),
      dismissReminderPrompt: () => set({ reminderPromptDismissed: true }),
      setDailyCapacityMinutes: (minutes) => set({ dailyCapacityMinutes: Math.max(60, Math.round(minutes)) }),
      setAppTimeZone: (tz) => {
        const next = tz && isValidTimeZone(tz) ? tz : null
        setAppTimeZoneSetting(next)
        // タイムゾーンを決めたタスクは同じ瞬間のまま新しいタイムゾーンの時刻に（決めていないものは壁時計のまま）
        set((s) => ({ appTimeZone: next, tasks: reanchorTasks(s.tasks) }))
      },
      setExtraTimeZones: (zones) =>
        set({ extraTimeZones: [...new Set(zones.filter((z) => isValidTimeZone(z)))].slice(0, MAX_EXTRA_TIME_ZONES) }),
      setEventReminderMinutes: (minutes) => set({ eventReminderMinutes: minutes }),
      stopTimer: () => {
        const timer = get().activeTimer
        if (!timer) return
        // 1 分未満は誤操作とみなして記録しない（`timerRecordTimes` が null を返す）
        const times = timerRecordTimes(timer.startedAt, new Date().toISOString())
        if (!times) {
          set({ activeTimer: null, completePromptTaskId: null })
          return
        }
        const { dueDate, endDate, startTime, endTime } = times
        const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
        const linked = timer.taskId ? get().tasks.find((t) => t.id === timer.taskId) : null
        pushUndo()
        set((s) => ({
          activeTimer: null,
          completePromptTaskId: linked && !linked.completed ? linked.id : null,
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
              color: timer.color ?? null,
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
              scheduledDate: tsk.scheduledDate
                ? nextDueDate(tsk.scheduledDate, tsk.recurrence)
                : tsk.scheduledDate ?? null,
              createdAt: now,
              updatedAt: now,
            }
            newTasks = [...newTasks, next]
          }
          return { tasks: newTasks }
        })
      },
      updateTask: (id, patch) => {
        // 作った直後の空の行に名前を付けるだけなら、作成と同じ 1 手にまとめる
        if (!isUnnamedJustCreated(id)) pushUndo()
        return set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? applyTaskPatch(t, patch) : t)),
        }))
      },
      rescheduleTasks: (ids, dateKey) => {
        if (ids.length === 0) return
        pushUndo()
        const selected = new Set(ids)
        set((s) => ({
          tasks: s.tasks.map((t) =>
            selected.has(t.id)
              ? applyTaskPatch(t, { scheduledDate: dateKey, startTime: null, endTime: null })
              : t,
          ),
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
        const s0 = get()
        const del = expandDescendantIds([id], s0.tasks)
        const toSoftDelete = s0.tasks.filter((t) => del.has(t.id) && !t.deletedAt)
        if (toSoftDelete.length === 0) return
        pushUndo()
        const nowIso = new Date().toISOString()
        const deletedAt = Date.now()
        set((s) => ({
          tasks: s.tasks.map((t) =>
            del.has(t.id) && !t.deletedAt ? { ...t, deletedAt: nowIso, updatedAt: nowIso } : t,
          ),
          deletedTasks: [
            ...s.deletedTasks,
            ...toSoftDelete.map((t) => ({ task: t, deletedAt })),
          ],
        }))
      },
      uncheckTasks: (ids) => {
        if (ids.length === 0) return
        pushUndo()
        const set_ = new Set(ids)
        const now = new Date().toISOString()
        set((s) => ({
          tasks: s.tasks.map((t) =>
            set_.has(t.id) && t.completed ? { ...t, completed: false, completedAt: null, updatedAt: now } : t,
          ),
        }))
      },
      promoteToPlanned: (id, dateKey) => {
        const s0 = get()
        if (!s0.tasks.some((t) => t.id === id)) return
        const family = expandDescendantIds([id], s0.tasks)
        pushUndo()
        const now = new Date().toISOString()
        set((s) => {
          const maxOrder = Math.max(0, ...s.tasks.filter((t) => t.listId === INBOX_ID && t.parentId === null).map((t) => t.order))
          return {
            tasks: s.tasks.map((t) => {
              if (!family.has(t.id)) return t
              if (t.id === id) {
                return { ...t, listId: INBOX_ID, sectionId: null, order: maxOrder + 1, scheduledDate: dateKey, updatedAt: now }
              }
              return { ...t, listId: INBOX_ID, sectionId: null, updatedAt: now }
            }),
          }
        })
      },
      deleteTasks: (ids) => {
        if (ids.length === 0) return
        const s0 = get()
        const del = expandDescendantIds(ids, s0.tasks)
        const toSoftDelete = s0.tasks.filter((t) => del.has(t.id) && !t.deletedAt)
        if (toSoftDelete.length === 0) return
        pushUndo()
        const nowIso = new Date().toISOString()
        const deletedAt = Date.now()
        set((s) => ({
          tasks: s.tasks.map((t) =>
            del.has(t.id) && !t.deletedAt ? { ...t, deletedAt: nowIso, updatedAt: nowIso } : t,
          ),
          deletedTasks: [
            ...s.deletedTasks,
            ...toSoftDelete.map((t) => ({ task: t, deletedAt })),
          ],
        }))
      },
      restoreDeletedTask: (id) => {
        const s0 = get()
        const ids = expandDescendantIds([id], s0.tasks)
        if (![...ids].some((tid) => s0.tasks.find((t) => t.id === tid)?.deletedAt)) return
        pushUndo()
        const nowIso = new Date().toISOString()
        set((s) => ({
          tasks: s.tasks.map((t) =>
            ids.has(t.id) && t.deletedAt ? { ...t, deletedAt: null, updatedAt: nowIso } : t,
          ),
          deletedTasks: s.deletedTasks.filter((d) => !ids.has(d.task.id)),
        }))
      },
      permanentlyDeleteTask: (id) => {
        const s0 = get()
        const del = expandDescendantIds([id], s0.tasks)
        if (![...del].some((tid) => s0.tasks.some((t) => t.id === tid))) return
        pushUndo()
        set((s) => ({
          tasks: s.tasks.filter((t) => !del.has(t.id)),
          deletedTasks: s.deletedTasks.filter((d) => !del.has(d.task.id)),
        }))
      },
      discardBlankTask: (id) => {
        const s0 = get()
        const task = s0.tasks.find((t) => t.id === id)
        if (!task || task.title.trim() || task.description.trim()) return
        if (s0.tasks.some((t) => t.parentId === id)) return
        // 作った直後の控えも捨てる。残すと「取り消し」が何も起きない一手になる
        if (isUnnamedJustCreated(id)) undoStack.pop()
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
      },
      emptyDeleted: () => {
        const s0 = get()
        if (!s0.tasks.some((t) => t.deletedAt)) return
        pushUndo()
        set((s) => ({
          tasks: s.tasks.filter((t) => !t.deletedAt),
          deletedTasks: [],
        }))
      },
      archiveTask: (id) => {
        get().archiveTasks([id])
      },
      archiveTasks: (ids) => {
        if (ids.length === 0) return
        const s0 = get()
        const target = expandDescendantIds(ids, s0.tasks)
        const toArchive = s0.tasks.filter((t) => target.has(t.id) && !t.archivedAt && !t.deletedAt)
        if (toArchive.length === 0) return
        pushUndo(i18n.t('undo.tasksArchived', { count: toArchive.length }))
        const nowIso = new Date().toISOString()
        set((s) => ({
          tasks: s.tasks.map((t) =>
            target.has(t.id) && !t.archivedAt && !t.deletedAt
              ? { ...t, archivedAt: nowIso, updatedAt: nowIso }
              : t,
          ),
        }))
      },
      unarchiveTask: (id) => {
        const s0 = get()
        const ids = expandDescendantIds([id], s0.tasks)
        if (![...ids].some((tid) => s0.tasks.find((t) => t.id === tid)?.archivedAt)) return
        pushUndo()
        const nowIso = new Date().toISOString()
        set((s) => ({
          tasks: s.tasks.map((t) =>
            ids.has(t.id) && t.archivedAt ? { ...t, archivedAt: null, updatedAt: nowIso } : t,
          ),
        }))
      },
      undoDelete: () =>
        set((s) => {
          if (s.deletedTasks.length === 0) return s
          const lastDeletedAt = Math.max(...s.deletedTasks.map((d) => d.deletedAt))
          const restoreIds = new Set(
            s.deletedTasks.filter((d) => d.deletedAt === lastDeletedAt).map((d) => d.task.id),
          )
          const nowIso = new Date().toISOString()
          return {
            tasks: s.tasks.map((t) =>
              restoreIds.has(t.id) && t.deletedAt ? { ...t, deletedAt: null, updatedAt: nowIso } : t,
            ),
            deletedTasks: s.deletedTasks.filter((d) => d.deletedAt !== lastDeletedAt),
          }
        }),
      clearDeletedTasks: () => set({ deletedTasks: [] }),
      reorderTask: (id, newOrder) => {
        pushUndo()
        return set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, order: newOrder, updatedAt: new Date().toISOString() } : t,
          ),
        }))
      },
      reorderTasks: (orderedIds) => {
        pushUndo()
        const now = new Date().toISOString()
        return set((s) => ({
          tasks: s.tasks.map((t) => {
            const idx = orderedIds.indexOf(t.id)
            return idx >= 0 && t.order !== idx ? { ...t, order: idx, updatedAt: now } : t
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
                  isActiveTask(t) &&
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
                  isActiveTask(t) &&
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

      clearUndoBanner: () => set({ undoBanner: null }),
      setGoogleUndo: (next) => set({ googleUndo: next ? { ...next, at: Date.now() } : null }),

      setTaskDragHoverListId: (id) => set({ taskDragHoverListId: id }),

      setSyncState: (state, lastSyncedAt) =>
        set(lastSyncedAt ? { syncState: state, lastSyncedAt } : { syncState: state }),

      setDataOwner: (userId) => set({ dataOwner: userId }),

      resetLocalData: () => {
        // 取り消しの履歴や取り込み前の控えにも前の人のデータが残っている
        undoStack.length = 0
        redoStack.length = 0
        clearImportRollback()
        set({
          tasks: [],
          lists: initialLists(),
          sections: [],
          habits: [],
          deletedTasks: [],
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

      toggleNotifications: () =>
        set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),
      setRecordPrompts: (on) => set({ recordPrompts: on }),
      setTagsEnabled: (on) => set(on ? { tagsEnabled: true } : { tagsEnabled: false, filterTag: null }),
      enableRecommendedNotifications: () =>
        set((s) => ({
          dailyReminders: { planTime: s.dailyReminders.planTime ?? '08:00' },
          eventReminderMinutes: s.eventReminderMinutes ?? 10,
          notificationsEnabled: true,
          recordPrompts: true,
        })),
      openRecordPrompt: (taskId) => set({ recordPromptTaskId: taskId }),
      logPlanAsPlanned: (taskId) => {
        const task = get().tasks.find((t) => t.id === taskId)
        const date = task ? taskPlacementDate(task) : null
        if (!task || task.completed || task.isTimeLog || !date || !task.startTime || !task.endTime) return
        const now = zonedNow()
        const today = format(now, 'yyyy-MM-dd')
        const nowHm = format(now, 'HH:mm')
        if (date > today || (date === today && task.startTime >= nowHm)) return
        const end = date === today && task.endTime > nowHm ? nowHm : task.endTime
        get().asOneUndo(() => {
          const { timeLogTagPresets, logCategoryColors } = get()
          const label = logLabelFromTask(task, timeLogTagPresets, logCategoryColors)
          get().addTimeLog(task.title, date, task.startTime!, end, label.tags, undefined, null, label.color)
          get().toggleTask(task.id)
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
        pushUndo(i18n.t('undo.restoredFromBackup', { count: addedTasks }))
        set(next)
        return addedTasks
      },

      exportData: () => {
        const data = JSON.stringify(JSON.parse(get().backupJson()), null, 2)
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
        pushUndo(i18n.t('undo.imported', { count: parsed.tasks.length }))
        set({
          tasks: parsed.tasks,
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
        const parsed = parseBackupJson(saved.json)
        if (!parsed) {
          clearImportRollback()
          return false
        }
        pushUndo()
        set({
          tasks: parsed.tasks,
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
        pushUndo(i18n.t('alert.csvImported', { count: newTasks.length, skipped }))
        set((st) => ({ tasks: [...st.tasks, ...newTasks] }))
        return { imported: newTasks.length, skipped, errors: [] }
      },

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
      }
    },
    {
      name: PERSIST_STORAGE_KEY,
      version: 34,
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
        if (version < 23) {
          const tasks = (state.tasks as Record<string, unknown>[]) ?? []
          state.tasks = tasks.map((t) => ({
            ...t,
            location:
              typeof (t as Record<string, unknown>).location === 'string'
                ? ((t as Record<string, unknown>).location as string)
                : null,
          }))
        }
        if (version < 24) {
          const tasks = (state.tasks as Record<string, unknown>[]) ?? []
          state.tasks = tasks.map((t) => {
            const rec = t as Record<string, unknown>
            const dueTime = typeof rec.dueTime === 'string' ? rec.dueTime : null
            // 既存の「時間付き通常タスク」は期限日に予定されていたものとして予定日へ引き継ぐ
            const isLog = rec.isTimeLog === true
            const hasRange = typeof rec.startTime === 'string' && typeof rec.endTime === 'string'
            let scheduledDate: string | null =
              typeof rec.scheduledDate === 'string' ? (rec.scheduledDate as string) : null
            if (scheduledDate === null && !isLog && hasRange && typeof rec.dueDate === 'string') {
              scheduledDate = rec.dueDate as string
            }
            return { ...rec, dueTime, scheduledDate }
          })
        }
        if (version < 25) {
          const tasks = (state.tasks as Record<string, unknown>[]) ?? []
          state.tasks = tasks.map((t) => {
            const rec = t as Record<string, unknown>
            return {
              ...rec,
              archivedAt: typeof rec.archivedAt === 'string' ? rec.archivedAt : null,
              deletedAt: typeof rec.deletedAt === 'string' ? rec.deletedAt : null,
            }
          })
        }
        if (version < 26) {
          // 分類を 1 つも持っていないと記録がほぼ「未分類」になるので、既定の分類を入れる
          const presets = state.timeLogTagPresets
          if (!Array.isArray(presets) || presets.length === 0) state.timeLogTagPresets = defaultLogCategories()
        }
        if (version < 28) {
          // パレットを Google カレンダーの 11 色に統一: 既存の色を色味の最も近い色へ
          const lists = (state.lists as Record<string, unknown>[] | undefined) ?? []
          state.lists = lists.map((l) => ({
            ...l,
            color: l.id === INBOX_ID ? INBOX_COLOR : nearestGoogleHex(String(l.color ?? '')),
          }))
          const habits = (state.habits as Record<string, unknown>[] | undefined) ?? []
          state.habits = habits.map((h) => ({ ...h, color: nearestGoogleHex(String(h.color ?? '')) }))
        }
        if (version < 27) {
          // 色は並び順から決めていたので、今見えている色のまま固定する（並べ替えで変わらないように）
          const presets = Array.isArray(state.timeLogTagPresets) ? (state.timeLogTagPresets as string[]) : []
          if (!state.logCategoryColors || typeof state.logCategoryColors !== 'object') {
            state.logCategoryColors = assignColorsInOrder(presets)
          }
        }
        if (version < 29) {
          // 記録画面は「今日」に統合した
          if (state.selectedView === 'activity-log') state.selectedView = 'planner'
        }
        if (version < 30) {
          // 色＝ラベル: Google の色だけ写した記録は、同じ色のラベル（分類）があればそれにする
          const presets = Array.isArray(state.timeLogTagPresets) ? (state.timeLogTagPresets as string[]) : []
          const colors = (state.logCategoryColors as Record<string, string> | undefined) ?? {}
          const now = new Date().toISOString()
          const tasks = (state.tasks as Task[] | undefined) ?? []
          state.tasks = tasks.map((t) => {
            if (!t.isTimeLog || t.tags.length > 0) return t
            const name = labelForHex(t.color, presets, colors)
            return name ? { ...t, tags: [name], color: null, updatedAt: now } : t
          })
        }
        if (version < 31) {
          // 「予定と記録」画面はカレンダー（週・予定｜記録の 2 列）に統合した
          if (state.selectedView === 'plan-vs-actual') {
            state.selectedView = 'calendar'
            state.calendarMode = 'week'
          }
        }
        if (version < 32) {
          // 睡眠は専用の記録にした: 「睡眠」で付けていた記録に印を付ける
          const now = new Date().toISOString()
          const tasks = (state.tasks as Task[] | undefined) ?? []
          state.tasks = tasks.map((t) => (looksLikeSleep(t) ? { ...t, isSleep: true, updatedAt: now } : t))
        }
        if (version < 33) {
          // 持ち主の記録はこの版から。それまでのデータは、この端末で同期していた本人のものとみなす
          state.dataOwner = LEGACY_DATA_OWNER
        }
        if (version < 34) {
          // 夕方の締めの通知は廃止した（予定ごとの記録の確認に置き換え）
          const r = state.dailyReminders as Record<string, unknown> | undefined
          if (r) state.dailyReminders = { planTime: typeof r.planTime === 'string' ? r.planTime : null }
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
          googleConnected,
          googleAccessToken,
          googleConnectionError,
          googleCanWrite,
          moveBannerText,
          undoBanner,
          googleUndo,
          taskDragHoverListId,
          syncState,
          lastSyncedAt,
          settingsScrollTarget,
          sectionScrollTarget,
          completePromptTaskId,
          recordPromptTaskId,
          ...rest
        } = state
        void completePromptTaskId
        void recordPromptTaskId
        void searchQuery
        void deletedTasks
        void quickAddRequested
        void filterTag
        void calendarEvents
        void googleConnected
        void googleAccessToken
        void googleConnectionError
        void googleCanWrite
        void moveBannerText
        void undoBanner
        void googleUndo
        void taskDragHoverListId
        void syncState
        void lastSyncedAt
        void settingsScrollTarget
        void sectionScrollTarget
        return rest as unknown as TaskState
      },
    },
  ),
)

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
applyTimeZoneState()
useTaskStore.subscribe((s, prev) => {
  if (s.appTimeZone !== prev.appTimeZone || s.tasks !== prev.tasks) applyTimeZoneState()
})
