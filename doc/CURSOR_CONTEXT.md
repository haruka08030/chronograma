# Chronograma — Cursor 用プロジェクトコンテキスト

アプリ名は **Chronograma**。ローカルの作業ディレクトリ名は `jikanwari` のままの場合がある。

## 既存ドキュメント

- ルートの `README.md`: 概要・Supabase 手順（日本語）と Vite テンプレ付属の英語ボイラープレート
- 本ファイル: エージェント・ルール用の**実装寄りの全体像**

**メンテナンス**: Cursor で本リポジトリを開いたエージェントは、`.cursor/rules/sync-cursor-context.mdc`（常時適用）に従い、アプリやマイグレーション等を変えたときは可能な限り同じ作業で本ファイルを最新に保つ。

## プロダクト概要

- タスク、カレンダー表示、タイムログ、習慣トラッキング向けの **React SPA**
- **既定の永続化**: ブラウザ **localStorage**（Zustand `persist`、キー `chronograma-storage`、スキーマ **version 10**）。旧キー `tickdo-storage` は初回のみ `migrateLegacyPersistKey` で移行
- **オプション**: **Supabase** でメール **マジックリンク** ログインと、**リスト / タスク / 習慣** のクラウド同期。未設定時は認証が noop 相当でローカルのみ

## 技術スタック

| 領域 | 内容 |
|------|------|
| ランタイム | React 19, TypeScript |
| ビルド | Vite 8 |
| スタイル | Tailwind CSS 4（`@tailwindcss/vite`）, `src/index.css` |
| 状態 | Zustand 5 + `persist` |
| DnD | `@dnd-kit/core`, `sortable`, `utilities` |
| 日付 | `date-fns` |
| BaaS | `@supabase/supabase-js` |

## エントリ

- `src/main.tsx`: `AuthProvider` で `App` をラップ
- `src/App.tsx`: レイアウト、`useSupabaseSync()`、ビュー切替、グローバルキーバインド、DnD ルート

### グローバルショートカット（`App.tsx`）

- **⌘/Ctrl+K**: 検索フォーカス
- **⌘/Ctrl+N**: Quick Add（`[data-quickadd]` または `requestQuickAdd()`）
- **⌘/Ctrl+Z**（Shift なし）: 直近削除バッチの `undoDelete()`

### DnD（`DndContext`）

- 未完了ルートタスクの並べ替え（`TASK_PREFIX` + `reorderTasks`）
- タスクをリストへドロップ（`drop::{listId}` + `updateTask` の `listId`）
- リスト並べ替え（`LIST_PREFIX` + `reorderLists`）

## 状態管理（`src/store/taskStore.ts`）

### 主要 state（抜粋）

- `tasks`, `lists` — 受信トレイ ID: `__inbox__`（`INBOX_LIST_ID`）
- `selectedListId`, `selectedView` — スマートビューとリスト選択は排他
- `theme`, `searchQuery`, `sortMode`, `filterTag`
- `deletedTasks`（Undo）、`notificationsEnabled`
- `listColorPaletteId`（`src/lib/listColorPalettes.ts`）
- `calendarEvents`, `googleConnected`, `googleAccessToken`
- `activeTimer`, `habits`

### `SmartView`

`all` | `today` | `upcoming` | `calendar` | `week-calendar` | `plan-vs-actual` | `activity-log` | `stats` | `habits` | `settings`

検索クエリが非空のときは `SearchResults` が最優先。

### 永続化 `partialize` で除外されるもの

次は **localStorage に保存されない**（リロードで初期化）:

- `searchQuery`, `deletedTasks`, `quickAddRequested`, `filterTag`
- `calendarEvents`, `googleAccessToken`

### タスク挙動メモ

- **一覧**（`TaskList`）では `parentId` 付きサブタスクを親の直下にインデント表示（DnD 手動ソート時は親行にぶら下げて移動）
- **一覧の複数選択**: ⌘/Ctrl+クリックでトグル、Shift+クリックで表示順の範囲、何か選択中は通常クリックもトグル。左端の四角チェック（ホバーまたは選択中に表示）。Escape / ビュー・フィルタ・ソート変更 / タスク DnD 開始で選択解除。ツールバーから一括完了・`deleteTasks`・`bulkUpdateTasks`（リスト移動は子孫の `listId` も揃える、優先度・期限は選択行のみ）。一括削除は `deleteTasks` で単一 `deletedAt`（Undo 一括）
- 繰り返し付きタスクを完了すると **次回分を新 ID** で追加
- `dueDate` を `null` にすると `startTime` / `endTime` / `recurrence` もクリア
- **タイムログ**: `isTimeLog: true` など。`startTimer` / `stopTimer`, `addTimeLog`, `addCompletedTaskWithTime`
- **import/export**: `exportData` / `importData`（JSON）。ダウンロード名 `chronograma-backup-YYYY-MM-DD.json`

## Supabase 同期（`src/hooks/useSupabaseSync.ts`）

- ログイン済みかつ `getSupabase()` ありのときのみ
- **初回**: `fetchListsTasksHabits` → `decideHydrate`（`src/lib/supabaseData.ts`）
  - リモート完全空 → **ローカルを push**
  - リモートが trivial（受信トレイのみ・タスク・習慣・追加リストなし）かつローカルにデータ → **push_local**
  - それ以外 → **リモートで上書き**（選択リストが消えていれば受信トレイへ）
- **以降**: `tasks` / `lists` / `habits` 変更を **1.8 秒デバウンス**後に `pushListsTasksHabits`
- **push**: upsert のあと、ローカルにない ID を **tasks → habits → lists** の順で削除（FK 順序）

## 型（`src/types/`）

- `task.ts` — `Task`, `Priority`, `Recurrence`
- `list.ts` — `TaskList`（`order` ↔ DB `sort_order`）
- `habit.ts` — `Habit`, `HabitFrequency`（daily / weekly+weekdays）、`completedDates` は `yyyy-MM-dd`
- `calendarEvent.ts` — 正規化済み Google 等イベント
- `plannedItem.ts` — `PlannedItem`, `PlannedSource`（`google` | `scheduled-task` | `habit`）

## 主要コンポーネント

| パス | 役割 |
|------|------|
| `Sidebar.tsx` | リスト・スマートビュー、DnD、色、モバイル |
| `TaskList.tsx`, `TaskItem.tsx`, `SortableTaskItem.tsx` | 一覧・ソート・DnD |
| `TaskDetail.tsx` | 詳細編集 |
| `QuickAdd.tsx` | クイック追加 |
| `CalendarView.tsx`, `WeekCalendarView.tsx` | 月・週 |
| `PlanVsActualView.tsx` | 予定 vs ログ |
| `ActivityLogView.tsx` | ログ |
| `StatsView.tsx` | 統計 |
| `HabitsView.tsx` | 習慣 |
| `SettingsView.tsx` | 設定・通知・エクスポート・Google |
| `SearchResults.tsx` | 検索 |
| `AccountMenu.tsx` | アカウント |
| `FloatingTimer.tsx`, `UndoToast.tsx`, `ThemeToggle.tsx` | 周辺 UI |

補助: `src/lib/timeGrid.ts`, `useTimelineDrag.ts`, `useTimelineDrop.ts`, `notifications.ts`, `googleCalendar.ts`, `matchEvents.ts`, `plannedItemUtils.ts`, `id.ts` など。

## データベース（`supabase/migrations/`）

1. `001_chronograma_lists_tasks.sql` — `lists`, `tasks`, インデックス、RLS
2. `002_habits.sql` — `habits`, RLS

習慣のクラウド同期には **002 まで実行**が必要。`README.md` は主に 001 のみ言及している点に注意。

## 環境変数（`.env.example`）

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase
- `VITE_GOOGLE_CLIENT_ID` — Google Calendar（任意）

## npm scripts

- `dev` — Vite 開発サーバー
- `build` — `tsc -b` && `vite build`
- `lint` — ESLint
- `preview` — プレビュー

## 実装時の注意

- 同期は **全体スナップショット型**（フィールド単位マージではない）
- Google トークン・`calendarEvents` は永続化されない
- 受信トレイは削除不可（リスト DnD では受信トレイは並べ替え無効など実装依存）
- README とマイグレーション（002）の説明の齟齬に注意
