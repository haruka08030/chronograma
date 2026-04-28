# Chronograma — Cursor 用プロジェクトコンテキスト

アプリ名は **Chronograma**。ローカルの作業ディレクトリ名は `jikanwari`
のままの場合がある。

## 既存ドキュメント

- ルートの `README.md`: プロジェクト概要・Web の起動手順・Supabase 手順
  （日本語）
- 本ファイル: エージェント・ルール用の**実装寄りの全体像**

**メンテナンス**: Cursor
で本リポジトリを開いたエージェントは、`.cursor/rules/sync-cursor-context.mdc`（常時適用）に従い、アプリやマイグレーション等を変えたときは可能な限り同じ作業で本ファイルを最新に保つ。

## プロダクト概要

- タスク、カレンダー表示、タイムログ、習慣トラッキング向けの **React Web SPA**（`src/`）と、**Flutter モバイル**（`mobile/`、機能は段階実装）
- **既定の永続化**: ブラウザ **localStorage**（Zustand `persist`、キー
  `chronograma-storage`、スキーマ **version 18**）。旧キー `tickdo-storage`
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
| i18n       | `i18next` + `react-i18next`（`src/i18n/config.ts`、`react.useSuspense: false` でルートに Suspense なしでも描画可能、`ja` / `en` は `src/locales/*.ts`、言語キー `chronograma-lang`） |
| BaaS       | `@supabase/supabase-js`                                |

### モバイル（`mobile/`）

| 領域     | 内容                                                                 |
| -------- | -------------------------------------------------------------------- |
| ランタイム | Flutter（Dart 3.11+）、iOS / Android ターゲット                      |
| 状態     | `flutter_riverpod`                                                   |
| ルーティング | `go_router`（`StatefulShellRoute.indexedStack` で Bottom Tabs）        |
| 永続化   | `hive` + `hive_flutter`（タスク JSON、`hasEverPersisted` で初回シード制御） |
| タイポ   | `google_fonts`（Inter）                                              |

- **Phase 1**: To‑Do（すべて/今日/近日中/期限切れ、**画面上部固定の検索欄**（Web の To‑Do 面に近い）、完了、削除＋確認＋Undo SnackBar、クイック追加・詳細シート）、ガラス風ナビ・**円形**グラデーション FAB、同期 UI モックは **More** から（失敗時は再試行）
- **Phase 2 スタブ**: Calendar / Habits / Log / More（外観・同期 UI のみ）

エントリ: `mobile/lib/main.dart`（`Hive.initFlutter` → `ProviderScope` で `hiveBoxProvider` を override → `ChronogramaApp`）。詳細は `mobile/README.md`。

## エントリ

- `src/main.tsx`: `./i18n/config` を読み込み後、`AuthProvider` で `App` をラップ
- `src/App.tsx`:
  レイアウト、`useSupabaseSync()`、ビュー切替（`calendar` は
  `CalendarHubView`）、グローバルキーバインド、DnD ルート。**ToDo 面**（リスト選択
  `selectedView === null` または `all` / `today` / `upcoming` / `overdue`）かつ検索が空のときだけ
  グローバルヘッダーは ToDo 面かつ検索が空のとき**検索欄のみ**（`AccountMenu` /
  `ThemeToggle` は `SettingsView` へ）。それ以外の画面ではヘッダー非表示（カレンダーは
  ハブ内のメニュー、他スマートビューは `md` 未満のみ細いメニュー行）

### グローバルショートカット（`App.tsx`）

- **⌘/Ctrl+K**: 検索フォーカス
- **⌘/Ctrl+N**: Quick Add（`[data-quickadd]` または `requestQuickAdd()`）。確定は「追加」ボタン、または IME 未変換時の **Enter**（`isComposing` でないときのみ）
- **⌘/Ctrl+Z**（Shift なし）: 直前の**データ操作**を 1 段階戻す（`taskStore` のメモリ上の履歴、最大約 50 段）。入力欄・`contenteditable` フォーカス時はブラウザのテキスト取り消しを優先。履歴が空で `deletedTasks` だけ残っている場合は従来どおり `undoDelete()`

### DnD（`DndContext`）

- 未完了ルートタスクの手動並べ替え・セクション間移動（`TASK_PREFIX` +
  `buildReorderedActiveRootIdsForGroup`（`SortableTaskItem` の `data.dragGroupRootIds`）→
  `reorderManualRootTasks`）。複数ルート選択中にドラッグすると選択ブロックをまとめて移動（ネスト帯ドロップは複数時無効）。セクション見出しの並べ替えは
  `DRAGSEC_PREFIX` / `DROPSEC_PREFIX` + `reorderSections`
- サブタスク（`SUBTASK_PREFIX` + `SortableSubtaskItem`）：兄弟の並べ替え／任意の親タスクへ移動（各行右端の `RowNestDropTarget` が `nest::{parentId}`、ルート行・他サブタスク行へのドロップ）→ `moveSubtaskInList`（`src/lib/subtaskDnD.ts`）。親は多段可（最大深さは `src/lib/taskDepth.ts` の `MAX_TASK_TREE_DEPTH`）
- サブタスクを他サブタスク行へドロップしたときは、衝突列に `nest::` があればそれを最優先（明示ネスト）。それが無い場合のみ右寄せポインタ判定（約 52% 以降）で子化し、条件不成立時は兄弟並び替えへフォールバック
- **ルートをサブ化**: `nest::{parentId}` へドロップ、または別ルート行 `task::` へドロップしつつ**ポインタがその行の下＋右**（`over.rect` 基準、概ね右 42% 以降かつ下 42% 以降）→ `nestRootUnderParent`（`taskStore`）。TickTick の「下＋右」に寄せた判定。衝突では `NEST_DROP_PREFIX` を優先（`rankForTaskDrag`）
- `TaskList` の手動ソートは **単一の `SortableContext`（`flatManualSortableIds`）** で、ルートとその下の**全段**の未完了サブを表示順どおり登録（`DnDSubtreeRows`）
- タスク／サブタスクのドラッグ中は `DragOverlay` で `TaskItem` プレビューを表示し、元行は `SortableTaskItem` / `SortableSubtaskItem` 側で非表示化（`opacity: 0`）。同時に `transition` を抑えて境界付近の「押し出し」感を減らす
- タスクをリストへドロップ（`drop::{listId}` + `moveTaskToList` / 複数選択時は `moveTasksToList`）— ドラッグ元はルートの `task::` のみ
- リスト並べ替え（`LIST_PREFIX` + `reorderLists`）
- 衝突判定は `taskListCollision` でドラッグ種別ごとに優先順を切替（`pointerWithin` が空のとき `rectIntersection` で `nest::` 等）。**確定時**は `nest::` に加え、ルート同士 / サブタスク同士の `task::` / `subtask::` ドロップでポインタが `over.rect` の下＋右（概ね右 42% 以降かつ下 42% 以降）なら子化（`nestRootUnderParent` / `moveSubtaskInList`）し、それ以外は通常並び替え（`App.tsx` の `lastDragClientRef` + **`DndPointerBridge` 内の `useDndMonitor`**（`DndContext` の子である必要がある））

## 状態管理（`src/store/taskStore.ts`）

### 主要 state（抜粋）

- `tasks`, `lists` — 既定リスト「未分類」ID: `__inbox__`（`INBOX_LIST_ID`）
- `selectedListId`, `selectedView` — スマートビューとリスト選択は排他
- `settingsScrollTarget`（`'appearance'` | `'account'` | `null`）—
  `openSettingsWithScroll` で設定を開いた直後に `SettingsView` が該当セクションへスクロールし、直後にクリア（永続化しない）
- `calendarMode`（`month` | `week`）— カレンダースマートビュー内の表示切替（永続化）
- `selectedCalendarDateKey`（`yyyy-MM-dd`）— カレンダーハブの選択日と習慣一覧のフォーカス日を共有（`setSelectedCalendarDateKey`、永続化）
- `theme`, `searchQuery`, `sortMode`, `filterTag`、`todayIncludeOverdue`（「今日」に期限切れを含める・`setTodayIncludeOverdue`）
- `timeLogTagPresets`（活動ログ用タグの候補リスト・設定で編集、`setTimeLogTagPresets`）
- `deletedTasks`（削除トースト用）、`undoLastOperation()`（⌘Z 用の直前スナップショット復元・永続化しない）、`notificationsEnabled`
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

- **新規タスク**（`addTask` / `addTaskAfter` / `addTaskWithDate` /
  `addTaskWithTime`）は、`addTask*` が同一リスト・同一親の兄弟のうち
  **手動ソート順で先頭**（既存の最小 `order` より手前の `order`）へ追加。
  `addTaskAfter` は指定タスクの**直後**に同階層挿入（次兄弟がいれば中間 `order`、末尾なら `+1`）。`addTask` と `addTaskAfter`
  は新規タスクの **id を返す**。親指定時は親の `listId` に合わせる。タイムログ系の追加は従来どおり末尾相当
- **新規セクション**（`addSection`）は作成したセクションの **id を返す**。`TaskList` の「セクションを追加」直後はその見出しがインライン入力に切り替わり、自動フォーカスで即時リネームできる（Enter/Blur で確定、Esc でキャンセル）
- **一覧**（`TaskList`）では `parentId` 付きサブタスクを親の下に**再帰的**にインデント表示（`StaticSubtreeRows` / `DnDSubtreeRows` / 完了は `CompletedSubtreeRows`）。手動ソート時は単一 `SortableContext` + 各行の `RowNestDropTarget` でサブタスク DnD（`moveSubtaskInList`）。`QuickAdd`
  はリスト用スクロール領域の**先頭**。追加は「追加」ボタンまたは IME 確定後の Enter。行タイトル編集中の Enter では編集を確定し、同じ階層の**直下**へ空タイトルの次タスクを追加（サブタスクは同じ親の配下に追加）し、追加された行は自動でインライン編集に入りそのまま入力できる。右側の詳細ペインは未選択時も空状態を表示して幅を維持する（一覧幅が切り替わらない）。タイトル末尾は `parseQuickAddTitle`（`src/lib/parseQuickAdd.ts`）で `#tag`・日付語などを解釈（UI の日付チップはなし）
- **ピン**: `Task.pinned`。手動ソートのルート一覧ではピンを先に並べ替え（`mainListTasks.ts` の `pinnedCmp`）。行のピンアイコン・詳細のチェック・一括「ピン / ピン解除」
- **「今日」**: `todayIncludeOverdue` がオンのとき `getFilteredRootTasks` で期限切れルートも含める。設定は `SettingsView` の外観セクション
- 一覧の**予定タスク**（`dueDate` + `startTime` + `endTime` あり）を未完了→完了にすると、即時トグルではなく「完了を記録」モーダルを開く。`予定どおり完了` / `時間をずらして実行` を選び、開始・終了時刻をピッカーで調整し、メモ（任意）付きで保存すると、タイムログ（`isTimeLog: true`）を作成してから元タスクを完了にする
- `PlanVsActualView` の左列（自分の予定タスク）もクリックで同じ「完了を記録」モーダルを開く。ドラッグ/リサイズ時は従来どおり時間調整を優先し、クリック時のみ完了フローへ入る
- `PlanVsActualView` の左列の**習慣（range スロット）**は、行末チェックで `addCompletedTaskWithTime` でログ列へ追加。該当日が未達成なら `toggleHabitDate` で達成にする（既に達成済みでログだけ欠いている場合はログのみ）。左列の色はログとの突合のみ（`completedDates` だけでは実行済み色にしない）。タスク用の「完了を記録」モーダルは出さない
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
  のまま。**ToDo 一覧（`TaskList`）とカレンダー横ドック（`CalendarTaskDock`）、月カレンダー（`CalendarView`）には
  タイムログ行を出さない**（完了済みにも混ぜない）。確認・追加は「ログ」「予定 vs
  ログ」や週カレンダーのログ列などで行う。`TaskItem` はタイムログ行に取り消し線を付けない（緑の
  円チェック）。`importData` は `is_time_log` を `isTimeLog` に正規化。永続化
  v13 でタスクの `is_time_log` をマージ。未完了件数・手動 DnD
  の未完了ルート（`getOrderedActiveRootTasksForDnD`）からは除外
- **単体削除**（`deleteTask`）: 対象タスクと **全子孫** をまとめて削除（`expandDescendantIds`）
- **import/export**: `exportData` / `importData`（JSON、`timeLogTagPresets` を含む）。ダウンロード名
  `chronograma-backup-YYYY-MM-DD.json`。インポート時に `pinned` を正規化

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
- `tasks` upsert で `pinned` カラム未適用エラー（`Could not find the 'pinned' column`）が出た場合は、同一セッション内で `pinned` なし payload にフォールバックして再試行する（005 未適用環境の互換）。再試行成功後も同期は継続し、`pinned` 同期は 005 適用後に自動復帰

## 型（`src/types/`）

- `task.ts` — `Task`, `Priority`, `Recurrence`
- `list.ts` — `TaskList`（`order` ↔ DB `sort_order`）
- `habit.ts` — `Habit`, `HabitFrequency`, `HabitTimeMode`（`none` | `fixed` |
  `range`）。`completedDates` は `yyyy-MM-dd`
- `calendarEvent.ts` — 正規化済み Google 等イベント
- `plannedItem.ts` — `PlannedItem`, `PlannedSource`（`google` | `scheduled-task`
  | `habit`）

## 主要コンポーネント

| パス                                                    | 役割                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Sidebar.tsx`                                           | ヘッダ左のアイコンでメニュー（設定・外観へ／アカウント節へ／`VITE_APP_INSTALL_URL` があれば入手リンク）。ナビに設定行は無し。折りたたみ時は「To‑Do」行＋カレンダー等の他スマートビュー（**統計は除く**）のみ（**リスト節は出さない**）。「To‑Do」行を押すと To‑Do パネルを開き、表示は `all`（すべて）に切り替える。**統計**はスクロールナビの下・フッター区切り線の上に単独行。To‑Do パネルを開いたときだけ「すべて／今日／近日中／期限切れ」→区切り→リスト（小見出しなし）と「リストを追加」（このとき統計行は非表示）。展開時ヘッダは戻る＋「To‑Do」のみ（アカウント・Chronograma は非表示）。モバイル |
| `TaskList.tsx`, `TaskItem.tsx`, `SortableTaskItem.tsx`, `SortableSubtaskItem.tsx`, `RowNestDropTarget.tsx` | 一覧・ソート・DnD（多段サブタスク・`DnDSubtreeRows` 等）。`TaskItem` は**タイトルクリックでインライン編集**（修飾キー・一括選択時は従来どおり行操作）。行のその他の領域のクリックで `onRowClick`→詳細。タイトル下には期限テキスト（今日/日付/期限超過）を表示し、期限編集は日付アイコン/詳細側で行う。ホバーでピン・「その他」メニュー |
| `SectionHeaderDnD.tsx`                                  | リスト内セクション見出し：並べ替えハンドルはタイトル右（編集・削除の左）。「セクションなし」と見出し左端を揃える |
| `TaskDetail.tsx`                                        | 詳細編集。**既定は右ペイン分割**（`layout="split"`、親が `flex-row`＋`min-h-0`）。`layout="modal"` で全画面オーバーレイ。`isTimeLog` は行動ログ UI に切替え、優先度・リスト等は非表示 |
| `CompleteWithLogModal.tsx`                              | 予定タスクの「完了を記録」モーダル（タイムログ作成＋完了）。`TaskList` と `PlanVsActualView` で共有 |
| `TimeInput.tsx`                                         | 共通時刻入力。Google カレンダー PC 風の「入力欄 + 15分刻みドロップダウン候補」を提供。手入力補正（例 `930`→`09:30`）を維持しつつ、上下キー移動 / Enter 確定 / Esc 取消 / Tab 確定 / 外側クリック確定の挙動を統一。`TaskDetail` / `CompleteWithLogModal` / `ActivityLogView` / `HabitsView` で利用 |
| `QuickAdd.tsx`                                          | クイック追加                                                                                 |
| `CalendarHubView.tsx`                                   | カレンダー用ハブ（月/週タブ、**Google 風日付ナビ**（今日・前後・期間ラベル＋ミニ月ピッカー）、`monthCursor` / `weekAnchor` はローカル、**選択日は** `taskStore.selectedCalendarDateKey` を子へ受け渡し、ToDo ドック、`lg` 以上で右に「選択日パネル」、md 未満でサイドバーを開くボタン） |
| `CalendarDayPanel.tsx`                                  | 選択日の詳細パネル。タブで「予定 / ToDo」「ログ」を切替し、当日ログの合計時間を表示。`予定 / ToDo` タブには Google 取り込み予定（青系）も併記 |
| `CalendarTaskDock.tsx`                                  | カレンダー下部のリスト別 ToDo（ネイティブ DnD で月セル・週タイムラインへドロップ可）         |
| `CalendarView.tsx`, `WeekCalendarView.tsx`              | 月グリッド（`displayMonth` 制御）・週タイムライン（`anchor` 制御）。日付選択はハブの `applyPickedDate` 経由で選択日・表示月/週を同期。`googleConnected` 時は表示レンジの Google 予定を取得して描画 |
| `CalendarDateNav.tsx`                                   | ハブ専用：今日・期間前後・期間ラベル（クリックでミニ月）、外側クリック/Escape で閉じるポップオーバー |
| `PlanVsActualView.tsx`                                  | 予定 vs ログ（予定・ログブロックの色はマッチステータス統一: 実行済み/時間ズレ/未実行/予定外/照合前。凡例も同じ軸。習慣スロットも左列の色は突合のみ）。予定列の Google 取り込み予定・習慣 range はチェックで即タイムログ化（習慣は未達成日のみ達成トグル）。自分の予定タスクはタップで「完了を記録」モーダル。ヘッダのタイマー開始は `TimeLogTagField`（コンパクト）   |
| `ActivityLogView.tsx`                                   | ログ（タイムラインのログ色は上記と同じルール）。タグ入力は `TimeLogTagField`（プリセットチップ＋datalist） |
| `StatsView.tsx`                                         | 統計（ルートの通常タスクのみ集計、タイムログは除外）                                         |
| `HabitsView.tsx`                                        | ダッシュボード型 UI（28日ヒートマップ / 週次スコア / 連続日数）＋**フォーカス日**（`selectedCalendarDateKey`）に予定がある習慣だけのカード一覧。一覧の上にその週の曜日一行（各カードの7丸は列だけ）。日付は前日/翌日/今日で変更可能（カレンダーハブと同期）。編集中の習慣がフォーカス日に該当しない場合も編集フォームは表示。新規追加は「習慣を追加」で展開。時間指定は `none` / `fixed` / `range`。`fixed` は `PlanVsActual` に出さない（`range` のみ）。集計は `habitStats.ts`、フォームは `habitDraft.ts` |
| `SettingsView.tsx`                                      | 外観（`ThemeToggle`）、アカウント（`AccountMenu`）、**活動ログのタグ候補**（`#settings-time-log-tags`・1行1タグのテキストエリア、`parseTimeLogTagPresetLines` で blur 時に保存）、リスト色パレット。`#settings-appearance` / `#settings-account` でメニューからのスクロール先 |
| `SearchResults.tsx`                                     | 検索                                                                                         |
| `AccountMenu.tsx`                                       | ログイン / ログアウト（設定では `variant="settings"`）                                       |
| `ThemeToggle.tsx`                                       | ライト・ダーク切替（主に設定画面）                                                           |
| `FloatingTimer.tsx`, `UndoToast.tsx`                    | 周辺 UI                                                                                      |

補助: `src/lib/timeGrid.ts`（`timeToMinutes` / `formatDuration` / タスク枠の分換算 `durationMinutesForTaskSlot`・`durationMinutesForTaskId` 等）, `keyboard.ts`（`isModKey`: ⌘/Ctrl）, `subtaskDnD.ts`（`SUBTASK_PREFIX` / `NEST_DROP_PREFIX`）, `habitStats.ts` / `habitDraft.ts`, `src/locales/ja.ts`・`en`（`displayListName` 用 `lists.inbox` 等）, `tagColors.ts`（タイムログのタグ色・`timeLogTagUniverse`・**`buildTimeLogTagUniverse`（プリセット先頭）**・`parseTimeLogTagPresetLines`）, `TimeLogTagField.tsx`, `useTimelineDrag.ts`（ブロックの
`setPointerCapture` 後は `click` が届かないため、タップで詳細/完了モーダルを開く処理は
`onBlockTap` で `pointerup` 時に行う。タップ誤判定を減らすため、ドラッグ判定は `pointerdown` からの移動量（6px 超）で行う）, `useTimelineDrop.ts`,
`notifications.ts`, `googleCalendar.ts`, `matchEvents.ts`,
`plannedItemUtils.ts`, `parseQuickAdd.ts`, `taskDepth.ts`, `id.ts` など。

## データベース（`supabase/migrations/`）

1. `001_chronograma_lists_tasks.sql` — `lists`, `tasks`, インデックス、RLS
2. `002_habits.sql` — `habits`, RLS
3. `003_list_sections.sql` — `list_sections`, インデックス、RLS
4. `004_habit_time_mode.sql` — `habits.time_mode` 追加（`none` / `fixed` /
   `range`）、既存行の backfill、CHECK 制約
5. `005_tasks_pinned.sql` — `tasks.pinned`（boolean、既定 false）

習慣のクラウド同期には **004 まで実行**が必要。タスクの `pinned` を Supabase に同期するには **005 まで**推奨。ルート `README.md` の
Supabase 手順でも 001〜005 を番号順に列挙している。

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
- README と古いドキュメント間のマイグレーション説明の齟齬に注意
