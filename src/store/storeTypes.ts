/** ストア（`taskStore.ts`）の状態と操作の型。中身は `slices/*.ts` に分けて書く */
import type { Task } from '../types/task'
import type { ListKind, TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import type { CalendarEvent } from '../types/calendarEvent'
import type { Habit } from '../types/habit'
import type { ListColorPaletteId } from '../lib/listColorPalettes'
import type { CategoryColorKey } from '../lib/logCategoryColors'
import type { EventColorChoices } from '../lib/googleEventColors'
import type { SyncRejectedRow } from '../lib/supabaseData'
import type { ExtraTimeZone } from '../lib/extraTimeZones'

/**
 * トーストに出す文。ストアの中では文言を作らず、訳す鍵と値（`{ key, params }`）を渡す（言語は画面で決める）。
 * 画面で訳した文字列をそのまま渡すこともできる
 */
/** クラウド同期の状態 */
export type SyncState = 'idle' | 'syncing' | 'error'

export type ToastText = string | { key: string; params?: Record<string, string | number> }

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
 * 手動以外の並び順のとき、セクションの塊で分けるか。リストごと（`byList`、未設定は分ける）、
 * 「すべて」（`lists`）、期限で絞った一覧（今日・近日中・期限切れ、`dueViews`）で別に持つ。
 * 期限の一覧は「科目をまたいで締切順に見たい」ので、最初から分けない
 */
export type SectionGrouping = { lists: boolean; dueViews: boolean; byList?: Record<string, boolean> }

/** どの一覧の設定か。リストを開いているときはそのリストの ID */
export type SectionGroupingScope = 'lists' | 'dueViews' | { listId: string }

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

export interface TaskState {
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
  /** 並び順。リスト・ビューごと（鍵は `sortKeyOf`）。無い鍵は手動 */
  sortByKey: Record<string, SortMode>
  sectionGrouping: SectionGrouping
  /**
   * 直近の削除（トーストの「元に戻す」用）。消したタスクの id だけを持ち、中身はいつも `tasks` の `deletedAt` から読む
   * （タスクの写しを持つと、再読み込み・他のタブの取り込みのあとに中身とずれる）。保存しない
   */
  recentDeletes: { ids: string[]; at: number }[]
  quickAddRequested: boolean
  filterTag: string | null
  /** To‑Do を色（ラベル）で絞っているときの `#RRGGBB`（大文字）。「すべて」と組み合わせて「ラベルを開いた」状態になる */
  filterColor: string | null
  /** 締切の前の通知（前日 20:00 ＋ 時刻つきは 3 時間前） */
  notificationsEnabled: boolean
  /** 予定が終わったら「予定どおり / 記録する」を聞く */
  recordPrompts: boolean
  /** 通知の「記録する」から開く、記録を入れる予定（永続化しない） */
  recordPromptTaskId: string | null
  listColorPaletteId: ListColorPaletteId
  /** 活動ログのタグ候補（設定で編集、順序はタイムライン色の優先度に使う） */
  timeLogTagPresets: string[]
  /** 分類名 → 色キー（`logCategoryColors.ts`）。並べ替えても色が変わらないように保存する */
  logCategoryColors: Record<string, string>
  /** この端末でラベル表（timeLogTagPresets・logCategoryColors）を最後に変えた・同期で合わせた時刻。まだ無ければ null */
  logLabelsUpdatedAt: string | null

  calendarEvents: CalendarEvent[]
  /** Google の予定にアプリで付けた色（`googleEventColors.ts`）。API に出ない新しい色（アボカドなど）の代わり */
  googleEventColors: EventColorChoices
  googleConnected: boolean
  googleAccessToken: string | null
  googleConnectionError: string | null
  /** Google の予定を書き換えられる権限（calendar.events.owned など）があるか。古い接続は読み取りのみ */
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
  extraTimeZones: ExtraTimeZone[]
  /** 他のタイムゾーン（並び・名前）をこの端末で最後に変えた（または同期で合わせた）時刻。まだ無ければ null */
  extraTimeZonesUpdatedAt: string | null

  habits: Habit[]

  sections: ListSection[]
  /** Quick Add 時に付与するセクション（そのリストを開いているときのみ有効） */
  quickAddSectionId: string | null
  setQuickAddSectionId: (id: string | null) => void
  /** 端末の保存領域がいっぱいで、変更を保存できていない（保存しない） */
  storageFull: boolean

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
   * - `fromHex` は名前の無かった色（To‑Do ナビの色ラベル）。色を変えたらその色の予定・タスクも新しい色へ（名前が空なら色だけ変える）
   */
  saveLogLabels: (rows: ReadonlyArray<{ from: string | null; name: string; color: string; fromHex?: string }>) => void

  selectList: (id: string) => void
  selectView: (view: SmartView) => void
  openSettingsWithScroll: (target: SettingsScrollTarget) => void
  clearSettingsScrollTarget: () => void
  /** リストを開き、そのセクションを追加先にして見出しまでスクロールする（サイドバーのセクション） */
  selectListSection: (listId: string, sectionId: string) => void
  clearSectionScrollTarget: () => void
  /** リストを開いてタグで絞る（サイドバーの Canvas の科目タグ） */
  selectListTag: (listId: string, tag: string) => void
  setCalendarMode: (mode: CalendarMode) => void
  setSelectedCalendarDateKey: (key: string) => void
  setSearchQuery: (q: string) => void
  /** いま開いているリスト・ビューの並び順を変える */
  setSortMode: (mode: SortMode) => void
  setSectionGrouping: (scope: SectionGroupingScope, on: boolean) => void
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
  /** 今日の計画・一覧・タイムライン・統計から外す（達成日は残す）。「元に戻す」付きのトースト */
  archiveHabit: (id: string) => void
  /** アーカイブから戻す */
  restoreHabit: (id: string) => void
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
  setExtraTimeZones: (zones: ExtraTimeZone[]) => void
  /** 他のタイムゾーンに名前を付ける（空にすると外す） */
  setExtraTimeZoneLabel: (tz: string, label: string) => void
  /** 完了の切り替え。チェックリストのリストでは子のある行は子ごと、子がそろったら親も（`toggleChecklistTree`） */
  toggleTask: (id: string) => void
  updateTask: (
    id: string,
    patch: Partial<
      Pick<
        Task,
        | 'title'
        | 'category'
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
    /** 「元に戻す」トーストに出す文（ドラッグで動かしたときなど、変わったことが目に入りにくいとき） */
    label?: ToastText,
  ) => void
  /** 予定日をまとめて付け替える（持ち越し・明日へ回す）。時刻はクリアし、Undo は 1 段 */
  rescheduleTasks: (ids: string[], dateKey: string, label?: ToastText) => void
  /** まとめて書き換える。`label` を渡すと「元に戻す」トーストに出す（何件に何をしたか） */
  bulkUpdateTasks: (
    ids: string[],
    patch: Partial<Pick<Task, 'listId' | 'priority' | 'dueDate' | 'sectionId' | 'color'>>,
    label?: ToastText,
  ) => void
  /** 未完了のものだけまとめて完了にする（2 件以上なら件数のトースト）。Undo は 1 段 */
  completeTasks: (ids: string[]) => void
  /** ソフト削除（ゴミ箱へ）。対象と全子孫に deletedAt を付与。トースト/Undo 用に recentDeletes にも積む */
  deleteTask: (id: string) => void
  deleteTasks: (ids: string[]) => void
  /** チェックリストの「全部戻す」: 完了をまとめて外す（繰り返しの次回は作らない）。Undo は 1 段 */
  uncheckTasks: (ids: string[]) => void
  /** いつか → 「やること」（未分類）へ移して予定日を付ける。子を移したときは親から外して 1 件にする。Undo は 1 段 */
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

  moveBannerText: ToastText | null
  showMoveBanner: (text: ToastText) => void
  clearMoveBanner: () => void

  /**
   * 「元に戻す」を出す操作の説明（永続化しない）。削除以外の取り消せる操作
   * （一括アーカイブ・セクション削除・リスト移動など）でどれが戻せるのかを示す。
   * `at` は同じ文言が続いたときにトーストを出し直すための時刻。
   */
  undoBanner: { text: ToastText; at: number } | null
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
  syncState: SyncState
  /** 最後に同期が成功した時刻（ISO）。一度も成功していなければ null */
  lastSyncedAt: string | null
  setSyncState: (state: SyncState, lastSyncedAt?: string) => void
  /** 最後の同期でサーバーに受け付けられなかった行（永続化しない）。手元には残っている */
  syncRejected: SyncRejectedRow[]
  setSyncRejected: (rows: SyncRejectedRow[]) => void
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

