# Chronograma — Cursor 用プロジェクトコンテキスト

アプリ名は **Chronograma**。ローカルの作業ディレクトリ名は `jikanwari`
のままの場合がある。

## 既存ドキュメント

- ルートの `README.md`: 概要・Supabase 手順（日本語）と Vite
  テンプレ付属の英語ボイラープレート
- 本ファイル: エージェント・ルール用の**実装寄りの全体像**

**メンテナンス**: Cursor
で本リポジトリを開いたエージェントは、`.cursor/rules/sync-cursor-context.mdc`（常時適用）に従い、アプリやマイグレーション等を変えたときは可能な限り同じ作業で本ファイルを最新に保つ。

## プロダクト概要

- タスク、カレンダー表示、タイムログ、習慣トラッキング向けの **React SPA**
- **既定の永続化**: ブラウザ **localStorage**（Zustand `persist`、キー
  `chronograma-storage`、スキーマ **version 14**）。旧キー `tickdo-storage`
  は初回のみ `migrateLegacyPersistKey` で移行
- **オプション**: **Supabase** でメール **マジックリンク** ログインと、**リスト
  / タスク / 習慣** のクラウド同期。未設定時は認証が noop 相当でローカルのみ

## 技術スタック

| 領域       | 内容                                                   |
| ---------- | ------------------------------------------------------ |
| ランタイム | React 19, TypeScript                                   |
| ビルド     | Vite 8                                                 |
| スタイル   | Tailwind CSS 4（`@tailwindcss/vite`）, `src/index.css` |
| 状態       | Zustand 5 + `persist`                                  |
| DnD        | `@dnd-kit/core`, `sortable`, `utilities`               |
| 日付       | `date-fns`                                             |
| BaaS       | `@supabase/supabase-js`                                |

## エントリ

- `src/main.tsx`: `AuthProvider` で `App` をラップ
- `src/App.tsx`:
  レイアウト、`useSupabaseSync()`、ビュー切替（`calendar` は
  `CalendarHubView`）、グローバルキーバインド、DnD ルート。**ToDo 面**（リスト選択
  `selectedView === null` または `all` / `today` / `upcoming` / `overdue`）かつ検索が空のときだけ
  グローバルヘッダーは ToDo 面かつ検索が空のとき**検索欄のみ**（`AccountMenu` /
  `ThemeToggle` は `SettingsView` へ）。それ以外の画面ではヘッダー非表示（カレンダーは
  ハブ内のメニュー、他スマートビューは `md` 未満のみ細いメニュー行）

### グローバルショートカット（`App.tsx`）

- **⌘/Ctrl+K**: 検索フォーカス
- **⌘/Ctrl+N**: Quick Add（`[data-quickadd]` または `requestQuickAdd()`）
- **⌘/Ctrl+Z**（Shift なし）: 直近削除バッチの `undoDelete()`

### DnD（`DndContext`）

- 未完了ルートタスクの手動並べ替え（`TASK_PREFIX` +
  `buildReorderedActiveRootIds` → `reorderManualRootTasks`）。複数選択中は
  `manualRootDnDBlockIds` でブロックごと移動（セクション／別リスト含む）
- タスクをリストへドロップ（`drop::{listId}` + `moveTaskToList`）
- リスト並べ替え（`LIST_PREFIX` + `reorderLists`）

## 状態管理（`src/store/taskStore.ts`）

### 主要 state（抜粋）

- `tasks`, `lists` — 既定リスト「未分類」ID: `__inbox__`（`INBOX_LIST_ID`）
- `selectedListId`, `selectedView` — スマートビューとリスト選択は排他
- `settingsScrollTarget`（`'appearance'` | `'account'` | `null`）—
  `openSettingsWithScroll` で設定を開いた直後に `SettingsView` が該当セクションへスクロールし、直後にクリア（永続化しない）
- `calendarMode`（`month` | `week`）— カレンダースマートビュー内の表示切替（永続化）
- `theme`, `searchQuery`, `sortMode`, `filterTag`
- `deletedTasks`（Undo）、`notificationsEnabled`
- `listColorPaletteId`（`src/lib/listColorPalettes.ts`）
- `calendarEvents`, `googleConnected`, `googleAccessToken`
- `activeTimer`, `habits`（`addHabit` / `updateHabit` / `deleteHabit` /
  `toggleHabitDate`）

### `SmartView`

`all` | `today` | `upcoming` | `overdue` | `calendar` | `plan-vs-actual` |
`activity-log` | `stats` | `habits` | `settings`（旧 `week-calendar` は v12
マイグレーションで `calendar` + `calendarMode: week` に統合）

検索クエリが非空のときは `SearchResults` が最優先。

### 永続化 `partialize` で除外されるもの

次は **localStorage に保存されない**（リロードで初期化）:

- `searchQuery`, `deletedTasks`, `quickAddRequested`, `filterTag`
- `calendarEvents`, `googleAccessToken`, `moveBannerText`, `taskDragHoverListId`,
  `settingsScrollTarget`

### タスク挙動メモ

- **新規タスク**（`addTask` / `addTaskWithDate` /
  `addTaskWithTime`）は同一リスト・同一親の兄弟のうち
  **手動ソート順で先頭**（既存の最小 `order` より手前の `order`
  を付与）。タイムログ系の追加は従来どおり末尾相当
- **一覧**（`TaskList`）では `parentId`
  付きサブタスクを親の直下にインデント表示（DnD
  手動ソート時は親行にぶら下げて移動）。`QuickAdd`
  はリスト用スクロール領域の**先頭**（未完了行の直下でタスク行より上）。確定は **⌘/Ctrl+Enter**（Enter のみでは追加しない）
- 一覧の**予定タスク**（`dueDate` + `startTime` + `endTime` あり）を未完了→完了にすると、即時トグルではなく「完了を記録」モーダルを開く。`予定どおり完了` / `時間をずらして実行` を選び、開始・終了時刻をピッカーで調整し、**メモ必須**で保存すると、タイムログ（`isTimeLog: true`）を作成してから元タスクを完了にする
- `PlanVsActualView` の左列（自分の予定タスク）もクリックで同じ「完了を記録」モーダルを開く。ドラッグ/リサイズ時は従来どおり時間調整を優先し、クリック時のみ完了フローへ入る
- **タイトル行**: ダブルクリックで名前をインライン編集。タイトル文字上のシングルクリックで詳細を開く挙動は短い遅延後（ダブルクリックと競合しないため）。修飾キー・一括選択中のタイトルクリックは従来どおり即時
- **一覧の複数選択**:
  ⌘/Ctrl+クリックでトグル、Shift+クリックで表示順の範囲、何か選択中は通常クリックもトグル。左端の四角チェック（ホバーまたは選択中に表示）。Escape
  / ビュー・フィルタ・ソート変更で選択解除。タスク DnD
  開始時は単体ドラッグのときのみ選択解除（複数選択のままブロック DnD
  のときは維持）。**Delete / Backspace**（選択中・入力フォーカス以外）またはツールバーから一括完了・`deleteTasks`・`bulkUpdateTasks`（リスト移動は子孫の
  `listId` も揃える、優先度・期限は選択行のみ）。一括削除は `deleteTasks` で単一
  `deletedAt`（Undo 一括）
- 繰り返し付きタスクを完了すると **次回分を新 ID** で追加
- `dueDate` を `null` にすると `startTime` / `endTime` / `recurrence` もクリア
- **タイムログ**: `isTimeLog: true` など。`startTimer` / `stopTimer`,
  `addTimeLog`, `addCompletedTaskWithTime`。ストア上は `completed: true`
  のまま。**ToDo 一覧（`TaskList`）とカレンダー横ドック（`CalendarTaskDock`）には
  タイムログ行を出さない**（完了済みにも混ぜない）。確認・追加は「ログ」「予定 vs
  ログ」や週カレンダーのログ列などで行う。`TaskItem` はタイムログ行に取り消し線を付けない（緑の
  円チェック）。`importData` は `is_time_log` を `isTimeLog` に正規化。永続化
  v13 でタスクの `is_time_log` をマージ。未完了件数・手動 DnD
  の未完了ルート（`getOrderedActiveRootTasksForDnD`）からは除外
- **import/export**: `exportData` / `importData`（JSON）。ダウンロード名
  `chronograma-backup-YYYY-MM-DD.json`

## Supabase 同期（`src/hooks/useSupabaseSync.ts`）

- ログイン済みかつ `getSupabase()` ありのときのみ
- **初回**: `fetchListsTasksHabits` →
  `decideHydrate`（`src/lib/supabaseData.ts`）
  - リモート完全空 → **ローカルを push**
  - リモートが
    trivial（未分類のみ・タスク・習慣・追加リストなし）かつローカルにデータ
    → **push_local**
  - それ以外 → **リモートで上書き**（選択リストが消えていれば未分類へ）
- **以降**: `tasks` / `lists` / `habits` 変更を **1.8 秒デバウンス**後に
  `pushListsTasksHabits`
- **push**: upsert のあと、ローカルにない ID を **tasks → habits → lists**
  の順で削除（FK 順序）

## 型（`src/types/`）

- `task.ts` — `Task`, `Priority`, `Recurrence`
- `list.ts` — `TaskList`（`order` ↔ DB `sort_order`）
- `habit.ts` — `Habit`, `HabitFrequency`（daily /
  weekly+weekdays）、`completedDates` は `yyyy-MM-dd`
- `calendarEvent.ts` — 正規化済み Google 等イベント
- `plannedItem.ts` — `PlannedItem`, `PlannedSource`（`google` | `scheduled-task`
  | `habit`）

## 主要コンポーネント

| パス                                                    | 役割                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Sidebar.tsx`                                           | ヘッダ左のアイコンでメニュー（設定・外観へ／アカウント節へ／`VITE_APP_INSTALL_URL` があれば入手リンク）。ナビに設定行は無し。折りたたみ時は「To‑Do」行＋カレンダー等の他スマートビューのみ（**リスト節は出さない**）。To‑Do パネルを開いたときだけ「すべて／今日／近日中／期限切れ」→区切り→リスト（小見出しなし）と「リストを追加」。展開時ヘッダは戻る＋「To‑Do」のみ（アカウント・Chronograma は非表示）。モバイル |
| `TaskList.tsx`, `TaskItem.tsx`, `SortableTaskItem.tsx`  | 一覧・ソート・DnD                                                                            |
| `SectionHeaderDnD.tsx`                                  | リスト内セクション見出し：並べ替えハンドルはタイトル右（編集・削除の左）。「セクションなし」と見出し左端を揃える |
| `TaskDetail.tsx`                                        | 詳細編集。`isTimeLog` は行動ログ UI（記録日・時間・所要時間・削除）に切替え、優先度・リスト等は非表示 |
| `QuickAdd.tsx`                                          | クイック追加                                                                                 |
| `CalendarHubView.tsx`                                   | カレンダー用ハブ（月/週、ToDo ドック、md 未満でサイドバーを開くボタン）                       |
| `CalendarTaskDock.tsx`                                  | カレンダー下部のリスト別 ToDo（ネイティブ DnD で月セル・週タイムラインへドロップ可）         |
| `CalendarView.tsx`, `WeekCalendarView.tsx`              | 月グリッド・週タイムライン（ハブから利用）                                                   |
| `PlanVsActualView.tsx`                                  | 予定 vs ログ（ログ列ブロックは `tagColors.ts` で先頭タグに応じた色、タグなしはエメラルド）   |
| `ActivityLogView.tsx`                                   | ログ（タイムラインのログ色は上記と同じルール）                                               |
| `StatsView.tsx`                                         | 統計（ルートの通常タスクのみ集計、タイムログは除外）                                         |
| `HabitsView.tsx`                                        | ダッシュボード型 UI（28日ヒートマップ / 週次スコア / 連続日数）＋習慣カード（週進捗リング・曜日トグル）。新規追加は `Add Habit` で展開、既存はカードから編集・削除 |
| `SettingsView.tsx`                                      | 外観（`ThemeToggle`）、アカウント（`AccountMenu`）、リスト色パレット。`#settings-appearance` / `#settings-account` でメニューからのスクロール先 |
| `SearchResults.tsx`                                     | 検索                                                                                         |
| `AccountMenu.tsx`                                       | ログイン / ログアウト（設定では `variant="settings"`）                                       |
| `ThemeToggle.tsx`                                       | ライト・ダーク切替（主に設定画面）                                                           |
| `FloatingTimer.tsx`, `UndoToast.tsx`                    | 周辺 UI                                                                                      |

補助: `src/lib/timeGrid.ts`（`timeToMinutes` / `formatDuration` 等）, `tagColors.ts`（タイムログのタグ色・`timeLogTagUniverse`）, `useTimelineDrag.ts`（ブロックの
`setPointerCapture` 後は `click` が届かないため、タップで詳細を開く処理は
`onBlockTap` で `pointerup` 時に行う）, `useTimelineDrop.ts`,
`notifications.ts`, `googleCalendar.ts`, `matchEvents.ts`,
`plannedItemUtils.ts`, `id.ts` など。

## データベース（`supabase/migrations/`）

1. `001_chronograma_lists_tasks.sql` — `lists`, `tasks`, インデックス、RLS
2. `002_habits.sql` — `habits`, RLS

習慣のクラウド同期には **002 まで実行**が必要。`README.md` は主に 001
のみ言及している点に注意。

## 環境変数（`.env.example`）

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase
- `VITE_GOOGLE_CLIENT_ID` — Google Calendar（任意）
- `VITE_APP_INSTALL_URL` — 任意。設定時のみサイドバー「アプリを入手する」が有効（`src/lib/appInstallUrl.ts`）

## npm scripts

- `dev` — Vite 開発サーバー
- `build` — `tsc -b` && `vite build`
- `lint` — ESLint
- `preview` — プレビュー

## 実装時の注意

- 同期は **全体スナップショット型**（フィールド単位マージではない）
- Google トークン・`calendarEvents` は永続化されない
- 未分類（`__inbox__`）は削除不可（リスト DnD では並べ替え無効）。サイドバーでは未分類行の左端（色→名前）を基準に他リストも揃え、並べ替えハンドルは名前の右・削除の左
- README とマイグレーション（002）の説明の齟齬に注意
