/** ストア（`taskStore.ts`）の状態と操作の型。中身は `slices/*.ts` に分けて書く */
import type { Task } from '../types/task'
import type { ListKind, TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import type { CalendarEvent } from '../types/calendarEvent'
import type { Habit } from '../types/habit'
import type { CategoryColorKey } from '../lib/logCategoryColors'
import type { EventColorChoices } from '../lib/googleEventColors'
import type { SyncRejectedRow } from '../lib/supabaseData'
import type { ExtraTimeZone } from '../lib/extraTimeZones'
import type { EventTemplate } from '../lib/eventTemplates'
import type { CourseLink } from '../lib/courseLinks'
import type { SkippedEvent } from '../lib/skippedEvents'
import type { Timetable } from '../lib/timetable'
import type { AddonId, Addons } from '../lib/addons'
import type { SleepTimer } from '../lib/sleepTimer'
import type { DueItem } from '../lib/dues'
import type { SeriesRule, SeriesScope } from '../lib/eventSeries'
import type { DayMoods, Mood } from '../lib/dayMood'
import type { CandidateView } from '../lib/plannerCandidates'
import type { CompletedFilter, TodoFilter } from '../lib/taskFilter'
import type { SyncState } from '../types/sync'
import type { WeekStartDay } from '../lib/weekStart'
import type { QuickAddPrefill } from '../lib/shareTarget'

/**
 * トーストに出す文。ストアの中では文言を作らず、訳す鍵と値（`{ key, params }`）を渡す（言語は画面で決める）。
 * 画面で訳した文字列をそのまま渡すこともできる
 */

export type ToastText = string | { key: string; params?: Record<string, string | number> }

/** `threeDay` はスマホ幅だけ（PC 幅では週として出す）。`schedule` は予定の一覧 */
export type CalendarMode = 'month' | 'week' | 'threeDay' | 'schedule'

export type SmartView =
  | 'planner'
  | 'all'
  | 'today'
  | 'upcoming'
  | 'overdue'
  | 'calendar'
  | 'stats'
  | 'habits'
  | 'completed'
  | 'archived'
  | 'deleted'
  | 'settings'
  | 'addons'

/** 設定画面を開いたときの一度きりのスクロール先（永続化しない） */
export type SettingsScrollTarget = 'appearance' | 'account' | 'install' | 'google' | 'notion' | 'canvas'

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
  /**
   * 「あと何分」の終わりの時刻（ISO、#290）。無い・null は終わりなし（数え上げ）。時間になっても記録は止めない。
   * 端末間で同じになる（`user_active_timer.ends_at`）
   */
  endsAt?: string | null
}

/** 毎日 1 回の通知の時刻（`HH:mm`）。null はオフ */
export interface DailyReminders {
  /** 朝のまとめ */
  planTime: string | null
  /** 夜の締め（その日の数字つきで「1 日を締める」へ誘う、#299）。無い（前の版の保存）は null と同じ */
  wrapUpTime?: string | null
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
  /** 並び順。リスト・ビュー・色ラベルごと（鍵は `sortKeyOf`）。無い鍵は手動（近日中・締切切れは締切順、`sortModeOf`） */
  sortByKey: Record<string, SortMode>
  sectionGrouping: SectionGrouping
  /** 今日の計画の「今日やる候補」の並び順・絞り込み */
  plannerCandidateView: CandidateView
  /** To-Do 一覧の絞り込み（優先度・見積もり。リスト・ビューをまたいで同じ） */
  todoFilter: TodoFilter
  /** 完了済みの絞り込み（リスト・ラベル・期間） */
  completedFilter: CompletedFilter
  /**
   * 直近の削除（トーストの「元に戻す」用）。消したタスクの id だけを持ち、中身はいつも `tasks` の `deletedAt` から読む
   * （タスクの写しを持つと、再読み込み・他のタブの取り込みのあとに中身とずれる）。保存しない
   */
  recentDeletes: { ids: string[]; at: number; undoId?: number; label?: ToastText }[]
  quickAddRequested: boolean
  /** 共有（share_target）から開いたとき、追加欄に入れておく中身。追加欄が読んだら消す */
  quickAddPrefill: QuickAddPrefill | null
  filterTag: string | null
  /** To‑Do を色（ラベル）で絞っているときの `#RRGGBB`（大文字）。「すべて」と組み合わせて「ラベルを開いた」状態になる */
  filterColor: string | null
  /** 締切の前の通知（前日 20:00 ＋ 時刻つきは 3 時間前） */
  notificationsEnabled: boolean
  /** 予定が終わったら「予定どおり / 記録する」を聞く */
  recordPrompts: boolean
  /** 通知の「記録する」から開く、記録を入れる予定（永続化しない） */
  recordPromptTaskId: string | null
  /** 活動ログのタグ候補（設定で編集、順序はタイムライン色の優先度に使う） */
  timeLogTagPresets: string[]
  /** 分類名 → 色キー（`logCategoryColors.ts`）。並べ替えても色が変わらないように保存する */
  logCategoryColors: Record<string, string>
  /** 分類名 → 週の目安（分、#291）。目安の無い分類は入れない（`labelTargets.ts`） */
  logLabelTargets: Record<string, number>
  /**
   * 分類名 → ラベルの id（#365、`labelIds.ts`）。無い名前の id は名前から決まる（`legacyLabelId`）。
   * 名前を変えたラベルは元の id をここに持ち、記録・To-Do は id で指したまま（行を書き直さない）
   */
  logLabelIds: Record<string, string>
  /** この端末でラベル表（timeLogTagPresets・logCategoryColors・logLabelTargets・logLabelIds）を最後に変えた・同期で合わせた時刻。まだ無ければ null */
  logLabelsUpdatedAt: string | null
  /** 取り込み（Notion・フォルダを畳む）で足し、まだサーバーに届いていないラベルの名前。手元の変えた時刻は進めず「無ければ足す」で送る（`labelSync.ts`、#357） */
  logLabelPendingAdds: string[]

  calendarEvents: CalendarEvent[]
  /** Google の予定にアプリで付けた色（`googleEventColors.ts`）。API に出ない新しい色（アボカドなど）の代わり */
  googleEventColors: EventColorChoices
  googleConnected: boolean
  googleAccessToken: string | null
  googleConnectionError: string | null
  /** つながっていたのに切れた（Google が断った）。つなぎ直すか、自分で外すまで「もう一度つなぐ」を出す */
  googleReconnectNeeded: boolean
  /** Google の予定を書き換えられる権限（calendar.events.owned など）があるか。古い接続は読み取りのみ */
  googleCanWrite: boolean
  /** 何度送っても Google に送れなかったアプリの予定の数（`lib/googlePushQueue.ts`） */
  googlePushFailed: number

  activeTimer: ActiveTimer | null
  /** 手元でタイマーを始めた・止めた時刻（端末間でどちらに合わせるかを比べる、`timerSync.ts`）。同期で届いた変更では付けない */
  activeTimerUpdatedAt: string | null
  /** 睡眠のタイマー（#519、`lib/sleepTimer.ts`）。「寝る」を押してから「起きた」までの間だけある */
  sleepTimer: SleepTimer | null
  /** 手元で寝た・起きたと押した時刻（端末間でどちらに合わせるかを比べる）。同期で届いた変更では付けない */
  sleepTimerUpdatedAt: string | null
  /** タイマー停止後に「完了にしますか？」を出すタスク（永続化しない） */
  completePromptTaskId: string | null
  /** タイマー停止後に「ラベルは？」を出す記録（ラベルなしで止めたとき。永続化しない） */
  labelPromptLogId: string | null
  dailyReminders: DailyReminders
  /** 「今日の計画」で通知の案内を閉じたか */
  reminderPromptDismissed: boolean
  /** カレンダーの「Google カレンダーも並べられます · 接続する」の 1 行を閉じたか（接続は設定から） */
  googleConnectLineDismissed: boolean
  /**
   * 今日の画面の「はじめの 3 ステップ」を終えた・閉じたか（端末に保存）。
   * 前の版から使っている人・バックアップを取り込んだ人・初めての同期でアカウントのデータが届いた人は true
   */
  onboardingDone: boolean
  /**
   * はじめの 3 ステップをやり終えた（× で閉じたのではない）。終えた直後の 1 回だけの誘い
   * （iPhone の Safari ならホーム画面への追加）を出してよい（端末に保存）
   */
  onboardingCompleted: boolean
  /**
   * はじめの案内を終えた日（3 つ済んだ・× で閉じた、`yyyy-MM-dd`）。その日の間は睡眠の行と案内のあとの誘いを出さない
   * （最初の成功の場面に新しいものを重ねない）。前の版から引き継いだ人は null（すぐ出す）。端末に保存
   */
  onboardingFinishedOn: string | null
  /** iPhone の Safari でのホーム画面への追加の誘いを閉じたか（端末に保存） */
  installNudgeDismissed: boolean
  /** ログインしていない人へのログインの誘い（2 台目・ホーム画面のアプリでは空になる）を閉じたか（端末に保存） */
  signInNudgeDismissed: boolean
  /** 1 日に計画してよい時間（分）。超えたら穏やかに知らせる */
  dailyCapacityMinutes: number
  /** 長さを決めずに置いた予定の長さ（分）。空き時間のクリック・ドラッグで置く・時刻だけの入力など */
  defaultBlockMinutes: number
  /** 予定の開始何分前に通知するか（null はオフ） */
  eventReminderMinutes: number | null
  /** アプリのタイムゾーン（IANA 名）。null は端末に合わせる */
  appTimeZone: string | null
  /** 週の開始日（0 = 日曜、1 = 月曜、6 = 土曜）。カレンダーの週・月表示と日付ピッカーが従う（lib/weekStart.ts） */
  weekStartsOn: WeekStartDay
  /** タイムラインの時間バーに並べて出す別のタイムゾーン（Google カレンダーの「他のタイムゾーンを表示」） */
  extraTimeZones: ExtraTimeZone[]
  /** 他のタイムゾーン（並び・名前）をこの端末で最後に変えた（または同期で合わせた）時刻。まだ無ければ null */
  extraTimeZonesUpdatedAt: string | null
  /** よく入れる予定（バイトのシフトなど、#311）。月表示で選んでから日を押すと、その日に同じ予定が入る */
  eventTemplates: EventTemplate[]
  /** よく入れる予定をこの端末で最後に変えた（または同期で合わせた）時刻。まだ無ければ null */
  eventTemplatesUpdatedAt: string | null
  /** 授業の予定の名前と LMS の科目のつながり（#309）。予定のカードに、その科目の課題を出す */
  courseLinks: CourseLink[]
  /** つながりをこの端末で最後に変えた（または同期で合わせた）時刻。まだ無ければ null */
  courseLinksUpdatedAt: string | null
  /** やらなかった予定（#528、開始を過ぎてから消した Google の予定）。その日の予定の列に薄く・取り消し線で出す（`lib/skippedEvents.ts`） */
  skippedEvents: SkippedEvent[]
  /** やらなかった予定をこの端末で最後に変えた（または同期で合わせた）時刻。まだ無ければ null */
  skippedEventsUpdatedAt: string | null
  /** 1 日の気分とひとこと（#324、日付 → 気分）。日ごとに変えた時刻ともとにしたサーバーの版を持ち、日ごとに同期する（`lib/dayMood.ts`） */
  dayMoods: DayMoods
  /** 授業の時間割の設定（#279、時限・学期・祝日を除くか）。マスの中身は予定の行（毎週の印）から出す（`lib/timetable.ts`） */
  timetable: Timetable
  /** 時間割の設定をこの端末で最後に変えた（または同期で合わせた）時刻。まだ無ければ null（一度も変えていない既定の値） */
  timetableUpdatedAt: string | null
  /** 追加機能のオン・オフ（#453、`lib/addons.ts`）。決めていない機能は既定 */
  addons: Addons
  /** 追加機能の設定をこの端末で最後に変えた（または同期で合わせた）時刻。まだ無ければ null */
  addonsUpdatedAt: string | null
  /**
   * 毎週の予定のカード・詳細で選んでいる直す範囲（その予定の id と範囲）。null・ほかの予定は「この予定のみ」。
   * `updateTask` はこの範囲のほかの回にも同じ項目を写す（`SERIES_SHARED_FIELDS`）。カード・詳細を閉じたら null
   */
  seriesEditScope: { taskId: string; scope: SeriesScope } | null

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
  moveSubtaskInList: (taskId: string, newParentId: string, insertBeforeChildId: string | null) => void
  /** ルートタスクを別タスクの子へ（TickTick のネスト DnD）。`insertBeforeChildId` なしは末尾 */
  nestRootUnderParent: (taskId: string, parentId: string, insertBeforeChildId: string | null) => void
  /** ルート直下のサブタスクをルートへ昇格（左ドラッグで 1 段上へ）。旧親の直後に同セクションで挿入 */
  promoteSubtaskToRoot: (taskId: string) => void
  /** 右ドラッグで 1 段下げる: 直前の表示兄弟の子にする。兄弟が無ければ何もしない（戻り値 false） */
  indentTaskUnderPrevSibling: (taskId: string) => boolean

  setTheme: (theme: 'light' | 'dark' | 'system') => void
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
  /**
   * ラベル表をまとめて保存する。`weeklyTargetMinutes` は週の目安（分）: 数なら付ける、null なら外す、
   * 項目が無ければ元のラベル（`from`）の目安のまま（色ラベルのカードなど目安を扱わない画面）
   */
  saveLogLabels: (
    rows: ReadonlyArray<{ from: string | null; name: string; color: string; fromHex?: string; weeklyTargetMinutes?: number | null }>,
  ) => void

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
  /** 今日やる候補の並び順・絞り込みを変える（渡した項目だけ） */
  setPlannerCandidateView: (patch: Partial<CandidateView>) => void
  /** To-Do 一覧の絞り込みを変える（渡した項目だけ） */
  setTodoFilter: (patch: Partial<TodoFilter>) => void
  /** 完了済みの絞り込みを変える（渡した項目だけ） */
  setCompletedFilter: (patch: Partial<CompletedFilter>) => void
  /** 追加欄を開いてフォーカスする。`prefill` があれば欄に入れておく（足すのは利用者が確かめてから） */
  requestQuickAdd: (prefill?: QuickAddPrefill | null) => void
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
  setGoogleReconnectNeeded: (needed: boolean) => void
  setGoogleCanWrite: (canWrite: boolean) => void
  setGooglePushFailed: (count: number) => void

  /** 足した習慣の id を返す */
  addHabit: (
    fields: Pick<Habit, 'title' | 'color' | 'timeMode' | 'startTime' | 'endTime' | 'frequency' | 'weekdayTimes' | 'goalMinutes'>,
  ) => string
  /** `weekdayTimes: undefined` は曜日ごとの時間、`goalMinutes: undefined` は時間の目標を外す */
  updateHabit: (
    id: string,
    patch: Partial<Pick<Habit, 'title' | 'color' | 'timeMode' | 'startTime' | 'endTime' | 'frequency' | 'weekdayTimes' | 'goalMinutes'>>,
  ) => void
  /**
   * その日だけ習慣の時間を変える（タイムラインで枠を動かした・習慣の段のチップを格子に置いた）。習慣の時間と同じにしたらその日の分は消す
   */
  setHabitDayTime: (id: string, dateKey: string, startTime: string, endTime: string, label?: ToastText) => void
  /** その日だけの時間を消して、いつもの時間に戻す（格子に置いた時刻ひとつの習慣を習慣の段のチップに戻す） */
  clearHabitDayTime: (id: string, dateKey: string, label?: ToastText) => void
  /**
   * `from`〜`to`（yyyy-MM-dd、両端を含む）を休みにする（`rest: false` で外す）。休みの日は予定の日に数えない。
   * 「元に戻す」付きのトースト
   */
  setHabitRest: (id: string, from: string, to: string, rest: boolean) => void
  /** ゴミ箱へ（達成日は残す）。「元に戻す」付きのトースト */
  deleteHabit: (id: string) => void
  /** ゴミ箱から戻す（達成日ごと）。2 件以上なら件数のトースト */
  restoreDeletedHabits: (ids: string[]) => void
  /** ゴミ箱から完全に削除 */
  permanentlyDeleteHabits: (ids: string[]) => void
  /** 今日の計画・一覧・タイムライン・統計から外す（達成日は残す）。「元に戻す」付きのトースト */
  archiveHabit: (id: string) => void
  /** アーカイブから戻す */
  restoreHabit: (id: string) => void
  /** 達成 ⇄ 未達成。時間を決めた習慣は、達成で予定どおりの時刻の記録を作り、外すとその記録をゴミ箱へ */
  toggleHabitDate: (habitId: string, dateKey: string) => void
  /** 未達成なら達成にして、記録が無ければ予定どおりの時刻で作る（タイムラインの習慣の枠のチェック） */
  completeHabitAsPlanned: (habitId: string, dateKey: string) => void
  /** その時間にやった記録を作る（記録の列に習慣を落とした）。時間なしの習慣はその日を達成に、時間を決めた習慣は記録の時刻で判定。「元に戻す」付きのトースト */
  recordHabitAt: (habitId: string, dateKey: string, startTime: string, endTime: string) => void

  addList: (name: string, kind?: Exclude<ListKind, 'tasks'>) => void
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
    /** 元の To-Do（記録の候補から To-Do を選んだとき）。統計の「見積もりと記録」に入る */
    sourceTaskId?: string | null,
    /** 後から記録（記録パネル・タイムラインの記録の列）: 題名かラベルが「睡眠」「sleep」などなら睡眠にする（`looksLikeSleep`） */
    sleepByName?: boolean,
  ) => string
  /** 朝に入れる睡眠（寝た時刻・起きた時刻）。その朝の睡眠が既にあれば書き換える */
  logSleep: (wakeDateKey: string, bedTime: string, wakeTime: string) => void
  /** 「寝る」: 睡眠のタイマーを始める。記録のタイマーが動いていれば、先に記録にして止める */
  goToBed: () => void
  /**
   * 「起きた」: 寝た時刻から今までを睡眠にして、睡眠のタイマーを止める。1 分未満は記録せずに止める（`short`）。
   * 長すぎる（`SLEEP_TIMER_MAX_MS`）ときは何もしない（`long`。起きた時刻を聞いてから `logSleep` と `cancelSleep`）
   */
  wakeUp: () => 'saved' | 'short' | 'long' | null
  /** 睡眠のタイマーを、記録にせずに止める。`notify` なら「元に戻す」付きで知らせる */
  cancelSleep: (notify?: boolean) => void
  /** 止めたばかりの睡眠のタイマーを戻す（トーストの「元に戻す」）。ほかで寝ると押していれば戻さない */
  restoreCancelledSleep: () => boolean
  /** 記録を開始。既に走っていれば先にそれを記録として閉じる（黙って捨てない） */
  startTimer: (title: string, tags?: string[], taskId?: string | null, color?: string | null, options?: { minutes?: number | null }) => void
  /** 動いているタイマーの「あと何分」の終わり（ISO）を付ける・選び直す。null で外す（数え上げに戻す）。#290 */
  setTimerEnd: (endsAt: string | null) => void
  /** 動いているタイマーの題名・ラベルを直す（止めた記録にそのまま入る）。空の題名は無視。ラベルを選び直したら元の To-Do の色は外す */
  editActiveTimer: (patch: { taskTitle?: string; tags?: string[] }) => void
  stopTimer: () => void
  /** 止め忘れたタイマーを、指定した終了時刻までの記録にして閉じる */
  resolveStaleTimer: (endedAt: string) => void
  /** 止め忘れたタイマーを記録にせず捨てる */
  /** 動いている記録を記録せずに止める。1 つだけ取っておき、「元に戻す」のトーストから戻せる */
  discardActiveTimer: () => void
  /** 破棄した記録を戻す（ほかの記録が動いていれば戻さない）。戻したら true */
  restoreDiscardedTimer: () => boolean
  /** 記録を作ったあと、元の To-Do を完了にするか聞く（タイマーを止めたときと同じ確認） */
  askComplete: (taskId: string) => void
  dismissCompletePrompt: () => void
  dismissLabelPrompt: () => void
  setDailyReminders: (patch: Partial<DailyReminders>) => void
  dismissReminderPrompt: () => void
  dismissGoogleConnectLine: () => void
  finishOnboarding: () => void
  /** 3 ステップをやり終えて案内を閉じる（終えたあとの誘いを出せるようにする） */
  completeOnboarding: () => void
  dismissInstallNudge: () => void
  dismissSignInNudge: () => void
  setDailyCapacityMinutes: (minutes: number) => void
  setDefaultBlockMinutes: (minutes: number) => void
  setEventReminderMinutes: (minutes: number | null) => void
  setAppTimeZone: (tz: string | null) => void
  setWeekStartsOn: (day: WeekStartDay) => void
  setExtraTimeZones: (zones: ExtraTimeZone[]) => void
  /** 他のタイムゾーンに名前を付ける（空にすると外す） */
  setExtraTimeZoneLabel: (tz: string, label: string) => void
  /** よく入れる予定をまとめて置き換える（登録の画面の「保存」）。名前が空・時刻が使えない行は外す */
  saveEventTemplates: (templates: EventTemplate[]) => void
  /** その日の気分・ひとことを変える（`mood: null` で記号を外す、`note: ''` で一言を消す） */
  setDayMood: (dateKey: string, patch: { mood?: Mood | null; note?: string }) => void
  /**
   * よく入れる予定をその日に入れる・外す（月表示で日を押したとき）。同じ予定（名前・時刻）が入っていれば外し、無ければ入れる。
   * 外すとき、`sessionTaskIds` にある予定（この続けて押している間に入れたもの）はそのまま消し、それ以外はゴミ箱へ
   */
  toggleEventTemplateDay: (
    templateId: string,
    dateKey: string,
    sessionTaskIds?: ReadonlySet<string>,
  ) => { kind: 'added' | 'removed'; taskId: string } | null
  /** 予定の名前と科目をつなぐ（同じ名前の予定はみな同じ科目）。`course` が '' なら「つながない」 */
  setCourseLink: (eventTitle: string, course: string) => void
  /** やらなかった予定を足す（もう持っている予定はそのまま） */
  addSkippedEvents: (events: SkippedEvent[]) => void
  /** 予定に戻った（Google にまたある・消すのを取り消した）予定を、やらなかった予定から外す */
  dropRestoredSkipped: (liveIds: ReadonlySet<string>) => void
  /** 「消す」: やらなかった予定からも消す */
  removeSkippedEvent: (id: string) => void
  /**
   * 予定に毎週の繰り返しを付ける・変える・やめる（`rule` が null）。その回から後に当てはまる（`changeSeriesRule`）。
   * 変わったら true
   */
  setEventRepeat: (taskId: string, rule: SeriesRule | null) => boolean
  /** カード・詳細で直す範囲を選ぶ（null は選んでいない＝この予定のみ） */
  setSeriesEditScope: (taskId: string, scope: SeriesScope | null) => void
  /** 毎週の予定をゴミ箱へ（この予定のみ / 以降すべて / すべて）。消した数を返す */
  deleteEventSeries: (taskId: string, scope: SeriesScope) => number
  /** 追加機能をオン・オフする */
  setAddonOn: (id: AddonId, on: boolean) => void
  /** 引き落とし・期限の日を足す・直す（同じ id があれば置き換える、#454） */
  saveDue: (item: DueItem) => void
  /** 引き落とし・期限の日を消す */
  deleteDue: (id: string) => void
  /**
   * 授業の欠席の一覧（#503）に授業を足す（`from` が null）・直す。休める回数（null は決めない）も一緒に決める。
   * 名前を直したら休んだ日・休める回数も新しい名前に移す
   */
  saveAbsenceCourse: (from: string | null, title: string, limit: number | null) => void
  /** 授業を欠席の一覧から外す（休んだ日・休める回数も消す。⌘Z で戻せる） */
  removeAbsenceCourse: (title: string) => void
  /** 授業名・日付で欠席にする・取り消す（Google カレンダーの予定・一覧から。`lib/timetable.ts` の `withAbsence`） */
  setCourseAbsent: (title: string, date: string, absent: boolean) => void
  /** この名前の予定を Google カレンダーに送らない・送る（#461） */
  setGoogleSkip: (title: string, skip: boolean) => void
  /** 時間割の設定を保存する（同じ中身なら何もしない） */
  saveTimetable: (timetable: Timetable) => void
  /**
   * 時間割のマスに授業を入れる。学期の間（今日より前は作らない）の、その曜日の毎週の予定を作る。作った回の数を返す
   */
  addTimetableClass: (cls: { weekday: number; startTime: string; endTime: string; title: string; color: string | null }) => number
  /** 時間割の授業（その回から後）の名前・ラベルを直す */
  updateTimetableClass: (firstTaskId: string, patch: { title?: string; color?: string | null }) => void
  /** 授業の回（その予定の名前・日付）を欠席にする・取り消す（#452、`lib/timetable.ts` の `withAbsence`） */
  setClassAbsent: (taskId: string, absent: boolean) => void
  /** 授業の休める回数を決める（null は学期の回数の 1/3） */
  setClassAbsenceLimit: (title: string, limit: number | null) => void
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
        | 'estimateMinutes'
        | 'timeZone'
        | 'reminders'
        | 'color'
        | 'priority'
        | 'tags'
        | 'listId'
        | 'parentId'
        | 'recurrence'
        | 'kind'
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
    patch: Partial<Pick<Task, 'listId' | 'priority' | 'dueDate' | 'dueTime' | 'sectionId' | 'color'>>,
    label?: ToastText,
  ) => void
  /** 未完了のものだけまとめて完了にする（2 件以上なら件数のトースト）。Undo は 1 段 */
  completeTasks: (ids: string[]) => void
  /**
   * 複製する（同じ日・同じ時間、元のすぐ後ろ。子も写す。完了・持ち越しは引き継がない、`duplicateTaskTrees`）。
   * 記録・睡眠は写さない。`place` を渡すと複製をその日時に置く（元は動かさない）。複製の id を選んだ順に返す。Undo は 1 段
   */
  duplicateTasks: (ids: string[], place?: (src: Task) => Partial<Task>) => string[]
  /** ソフト削除（ゴミ箱へ）。対象と全子孫に deletedAt を付与。トースト/Undo 用に recentDeletes にも積む */
  deleteTask: (id: string) => void
  /** `label` はトーストの文（無ければ消したものの名前・件数） */
  deleteTasks: (ids: string[], label?: ToastText) => void
  /** チェックリストの「全部戻す」: 完了をまとめて外す（繰り返しの次回は作らない）。Undo は 1 段 */
  uncheckTasks: (ids: string[]) => void
  /** いつか → 「やること」（未分類）へ移して予定日を付ける。子を移したときは親から外して 1 件にする。Undo は 1 段 */
  promoteToPlanned: (id: string, dateKey: string) => void
  /** いつかの段を変える（#221）。`dream` は夢、`wish` はやりたい。ルートの行だけ（一歩＝子は段を持たない） */
  setSomedayTier: (ids: string[], tier: 'dream' | 'wish') => void
  /** ゴミ箱から復元（対象と全子孫の deletedAt をクリア） */
  restoreDeletedTask: (id: string) => void
  /** ゴミ箱からまとめて復元（2 件以上なら件数のトースト）。Undo は 1 段 */
  restoreDeletedTasks: (ids: string[]) => void
  /** ゴミ箱から完全に削除（対象と全子孫をストアから除去） */
  permanentlyDeleteTask: (id: string) => void
  /** ゴミ箱からまとめて完全に削除（対象と全子孫）。Undo は 1 段 */
  permanentlyDeleteTasks: (ids: string[]) => void
  /** ゴミ箱を空にする（deletedAt を持つ全タスク・習慣を完全削除） */
  emptyDeleted: () => void
  /** ゴミ箱に入れてから `TRASH_KEEP_DAYS` 日たったタスク・習慣を完全に削除する（起動時。同期でサーバーからも消える）。消した件数 */
  purgeExpiredDeleted: (now?: number) => number
  /** 名前を入れずに離れた新規タスクを、無かったことにする（ゴミ箱に入れず、取り消し履歴も残さない） */
  discardBlankTask: (id: string) => void
  /** アーカイブする（対象と全子孫に archivedAt を付与） */
  archiveTask: (id: string) => void
  /** 複数タスクをアーカイブ */
  archiveTasks: (ids: string[]) => void
  /** アーカイブから戻す（対象と全子孫の archivedAt をクリア） */
  unarchiveTask: (id: string) => void
  /** アーカイブからまとめて戻す（2 件以上なら件数のトースト）。Undo は 1 段 */
  unarchiveTasks: (ids: string[]) => void
  undoDelete: () => void
  /** 直前のデータ変更を 1 段階戻す（⌘Z）。成功時 true */
  /** 中の操作をまとめて 1 回の取り消しで戻せるようにする */
  asOneUndo: (fn: () => void) => void
  /**
   * 続けて行う操作（月表示で日を続けて押す）を 1 回の取り消しで戻せるようにする。直前の取り消しが同じ `key` の回なら、
   * 中の操作をそこへ足す（間にほかの操作をしたら新しい回）
   */
  asUndoSession: (key: string, fn: () => void) => void
  undoLastOperation: () => boolean
  /**
   * トーストが指す操作（`pushUndo` が返した番号）だけを戻す。あとに別の操作があっても、それは残す。
   * もう戻した操作なら false
   */
  undoOperation: (id: number) => boolean
  /** 一番上の取り消し項目の番号（トーストを自分で出す操作が、どれを戻すかを持たせる） */
  lastUndoId: () => number | null
  /** ⌘Z で戻した変更をやり直す（⌘⇧Z）。成功時 true */
  redoLastOperation: () => boolean
  clearDeletedTasks: () => void
  reorderTask: (id: string, newOrder: number) => void
  reorderTasks: (orderedIds: string[]) => void
  /** ルートタスクを別リストへ。子タスクは listId のみ追随。末尾 order。同一リストは no-op */
  moveTaskToList: (taskId: string, listId: string) => { moved: boolean; listName?: string; listId?: string }
  /** 複数ルートを同一リストへ（相対順維持・末尾に連続 order）。各ルートの子は追随 */
  moveTasksToList: (rootTaskIds: string[], listId: string) => { moved: boolean; listName?: string; listId?: string; count?: number }

  moveBannerText: ToastText | null
  showMoveBanner: (text: ToastText) => void
  clearMoveBanner: () => void

  /**
   * 「元に戻す」を出す操作の説明（永続化しない）。削除以外の取り消せる操作
   * （一括アーカイブ・セクション削除・リスト移動など）でどれが戻せるのかを示す。
   * `at` は同じ文言が続いたときにトーストを出し直すための時刻。
   */
  undoBanner: { text: ToastText; at: number; undoId?: number; restoreTimer?: boolean; restoreSleepTimer?: boolean } | null
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
  /**
   * 開いてから初めてクラウドの内容を取り込み終えた時刻（永続化しない）。Notion・Canvas の取り込みはこれを待つ
   * （クラウドの To-Do が届く前に取り込むと二重に作る）。送信・設定の同期までは待たない
   */
  cloudPulledAt: string | null
  setCloudPulledAt: (at: string) => void
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
  /**
   * CSV からタスクを追加（既存データは保持）。TickTick のバックアップ・Todoist のプロジェクトの CSV もそのまま読む。
   * 一致するリスト・ラベルの無いリスト名は、`unknownLists: 'label'` ならその名前のラベルを作って付け、`'inbox'`（既定）ならラベルなし
   */
  importTasksFromCsv: (
    csv: string,
    options?: { fileName?: string; unknownLists?: 'label' | 'inbox' },
  ) => { imported: number; skipped: number; errors: string[] }
}
