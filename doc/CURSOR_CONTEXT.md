# Chronograma — Cursor 用プロジェクトコンテキスト

アプリ名は **Chronograma**。ローカルの作業ディレクトリ名は `jikanwari`
のままの場合がある。

## 既存ドキュメント

- ルートの `README.md`: プロジェクト概要・Web の起動手順・Supabase 手順
  （日本語）
- `doc/NEXT_TASKS.md`:
  **具体的な作業候補・未整合**（優先度付きの短い一覧。完了したら更新）
- 本ファイル: エージェント・ルール用の**実装寄りの全体像**

**メンテナンス**: Cursor
で本リポジトリを開いたエージェントは、`.cursor/rules/sync-cursor-context.mdc`（常時適用）に従い、アプリやマイグレーション等を変えたときは可能な限り同じ作業で本ファイルを最新に保つ。

## プロダクト概要

- タスク、カレンダー表示、タイムログ、習慣トラッキング向けの **React Web
  SPA**（`src/`）。スマホ・タブレットも同じコードを **PWA**（ホーム画面に追加）で提供する。
  旧 Flutter 版（`mobile/`）は廃止（Git 履歴にのみ残る）
- **既定の永続化**: ブラウザ **localStorage**（Zustand `persist`、キー
  `chronograma-storage`、スキーマ **version 28**）。旧キー `tickdo-storage`
  は初回のみ `migrateLegacyPersistKey` で移行
- **オプション**: **Supabase** でメール **マジックリンク** ログインと、**リスト
  / タスク / 習慣** のクラウド同期。未設定時は認証が noop 相当でローカルのみ

## 技術スタック

| 領域       | 内容                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ランタイム | React 19, TypeScript                                                                                                                                                                 |
| ビルド     | Vite 8                                                                                                                                                                               |
| スタイル   | Tailwind CSS 4（`@tailwindcss/vite`）, `src/index.css`                                                                                                                               |
| 状態       | Zustand 5 + `persist`                                                                                                                                                                |
| DnD        | `@dnd-kit/core`, `sortable`, `utilities`                                                                                                                                             |
| 日付       | `date-fns`                                                                                                                                                                           |
| i18n       | `i18next` + `react-i18next`（`src/i18n/config.ts`、`react.useSuspense: false` でルートに Suspense なしでも描画可能、`ja` / `en` は `src/locales/*.ts`、言語キー `chronograma-lang`） |
| BaaS       | `@supabase/supabase-js`                                                                                                                                                              |

### PWA

- `public/manifest.webmanifest`（アイコンは `public/icons/`、ショートカット `/?view=planner` 等）、`index.html` の
  apple-touch-icon / theme-color
- `public/sw.js`: 画面はネットワーク優先・失敗時キャッシュ、`/assets/` はキャッシュ優先。別オリジン（Supabase / Google）は触らない。
  `push` で通知表示、`notificationclick` で既存ウィンドウへ `open-view` を postMessage（無ければ新規で開く）
- `src/lib/pwa.ts`: SW 登録（**本番ビルドのみ**）、`beforeinstallprompt` の保持と `promptInstall`、iOS 判定、
  起動 URL の `?view=` を `consumeLaunchView` で読んで消す（`main.tsx`）。設定の `InstallAppSection` とサイドバーの
  「アプリとして使う」から案内
- スマホ幅: 下部ナビは 今日 / To‑Do / カレンダー / ログ / その他。「今日の計画」は md 未満で「やること / タイムライン」を切り替え

## エントリ

- `src/main.tsx`: `./i18n/config` を読み込み後、`AuthProvider` で `App` をラップ
- `src/App.tsx`: レイアウト（ルートは `h-dvh`＝iOS Safari のツールバー分の見切れ回避）、`useSupabaseSync()`、ビュー切替（`calendar` は
  `CalendarHubView`）、グローバルキーバインド、DnD ルート。**ToDo
  面**（リスト選択 `selectedView === null` または `all` / `today` / `upcoming` /
  `overdue`）かつ検索が空のときだけ グローバルヘッダーは ToDo
  面かつ検索が空のとき**検索欄のみ**（`AccountMenu` / `ThemeToggle` は
  `SettingsView` へ）。それ以外の画面ではヘッダー非表示（カレンダーは
  ハブ内のメニュー）。**lg(≥1024px) 以上**で To‑Do 系ビュー（`isTodoNavView`＝ToDo
  面＋`archived` / `deleted`）のときだけ、サイドバーの**右**に細い
  `TodoNavPanel`（`w-52`）を常設し（`useIsLargeScreen`）、その右がメイン列。
  詳細は列ではなくオーバーレイシートなので、メイン列は常に一覧のみ。
  サイドバー自体はどのビューでも全タブを表示し続ける。**md 未満**は下部に `MobileBottomNav`（To‑Do /
  カレンダー / ログ / 習慣 / その他＝サイドバー）。メイン列は
  `pb-[calc(3.5rem+safe-area)]`、`FloatingTimer` / Undo・Move トースト /
  モバイルリストドロップ帯はナビの上にオフセット。viewport は
  `viewport-fit=cover`（`index.html`）

- **今日の計画**（`selectedView === 'planner'`、`TodayPlannerView`）: 新規ユーザーの既定画面（既定 `calendarMode` は `week`）。
  左＝やり残し（予定日/期限が過去の未完了、`rescheduleTasks` で今日へ）・今日やること（`scheduledDate ?? dueDate` が当日）・
  当日の習慣・完了・「1 日を締める」（残りを明日へ）。右＝`WeekCalendarView singleDay`（1 日タイムライン）。
  追加欄は `data-quickadd` の input（⌘N でフォーカス）で `scheduledDate` を当日に設定。タイムラインは予定とログが
  同じ日にあると予定=左 / ログ=右のレーンに分割。To‑Do の「今日」は期限日または予定日が今日のタスク

- **タイムラインの重なり**: `src/lib/overlapLayout.ts`。時間が重なるブロックは塊ごとに列を割り当てる
  （Google カレンダー方式）。1 日表示・ログ画面は等幅で横並び（`columns`）、週表示・予定 vs ログの週は
  列が狭いので右へずらし重ね（`cascade`、ホバーで前面・`title` で全文）。週/日タイムラインは
  `layoutPlanAndLog` で**重なる塊の中だけ**予定=左 / ログ=右に分ける。重ねるためブロック背景は不透明色
- **1 日のリズム**: `dailyReminders`（朝の計画 / 夕方の締めの `HH:mm`、既定オフ）を `App` が 30 秒ごとに
  `checkDailyReminders`（`src/lib/dailyReminders.ts`）で判定し、1 日 1 回ブラウザ通知（タブが開いている間のみ）。
  「今日の計画」でタスクが 1 件以上あるときに一度だけオプトインを案内。`dailyCapacityMinutes`（既定 8h）を
  超えて計画すると穏やかに警告。設定は `DailyRhythmSettings`。日の集計は `getDayPlan`（`src/lib/dayPlan.ts`）
- **タスク連動タイマー**: `startTimer(title, tags, taskId)`。停止時に元タスクが未完了なら `completePromptTaskId`
  を立てて `FloatingTimer` が「完了にしますか？」を出す。1 分未満の停止はログを作らない
- **クイック追加の日時解釈**（`parseQuickAddTitle`）: 空白区切りの語から 今日/明日/明後日/曜日/来週X曜/9/30/10月3日、
  15時/15時半/午後3時/15:00/3pm、範囲 15:00-16:30・15時〜16時半、長さ 1時間/30分/1h/45m を読む。
  時刻があれば予定（`scheduledDate`+時間幅、長さ未指定は 60 分）、日付だけなら To‑Do では期限日・「今日の計画」では予定日
- **週のふりかえり**: `WeekReviewCard`（統計の先頭）＋ `getWeekReview`（`src/lib/weekReview.ts`）。
  計画どおり実行率は、時刻つき予定（タスク・範囲習慣）を `matchPlanAndActualForDate` でログと突き合わせた割合
- **同期**: `useSupabaseSync` は毎回 取得 → `mergeSnapshots`（`src/lib/syncMerge.ts`）で前回同期ベースライン
  （localStorage `chronograma-sync-baseline-v1:{userId}`）との三方向マージ → ローカル反映 → push（削除は
  マージで決めた ID だけ）。フォーカス復帰時と表示中 60 秒ごとにも同期。ベースラインが無い初回は従来の `decideHydrate`

- **リストの種類**（`TaskList.kind`、`src/types/list.ts`）: `tasks`（既定）/ `someday`（いつか・Wish）/ `checklist`（買い物など）。
  `unplannedListIds`（`src/lib/listKind.ts`）の ID は スマートビュー（今日・近日中・期限切れ・すべて）、`getDayPlan`、`getWeekReview`、
  統計、`checkAndNotify`、Edge Function `daily-reminders` の残り件数から除外（そのリストを開けば見える）。切り替えはリスト見出しの
  `ListKindPicker`、サイドバーのリスト行に種類アイコン。新規ユーザーの初期リストは 未分類 / いつか / 買い物（`initialLists`）。
  クイック追加の `@名前`（`parseQuickAddTitle` の `listName`、`findListByName`）で追加先を指定。`tasks` 以外のリストには日付を付けない。
  DB は `lists.kind`（`004_list_kind.sql`）。未適用の DB では push 時に kind なしで送り直す

- **いつか / チェックリストの専用画面**: リスト選択時に `kind` が `checklist` なら `ChecklistView`、`someday` なら `SomedayView`
  （`App.tsx` の `mainContent`）。`uncheckTasks`（全部戻す）・`promoteToPlanned`（いつか → 未分類 + 今日の予定日）はどちらも Undo 1 段。
  `TaskDetail` は `tasks` 以外のリストで優先度・締切・予定日の欄を出さない。カレンダー（月・週・日パネル）と予定 vs ログも除外
- **記録の分類**: 分類は 1 つ選ぶチップ（`TimeLogTagField`、同じチップで解除、＋で追加すると設定の分類にも保存）。既定の分類
  （`logCategories.defaults`、勉強・課題・就活…）を新規ユーザーに入れ、persist v26 で空の既存ユーザーにも入れる。分類なしで記録したら
  `inferLogCategory`（`src/lib/logCategory.ts`: 元タスクの先頭タグ → 同じタイトルの前回の分類）を `startTimer` / `addTimeLog` /
  `addCompletedTaskWithTime` で補う。タイトル空でも分類だけで開始可（タイトル＝分類名）
- **今日画面から記録**: `QuickLogStarter`（「今日の計画」の見出し下）。「記録する」でタイトル（任意）＋分類、最近の記録 3 件
  （`recentLogs`）はワンタップで再開。記録中は `FloatingTimer` に任せて隠れる

- **色**（`src/lib/googleColors.ts`）: リスト・習慣・記録の分類はすべて Google カレンダーの 11 色（パレット切り替えは廃止、
  persist v28 で既存のリスト・習慣の色を色相の最も近い色へ、未分類はラベンダー）。タイムラインは、予定＝リスト色の
  薄い面（`.gc-plan`）、記録＝分類色の塗りつぶし（`.gc-solid`）、外部予定＝ピーコック。色は style の `--c` で渡す
  （`colorVars`、index.css）。分類の色キーは `logCategoryColors`（`src/lib/logCategoryColors.ts`、旧 Tailwind キーは読み替え）。
  管理は設定の `CategoryManager`（色・名前変更＝過去の記録も書き換え、同名なら統合・並べ替え・候補から外す・直近 30 日の使用時間・
  記録にだけある分類の取り込み）。ストアは `addLogCategory` / `renameLogCategory` / `removeLogCategory` / `moveLogCategory` /
  `setLogCategoryColor`（どれも Undo 1 段）
- **設定画面**: `SettingsGroup` / `SettingsRow` / `Segmented` / `Switch`（`src/components/settings/SettingsPrimitives.tsx`）で
  外観（テーマ: 端末に合わせる / ライト / ダーク、言語）→ 通知と 1 日のリズム（締切の通知もここ。サイドバーのトグルは廃止）→
  記録の分類 → アカウント → アプリ → データ の順。`theme` は `'light' | 'dark' | 'system'`

- **Google カレンダー風の操作**（週・日タイムライン）: ブロックを押すと `EventPopover`（`src/components/timeline/`、ブロックの横に
  出る小さなカード。完了・▶記録・削除・詳細、Esc / e / Delete）。空き時間はクリック（1 時間）かドラッグで `CreateGhost` と
  `QuickCreatePopover`（タイトル・時間・リスト、保存 / その他のオプション、外側クリックと Esc は破棄）。クリックでの作成は
  `useTimelineDrag` の `clickCreateMinutes`（予定 vs ログでは未指定＝従来どおり）。スマホ幅ではカードが下からのシート。
  30 分の点線は廃止（1 時間線のみ）、週表示も今日を含む週なら今の時刻へスクロール
- **予定と記録（旧 予定 vs ログ）**: 照合結果で色を塗らず、他の画面と同じ（予定＝`.gc-plan` のリスト色 / 習慣色 / Google 青、
  時間が過ぎた予定＝`.gc-missed`、記録＝分類色の `.gc-solid`）。照合は小さな文字だけ（✓ 予定どおり / N分ズレ）。未実行を赤くしない、
  「予定外」も付けない。Google 連携は未接続なら 1 行（ボタンや警告を並べない）。凡例は 予定 / 記録 / 終わった予定 の 3 つ
- **記録の色**: `Task.color`（`#RRGGBB`、`tasks.color` は `006_task_color.sql`）があれば分類の色より優先（`recordHex`）。
  予定と記録で Google の予定を「記録にする」と、その予定の色を写す（`addCompletedTaskWithTime(..., color)`）。Google の予定の色は
  `googleEventHex`（予定の colorId 1〜11 → 画面の 11 色、無ければ Edge Function `google-calendar` の `events` が返す
  `calendarColor`（カレンダー自体の色、旧パレットなので最も近い 11 色へ）、それも無ければピーコック）で `CalendarEvent.color` に解決
- **呼び名**: 画面上は「記録」に統一（ナビ「予定と記録」「記録」、完了の見出しは「完了 N 件」）。コード上の識別子（activity-log 等）は従来どおり
- **カレンダー**: 下の ToDo ドックは既定で閉じる（右の日パネルと重複するため）。月のマスには記録を分類色の積み上げ帯＋合計時間で
  先頭に表示。月外のマスは日付と中身だけ薄く（マス全体の opacity は罫線ごと消えるのでやめた）
- **習慣**: 達成率は `consistencyForLast7Days`（直近 7 日、今日は達成済みのときだけ数える）に一本化。連続日数は今日まだなら昨日から
- **予定と記録の見せ方**（`src/lib/planVisual.ts` の `planVisualState`）: 記録と可視化が主役なので、色で目立つのは記録（実績）だけ
  （分類色の塗りつぶし `.gc-solid`、ログ画面も同じ）。予定は薄く（`.gc-plan`、リスト色をうっすら）、時間が過ぎたら完了・未完了とも
  グレー（`.gc-missed`、完了は ✓）。外部の Google 予定は塗りつぶしの青。週・日タイムライン、終日の行、月表示（時刻つきは
  「● 15:00 タイトル」、終日は帯）で共通
- **1 文字ショートカット**（`App.tsx`、`src/lib/shortcuts.ts`）: t 今日 / j・n 次 / k・p 前 / d 今日の計画 / w 週 / m 月 / l ログ /
  c 追加 / / 検索 / ? 一覧（`ShortcutsHelp`）。入力中・修飾キー・ダイアログ表示中は無視。日付移動は `dispatchNav` のイベントを
  各画面が `useNavShortcut` で受ける（今日の計画・カレンダー・ログ・予定 vs ログ・習慣）
- **予定の開始前通知**: `eventReminderMinutes`（5/10/15/30 分前、既定オフ、設定の「通知と 1 日のリズム」）。タブが開いている間は
  `checkEventReminders`（`src/lib/eventReminders.ts`、localStorage で 1 日 1 回）、Web Push 購読中は Edge Function
  `daily-reminders` が `push_subscriptions.event_reminder_minutes`（`005_event_reminders.sql`）を見て送る

### グローバルショートカット（`App.tsx`）

- 1 文字ショートカットは上記。以下は修飾キー付き

- **⌘/Ctrl+K**: 検索フォーカス
- **⌘/Ctrl+N**: Quick Add（`[data-quickadd]` または
  `requestQuickAdd()`）。確定は「追加」ボタン、または IME 未変換時の
  **Enter**（`isComposing` でないときのみ）
- **⌘/Ctrl+Z**（Shift なし）: 直前の**データ操作**を 1 段階戻す（`taskStore`
  のメモリ上の履歴、最大約 50 段）。入力欄・`contenteditable`
  フォーカス時はブラウザのテキスト取り消しを優先。履歴が空で `deletedTasks`
  だけ残っている場合は従来どおり `undoDelete()`
- **⌘/Ctrl+⇧Z**: 直前に ⌘Z で戻した操作をやり直す（`redoLastOperation()`、
  redo スタックも最大約 50 段）。新しいデータ操作（`pushUndo`）が走ると redo
  スタックはクリアされる。入力欄フォーカス時はブラウザ標準を優先

### DnD（`DndContext`）

- センサ: **MouseSensor**（距離 5px）＋ **TouchSensor**（長押し約 280ms /
  tolerance 8）でスクロールと競合しにくくする
- 未完了ルートタスクの手動並べ替え・セクション間移動（`TASK_PREFIX` +
  `buildReorderedActiveRootIdsForGroup`（`SortableTaskItem` の
  `data.dragGroupRootIds`）→
  `reorderManualRootTasks`）。複数ルート選択中にドラッグすると選択ブロックをまとめて移動（複数選択時は水平ドラッグの階層操作は無効）。セクション見出しの並べ替えは
  `DRAGSEC_PREFIX` / `DROPSEC_PREFIX` + `reorderSections`
- サブタスク（`SUBTASK_PREFIX` + `SortableSubtaskItem`）：兄弟の並べ替え／
  ドロップ先サブタスクと同じ親・位置へ移動、ルート行へドロップでその子に →
  `moveSubtaskInList`（`src/lib/subtaskDnD.ts`）。親は多段可（最大深さは
  `src/lib/taskDepth.ts` の `MAX_TASK_TREE_DEPTH`）
- **階層操作はアウトライナー風の水平ドラッグで行う**（`event.delta.x`、
  横移動が縦移動より大きいときのみ・複数選択時は無効）。`over` 判定より前に処理：
  - **1 段下げる（サブ化）**: 右へ `NEST_DRAG_DELTA`(=24px) 以上 →
    `indentTaskUnderPrevSibling`（`taskStore`）。**直前の表示兄弟の子**に入れる
    （ルート→`nestRootUnderParent` / サブ→`moveSubtaskInList`）。兄弟が無ければ不可。
    判定は `src/lib/taskDragIntent.ts`（`isIndentIntent`）と
    `getIndentTargetId`（`taskDepth.ts`）で共有
  - **サブ化プレビュー（ドロップ前）**: `TaskList` の `onDragMove` で
    `isIndentIntent` 成立中は `getIndentTargetId` を親候補にし、該当行に
    `NestDragGuide`（濃いグレーの L 字ガイド線＋親行ハイライト、`showNestGuide`）を表示。
    `onDragEnd` / `onDragCancel` でクリア
  - **1 段上げる（昇格）**: 左へ `UNNEST_DRAG_DELTA`(=24px) 以上（サブのみ）→
    親もサブなら祖父母直下（旧親の直後）へ `moveSubtaskInList`、親がルートなら
    `promoteSubtaskToRoot`（旧親の直後・同セクション）
  - 行へ「ドロップして子にする」帯（旧 `RowNestDropTarget` / `nest::`）は**廃止**。
    ポインタ位置によるネスト判定も廃止し、ドロップは並べ替え・親移動のみ
- `TaskList` の手動ソートは **単一の
  `SortableContext`（`flatManualSortableIds`）**
  で、ルートとその下の**全段**の未完了サブを表示順どおり登録（`DnDSubtreeRows`）
- タスク／サブタスクのドラッグ中は `DragOverlay` で `TaskItem`
  プレビューを表示し、元行は `SortableTaskItem` / `SortableSubtaskItem`
  側で非表示化（`opacity: 0`）。同時に `transition`
  を抑えて境界付近の「押し出し」感を減らす。複数ルート選択中のドラッグでは
  `dragGroupRootIds.length` を `handleDragStart` で拾い、オーバーレイを
  重ねカード＋件数バッジ（`taskList.dragCount`）で表示し「まとめて移動中」を明示
- タスクをリストへドロップ（`drop::{listId}` + `moveTaskToList` / 複数選択時は
  `moveTasksToList`）— ドラッグ元はルートの `task::` のみ
- **ネイティブ HTML5 ドラッグ（手動以外のソート行・`CalendarTaskDock`）も複数選択対応**。
  `TaskItem` の `dragGroupIds` があると `handleDragStart` で選択 ID 配列を
  `TASK_MULTI_DND_TYPE`(`application/x-task-ids`, JSON) に載せ、件数バッジの
  ドラッグ画像を出す。落とし先は `readDraggedTaskIds`（`useTimelineDrop.ts`）で
  取り出す: 週/日タイムライン（`useTimelineDrop.handleDropEvent`）はドロップ位置から
  各タスクを重ならないよう順に積み上げ、月カレンダー（`CalendarView`）は全件の
  `scheduledDate` を更新。`CalendarTaskDock` は自前の選択 state（⌘/Shift/選択中クリックで
  トグル、`onNativeDragEnd` でクリア）を持つ
- リスト並べ替え（`LIST_PREFIX`（`src/lib/listDnD.ts`）+ `reorderLists`）
- 衝突判定は `taskListCollision`
  でドラッグ種別ごとに優先順を切替（`pointerWithin`／空なら `closestCenter`）

## 状態管理（`src/store/taskStore.ts`）

### 主要 state（抜粋）

- `tasks`, `lists` — 既定リスト「未分類」ID: `__inbox__`（`INBOX_LIST_ID`）
- `selectedListId`, `selectedView` — スマートビューとリスト選択は排他（**永続化**。リロードで同じ画面を復元）
- `settingsScrollTarget`（`'appearance'` | `'account'` | `null`）—
  `openSettingsWithScroll` で設定を開いた直後に `SettingsView`
  が該当セクションへスクロールし、直後にクリア（永続化しない）
- `calendarMode`（`month` | `week`）—
  カレンダースマートビュー内の表示切替（永続化）
- `selectedCalendarDateKey`（`yyyy-MM-dd`）—
  カレンダーハブの選択日と習慣一覧のフォーカス日を共有（`setSelectedCalendarDateKey`、永続化）
- `theme`, `searchQuery`, `sortMode`, `filterTag`）
- `timeLogTagPresets`（活動ログ用タグの候補リスト・設定で編集、`setTimeLogTagPresets`）
- `deletedTasks`（削除トースト用）、`undoLastOperation()`（⌘Z
  用の直前スナップショット復元・永続化しない）／`redoLastOperation()`（⌘⇧Z
  用・redo スタックも永続化しない）、`notificationsEnabled`
- `listColorPaletteId`（`src/lib/listColorPalettes.ts`）
- `calendarEvents`, `googleConnected`, `googleAccessToken`
- `activeTimer`, `habits`（`addHabit` / `updateHabit` / `deleteHabit` /
  `toggleHabitDate`）

### `SmartView`

`all` | `today` | `upcoming` | `overdue` | `calendar` | `plan-vs-actual` |
`activity-log` | `stats` | `habits` | `archived` | `deleted` | `settings`（旧
`week-calendar` は v12 マイグレーションで `calendar` + `calendarMode: week`
に統合）。`archived` / `deleted` は `TaskBinView`（アーカイブ済み / ゴミ箱）

検索クエリが非空のときは `SearchResults` が最優先。

### 永続化 `partialize` で除外されるもの

次は **localStorage に保存されない**（リロードで初期化）:

- `searchQuery`, `deletedTasks`, `quickAddRequested`, `filterTag`
- `calendarEvents`, `googleAccessToken`, `moveBannerText`,
  `taskDragHoverListId`, `settingsScrollTarget`

### タスク挙動メモ

- **新規タスク**（`addTask` / `addTaskAfter` / `addTaskWithDate` /
  `addTaskWithTime`）は、`addTask*` が同一リスト・同一親の兄弟のうち
  **手動ソート順で先頭**（既存の最小 `order` より手前の `order`）へ追加。
  `addTaskAfter` は指定タスクの**直後**に同階層挿入（次兄弟がいれば中間
  `order`、末尾なら `+1`）。`addTask` と `addTaskAfter` は新規タスクの **id
  を返す**。親指定時は親の `listId`
  に合わせる。タイムログ系の追加は従来どおり末尾相当
- **新規セクション**（`addSection`）は作成したセクションの **id
  を返す**。`TaskList`
  の「セクションを追加」直後はその見出しがインライン入力に切り替わり、自動フォーカスで即時リネームできる（Enter/Blur
  で確定、Esc でキャンセル）。**リスト選択時**はそのリストのセクション見出しでグルーピング。**スマートビュー**（すべて／今日／近日中／期限切れ）では、表示中タスクが属するリストにセクションがあるとき、**リスト名＋各セクション**で横断表示する（セクションの無いリストはリスト名見出しのみ）。手動 DnD のセクション間／リスト横断移動は `sectionUpdate.listId` で `listId` も更新（子は追随）
- **一覧**（`TaskList`）では `parentId`
  付きサブタスクを親の下に**再帰的**にインデント表示（`StaticSubtreeRows` /
  `DnDSubtreeRows` / 完了は `CompletedSubtreeRows`）。手動ソート時は単一
  `SortableContext` + 各行の `RowNestDropTarget` でサブタスク
  DnD（`moveSubtaskInList`）。`QuickAdd`
  はリスト用スクロール領域の**先頭**。追加は「追加」ボタンまたは IME 確定後の
  Enter。行タイトル編集中の Enter
  では編集を確定し、同じ階層の**直下**へ空タイトルの次タスクを追加（サブタスクは同じ親の配下に追加）し、追加された行は自動でインライン編集に入りそのまま入力できる。**右側の詳細ペインは廃止**し、一覧はどの幅でも全幅。詳細は**行のクリック／タップで右からのオーバーレイシート**として開く（`TaskDetail`、`max-w-md`、外側クリック / ✕ で閉じる）。`QuickAdd` は追加後に詳細を開かず一覧に留まる（連続追加できる）。タイトル末尾は
  `parseQuickAddTitle`（`src/lib/parseQuickAdd.ts`）で
  `#tag`・日付語などを解釈（UI の日付チップはなし）

- **`completedAt`**: ToDo の完了日時（ISO）。`toggleTask`
  で完了時に現在時刻、未完了に戻すと `null`。繰り返しタスクの次回分は
  `null`。`updateTask` で `completed` を切り替えたときも同様。`importData`
  と永続化 v21 で旧データは `completed && !completedAt` を `updatedAt`
  で埋める。`StatsView` の日別完了・ストリークは `completedAt ?? updatedAt`
- 一覧の**予定タスク**（配置日 + `startTime` + `endTime`
  あり）を未完了→完了にすると、即時トグルではなく「完了を記録」モーダルを開く。`予定どおり完了`
  / `時間をずらして実行`
  を選び、開始・終了時刻をピッカーで調整し、メモ（任意）付きで保存すると、タイムログ（`isTimeLog: true`）を作成してから元タスクを完了にする
- `PlanVsActualView`
  の左列（自分の予定タスク）もクリックで同じ「完了を記録」モーダルを開く。ドラッグ/リサイズ時は従来どおり時間調整を優先し、クリック時のみ完了フローへ入る
- `PlanVsActualView` の左列の**習慣（range スロット）**は、行末チェックで
  `addCompletedTaskWithTime` でログ列へ追加。該当日が未達成なら
  `toggleHabitDate`
  で達成にする（既に達成済みでログだけ欠いている場合はログのみ）。左列の色はログとの突合のみ（`completedDates`
  だけでは実行済み色にしない）。タスク用の「完了を記録」モーダルは出さない
- **タイトル行**:
  ダブルクリックで名前をインライン編集。タイトル文字上のシングルクリックで詳細を開く挙動は短い遅延後（ダブルクリックと競合しないため）。修飾キー・一括選択中のタイトルクリックは従来どおり即時
- **一覧の複数選択**:
  ⌘/Ctrl+クリックでトグル、Shift+クリックで表示順の範囲、何か選択中は通常クリックもトグル。左端の四角チェック（ホバーまたは選択中に表示）。Escape
  / ビュー・フィルタ・ソート変更で選択解除。タスク DnD
  開始時は単体ドラッグのときのみ選択解除（複数選択のままブロック DnD
  のときは維持）。**Delete /
  Backspace**（選択中・入力フォーカス以外）またはツールバーから一括完了・`deleteTasks`・`bulkUpdateTasks`（リスト移動は子孫の
  `listId` も揃える、優先度・期限は選択行のみ）。一括削除は `deleteTasks` で単一
  `deletedAt`（Undo 一括）
- 繰り返し付きタスクを完了すると **次回分を新 ID** で追加（`dueDate`/`scheduledDate` とも進める）
- `dueDate`（期限）を `null` にすると `dueTime` / `recurrence` をクリア。`scheduledDate`
  （予定）を `null` にすると `startTime` / `endTime` をクリア（カレンダー操作は予定側を更新）
- **タイムログ**: `isTimeLog: true` など。`startTimer` / `stopTimer`,
  `addTimeLog`, `addCompletedTaskWithTime`。ストア上は `completed: true`
  のまま。**ToDo
  一覧（`TaskList`）とカレンダー横ドック（`CalendarTaskDock`）、月カレンダー（`CalendarView`）には
  タイムログ行を出さない**（完了済みにも混ぜない）。確認・追加は「ログ」「予定
  vs ログ」や週カレンダーのログ列などで行う。`TaskItem`
  はタイムログ行に取り消し線を付けない（緑の 円チェック）。`importData` は
  `is_time_log` を `isTimeLog` に正規化。永続化 v13 でタスクの `is_time_log`
  をマージ。未完了件数・手動 DnD
  の未完了ルート（`getOrderedActiveRootTasksForDnD`）からは除外
- **アーカイブ / ゴミ箱（ソフト削除）**: `Task.archivedAt` /
  `Task.deletedAt`（ISO・`null` は非該当。`src/lib/taskLifecycle.ts` の
  `isActiveTask` / `isArchivedTask` / `isDeletedTask`）。**削除は即時ハード削除ではなくソフト削除**
  で、`deleteTask` / `deleteTasks` は対象＋全子孫に `deletedAt`
  を付与し「ゴミ箱」へ。復元 `restoreDeletedTask`・完全削除
  `permanentlyDeleteTask`・全消去 `emptyDeleted`。アーカイブは `archiveTask` /
  `archiveTasks`（子孫にも `archivedAt`）・解除 `unarchiveTask`。**削除済み /
  アーカイブ済みは通常ビュー（一覧・カレンダー・週・ログ・統計・検索・通知・予定vsログ・DnD・未完了カウント・サブタスク描画）から除外**し、`TaskBinView`
  だけが該当タスク（親も同じ箱にあれば親のみを代表表示）を出す。⌘Z（`undoLastOperation`）や削除トースト（`undoDelete`
  は最後のバッチの `deletedAt` をクリア）は従来どおり。アーカイブは `TaskItem`
  行の**アーカイブ（箱）アイコン**をワンクリック（削除アイコンの隣・`toast.taskArchived`）。⋮
  メニューはルートタスクのリスト移動のみ
- **import/export**: JSON バックアップ **schema
  v3**（`src/lib/backupFormat.ts`）。 `schemaVersion` / `exportedAt` /
  `listSections`（import は `sections`・`list_sections`
  も可）。`order`・`sortOrder`
  エイリアス。`timeLogTagPresets`・`listColorPaletteId` 含む。**import
  バリデーション**: 重複 ID（tasks/lists/sections）、 孤児参照（`task.listId` /
  `task.sectionId` / `task.parentId` / `section.listId`）を 検出した JSON
  は適用しない。ダウンロード名 `chronograma-backup-YYYY-MM-DD.json`
- **CSV 取り込み（Web）**: `importTasksFromCsv`（`src/lib/importTasksCsv.ts`）—
  既存データに**マージ**（全置換 JSON とは別ボタン）。列: `title`
  必須、`due_date`、 `list`、`completed`、`tags`、`priority`、`description` 等

## Supabase 同期（`src/hooks/useSupabaseSync.ts`）

- ログイン済みかつ `getSupabase()` ありのときのみ
- **通常**（端末にベースラインあり）: 取得 → `mergeSnapshots`（`src/lib/syncMerge.ts`）で三方向マージ →
  ローカル反映 → push（削除はマージで決めた ID だけ）→ ベースライン保存。変更の 1.8 秒デバウンス後・
  フォーカス復帰時・表示中 60 秒ごと。同期は常に 1 本ずつ直列
- **この端末で初回**（ベースライン無し）: `fetchListsTasksHabits` →
  `decideHydrate`（`src/lib/supabaseData.ts`）
  - リモート完全空 → **ローカルを push**
  - リモートが
    trivial（未分類のみ・タスク・習慣・追加リストなし）かつローカルにデータ →
    **push_local**
  - それ以外 → **リモートで上書き**（選択リストが消えていれば未分類へ）
- **push**: upsert のあと、`deletes` 指定時はその ID だけを **tasks → habits → sections → lists** の順で削除。
  未指定（初回の push_local）は従来どおりローカルにない ID を削除
- `tasks` upsert で **`end_date` / `completed_at` / `location` / `due_time` /
  `scheduled_date` / `archived_at` / `deleted_at`
  カラム未適用**エラーが出た場合は、その push 呼び出し内だけで該当列なし
  payload にフォールバックして再試行する（**`tasks` に列が無い**古い DB
  の互換）。フラグはモジュールに保持せず**毎回フル列で送り直す**ため、後から
  Supabase に列を追加すれば**次回同期で自動復帰**する（ページ再読み込み不要）

## 型（`src/types/`）

- `task.ts` — `Task`。**期限**＝`dueDate`（日付）＋任意の **`dueTime`**（締め切り時刻
  `HH:mm`）。**予定**＝**`scheduledDate`**（カレンダー配置日）＋`startTime`/`endTime`
  （時間幅）。カレンダー配置は `taskPlacementDate`（`lib/taskTimeRange.ts`）で決まり、
  通常タスクは `scheduledDate ?? dueDate`、タイムログは `dueDate`。**`completedAt`**：
  完了日時。タイムログ用に任意の **`endDate`**（`dueDate` が開始日）。任意の
  **`location`**：場所の自由入力（Google マップへ飛べる）、`Priority`,
  `Recurrence`。**`archivedAt` / `deletedAt`**：アーカイブ／ソフト削除の ISO
  時刻（`null` は非該当。`src/lib/taskLifecycle.ts`）
- `list.ts` — `TaskList`（`order` ↔ DB `sort_order`）
- `habit.ts` — `Habit`, `HabitFrequency`, `HabitTimeMode`（`none` | `fixed` |
  `range`）。`completedDates` は `yyyy-MM-dd`
- `calendarEvent.ts` — 正規化済み Google 等イベント
- `plannedItem.ts` — `PlannedItem`, `PlannedSource`（`google` | `scheduled-task`
  | `habit`）

## 主要コンポーネント

| パス                                                                                                       | 役割                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Sidebar.tsx`                                                                                              | ヘッダ左のアイコンでメニュー（設定・外観へ／アカウント節へ／`VITE_APP_INSTALL_URL` があれば入手リンク）。ナビに設定行は無し。**ナビの内容はビューに依らず一定**: 「To‑Do」行＋カレンダー等の他スマートビュー、**統計**はスクロールナビの下・フッター区切り線の上に単独行。「To‑Do」行は To‑Do 系ビュー（`isTodoNavView`）で選択表示になり、押すと `all`（すべて）へ切替（すでに To‑Do 系なら何もしない）。To‑Do のサブナビ（期限別／リスト／アーカイブ・ゴミ箱）は **lg 以上では `TodoNavPanel`**、**lg 未満では「To‑Do」行直下にインデントして展開**（md〜lg 未満は常設サイドバー側、md 未満はドロワー側。`useIsDesktop` / `useIsLargeScreen` で排他にし、リスト行の DnD id を二重登録しない）。常設サイドバーとドロワーは CSS で出し分けず**片方だけマウント**する（state / ref の共有を避ける）。モバイルドロワーは不透明背景で、下端は `pb-[calc(3.5rem+safe-area)]` で `MobileBottomNav` を避ける。**フッターは通知トグルのみ**（エクスポート／JSON インポート／CSV 取り込みは `SettingsView` の「データ」節へ移動）                                                                                                                                                           |
| `TodoNavPanel.tsx` | To‑Do のサブナビ本体（`TodoNavContent`：「すべて／今日／近日中／期限切れ」→区切り→リスト（小見出しなし・並べ替え／色／改名／削除。**各リスト直下にそのリストのセクション行**をインデント表示し、タップで `selectList`＋`quickAddSectionId`）と「リストを追加」→区切り→「アーカイブ済み／ゴミ箱」）と、lg 以上でサイドバー右に常設する細いパネル（`TodoNavPanel`、`w-52`、見出しは「To‑Do」）。`App.tsx` が `isTodoNavView` && `useIsLargeScreen` のときだけマウント。リスト名の追加／改名は **Enter は `!isComposing` のときだけ確定** |
| `SmartViewRow.tsx` | サイドバー／`TodoNavPanel` 共通のスマートビュー行（`button` ＋アイコン＋`sidebar.views.*` ラベル＋選択スタイル。選択中は `aria-current="page"`） |
| `TaskList.tsx`, `TaskItem.tsx`, `SortableTaskItem.tsx`, `SortableSubtaskItem.tsx`, `NestDragGuide.tsx` | 一覧・ソート・DnD（多段サブタスク・`DnDSubtreeRows` 等。階層変更は水平ドラッグ。右ドラッグ中は `NestDragGuide` でサブ化プレビュー）。`TaskItem` は**タイトルクリックでインライン編集**（修飾キー・一括選択時は従来どおり行操作）。行のその他の領域のクリックで `onRowClick`→詳細。タイトル下には期限テキスト（今日/日付/期限超過）と**メモ（`description`）の最初の非空行を1行だけ truncate 表示**し、期限編集はホバー時の日付アイコン／詳細（`hideDueDatePicker` で日付アイコン非表示可）。ホバーで**キュー（リスト）型 SVG**のリスト移動メニュー（ルートのみ）・**アーカイブ（箱）アイコン**・削除。アーカイブと削除は行のアイコンをワンクリックで実行。**md 未満は日付アイコン／アーカイブ／削除を出さず、⋮ メニューにアーカイブ・削除を畳む**（行の固定アイコンで幅を食うとタイトルが 80px 程度しか残らないため。サブタスク行の ⋮ は md 未満だけ）                                                                                                                                                                                                                                                                                                                                                 |
| `SectionHeaderDnD.tsx`                                                                                     | リスト内セクション見出し：並べ替えハンドルはタイトル右（編集・削除の左）。「セクションなし」と見出し左端を揃える                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `TaskDetail.tsx`                                                                                           | 詳細編集。**常に右からのオーバーレイシート**（`fixed inset-0`＋`max-w-md`、外側クリック / ✕ で閉じる）。分割ペイン（`layout` prop）は廃止済みで、どのビューでも行のクリック／タップで開く。`isTimeLog` は行動ログ UI に切替え、優先度・リスト等は非表示。通常タスクは **期限（日付＋締切時刻 `dueTime`）** と **予定（予定日 `scheduledDate` ＋時間幅 `startTime`〜`endTime`）** を別セクションで編集。ログの日時は **開始／終了それぞれ「日付＋時刻」** を近接配置（Google カレンダー風）。**場所（`location`）** 入力＋「Google マップで開く」リンク（`src/lib/linkify.ts` の `googleMapsUrl`。URL を入れたらそのまま、住所等は Maps 検索）。**メモ（`description`）** は表示／編集トグル式（クリックで `textarea` 編集、blur で表示に戻る）。表示モードでは `linkifySegments` で **URL 部分だけを色付きのクリック可能リンク**としてインライン描画                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `CompleteWithLogModal.tsx`                                                                                 | 予定タスクの「完了を記録」モーダル（タイムログ作成＋完了）。`TaskList` と `PlanVsActualView` で共有。日付＋時刻は **開始ブロック／終了ブロック** の2段                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `TimeInput.tsx`                                                                                            | 共通時刻入力。Google カレンダー PC 風の「入力欄 + 15分刻みドロップダウン候補」を提供。手入力補正（例 `930`→`09:30`）を維持しつつ、上下キー移動 / Enter 確定 / Esc 取消 / Tab 確定 / 外側クリック確定の挙動を統一。値が空でピッカーを開くと**現在時刻周辺**を初期ハイライト／スクロール。`pickerDefault` prop で初期位置を上書きでき、終了時刻入力には**開始時刻+1時間**を渡して開始時刻付近を初期表示。`TaskDetail` / `CompleteWithLogModal` / `ActivityLogView` / `HabitsView` で利用                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `QuickAdd.tsx`                                                                                             | クイック追加。追加後は入力欄にフォーカスを残し、詳細は開かない（連続追加できる）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `CalendarHubView.tsx`                                                                                      | カレンダー用ハブ（月/週タブ、**Google 風日付ナビ**（今日・前後・期間ラベル＋ミニ月ピッカー）、`monthCursor` / `weekAnchor` はローカル、**選択日は** `taskStore.selectedCalendarDateKey` を子へ受け渡し、ToDo ドック、`lg` 以上で右に「選択日パネル」、**md 未満の月表示ではグリッド下に選択日パネル**、md 未満でサイドバーを開くボタン） |
| `CalendarDayPanel.tsx`                                                                                     | 選択日の詳細パネル。タブで「予定 / ToDo」「ログ」を切替し、当日ログの合計時間を表示。`予定 / ToDo` は未完了の**配置日**（`taskPlacementDate`＝予定日 ?? 期限）一致タスク＋外部予定。下部に **`completedAt` がその日のルート ToDo** の「実行済み」一覧（件数 0 のときは `noExecuted` 文言）。見出し右の**＋**（`予定 / ToDo` タブのみ）で選択日への ToDo をインライン追加（Enter 後も入力欄を開いたままで連続追加）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `CalendarTaskDock.tsx`                                                                                     | カレンダー下部のリスト別 ToDo（**完了 ToDo は非表示**。複数選択可。ネイティブ DnD で月セル・週タイムラインへ**まとめて**ドロップ可）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `CalendarView.tsx`, `WeekCalendarView.tsx`                                                                 | 月グリッド（`displayMonth` 制御）・週タイムライン（`anchor` 制御）。**月セル**: 配置日（`taskPlacementDate`＝予定日 ?? 期限）のタスク行・Google 予定プレビュー等。ドラッグで日を移動すると**予定日 `scheduledDate`** を更新。`googleConnected` 時は Edge Function `google-calendar`（`action=events`）で予定取得。セル／週タイムラインのインライン ToDo 追加は **Enter は `!isComposing` のときだけ送信**。**md 未満の週はヘッダ7日のまま・グリッドは選択日1列**（`useIsDesktop`）。**ToDo 追加は控えめな＋ボタン**（`CalendarAddTaskButton`）: 月セルは日付の右（ホバー／選択日で可視・セルのダブルクリックでも開く。**単純クリックは日付選択のみ**）、週は日ヘッダ右上（md 未満は常時表示）で**終日 ToDo** を追加（追加中は終日行を強制表示） |
| `CalendarInlineTaskAdd.tsx`                                                                                | カレンダー共通の**インライン ToDo 追加入力**（`CalendarInlineTaskAdd`）と**控えめな＋ボタン**（`CalendarAddTaskButton`）。追加は `addTaskWithDate` でその日の**予定日**扱い。Enter は `!isComposing` のときだけ確定、Esc / blur で閉じる（`keepOpenAfterSubmit` で連続追加、`size` は月セル/週 `sm`・選択日パネル `md`）。aria/ツールチップは `calendar.addTaskAria` |
| `CalendarDateNav.tsx`                                                                                      | ハブ専用：今日・期間前後・期間ラベル（クリックでミニ月）、外側クリック/Escape で閉じるポップオーバー                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `PlanVsActualView.tsx`                                                                                     | 予定 vs ログ（マッチ色・凡例・習慣 range チェックでログ化等）。ヘッダのタイマーは `TimeLogTagField`。**md 未満は選択日1列**（日付ヘッダで `selectedCalendarDateKey` を切替）。タッチではブロックはタップで詳細（`useTimelineDrag` の coarse 分岐） |
| `ActivityLogView.tsx`                                                                                      | ログ（タイムラインのログ色は上記と同じルール）。タグ入力は `TimeLogTagField`（プリセットチップ＋datalist）。手動追加も **開始／終了の日付＋時刻** をブロック単位で近接配置。**md 未満はタイマー／手動入力を上・タイムラインを下の縦積み** |
| `StatsView.tsx`                                                                                            | 統計（ルートの通常タスクのみ集計、タイムログは除外）。完了日別指標は **`completedAt` を優先**（無い場合は `updatedAt`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `HabitsView.tsx`                                                                                           | ダッシュボード型 UI（28日ヒートマップ / 週次スコア / 連続日数）＋**フォーカス日**（`selectedCalendarDateKey`）のカード一覧。**その日にスケジュールあり**の習慣を先に表示し、**曜日などでその日が対象外**の習慣は下部にグレー（破線枠・低彩度）で並べ、クリックで編集。カード内の**週7丸は予定外曜日でも達成トグル可能**（週次%は予定日の達成のみ）。予定ありと予定外の両方があるときだけ小見出し（`habits.offDaySectionTitle`）。一覧の上にその週の曜日一行（クリックでフォーカス日をその列に合わせる。フォーカス列はヘッダーに背景トーン＋強調、カード内はリングで列同期）。日付は前日/翌日/今日で変更可能（カレンダーハブと同期）。新規追加は「習慣を追加」で展開。名前欄の **Enter は IME 未変換時のみ送信**（`!isComposing`、送信後フォーカス維持）、**Esc で閉じる**（QuickAdd と同型）。時間指定は `none` / `fixed` / `range`。`fixed` は `PlanVsActual` に出さない（`range` のみ）。集計は `habitStats.ts`、フォームは `habitDraft.ts` |
| `TaskBinView.tsx`                                                                                          | アーカイブ済み / ゴミ箱（`mode="archived" \| "deleted"`）。該当タスクを一覧（親も同じ箱なら親のみ代表表示）し、復元 / 戻す / 完全削除、ゴミ箱は「空にする」。`App.tsx` の `archived` / `deleted` ビューで描画 |
| `SettingsView.tsx`                                                                                         | 外観（`ThemeToggle`）、アカウント（`AccountMenu`）、**活動ログのタグ候補**（`#settings-time-log-tags`・1行1タグのテキストエリア、`parseTimeLogTagPresetLines` で blur 時に保存）、リスト色パレット、**データ**（`#settings-data`・エクスポート／JSON インポート（全置換・`confirm.importOverwrite`）／CSV タスク追加（マージ））。`#settings-appearance` / `#settings-account` でメニューからのスクロール先                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `SearchResults.tsx`                                                                                        | 検索                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `AccountMenu.tsx`                                                                                          | ログイン / ログアウト（設定では `variant="settings"`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `ThemeToggle.tsx`                                                                                          | ライト・ダーク切替（主に設定画面）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `FloatingTimer.tsx`, `UndoToast.tsx`, `MoveToast.tsx`, `MobileBottomNav.tsx`                               | 周辺 UI。md 未満はボトムナビ＋ safe-area 上にフロート。`MobileBottomNav` で主要画面切替（タブでビューを切り替えると `onNavigate` でサイドバードロワーを閉じる） |

補助: `src/lib/timeGrid.ts`（`timeToMinutes` / `formatDuration` / `timeToY` /
`formatTimeLabel`
等のグリッド用）、**`src/lib/taskTimeRange.ts`**（`taskTimedInterval`・複数日
`endDate`・レガシー一晩ログ・`durationMinutesForTaskSlot` /
`durationMinutesForTaskId` / `logOverlapsDateKey` / `minutesOfLogOnCalendarDay`
/ `timeLogSegmentLayoutForDay` / `patchAfterTimelineMove` /
`dragBlockDurationMinutes` 等）, `keyboard.ts`（`isModKey`: ⌘/Ctrl）,
`subtaskDnD.ts`（`SUBTASK_PREFIX`）, `listDnD.ts`（`LIST_PREFIX`）,
`todoSurfaceView.ts`（`isTodoSurfaceView` / `isTodoNavView`）, `habitStats.ts` /
`habitDraft.ts`, `src/locales/ja.ts`・`en`（`displayListName` 用 `lists.inbox`
等）,
`tagColors.ts`（タイムログのタグ色・`timeLogTagUniverse`・**`buildTimeLogTagUniverse`（プリセット先頭）**・`parseTimeLogTagPresetLines`）,
`TimeLogTagField.tsx`, `useTimelineDrag.ts`（ブロックの `setPointerCapture` 後は
`click` が届かないため、タップで詳細/完了モーダルを開く処理は `onBlockTap` で
`pointerup` 時に行う。タップ誤判定を減らすため、ドラッグ判定は `pointerdown`
からの移動量（6px 超）で行う）, `useTimelineDrop.ts`, `notifications.ts`,
`googleCalendar.ts`, `matchEvents.ts`, `plannedItemUtils.ts`,
`parseQuickAdd.ts`, `taskDepth.ts`（`getIndentTargetId` 含む）, `taskDragIntent.ts`（`isIndentIntent` 等）, `linkify.ts`（`extractUrls` / `linkifySegments` / `googleMapsUrl`）, `id.ts` など。

## データベース（`supabase/migrations/`）

**正本**: **`001_chronograma_schema.sql` 1 本**（`lists` / `list_sections` /
`tasks`（`tasks.location` / `tasks.archived_at` / `tasks.deleted_at` を含む）/
`habits`、インデックス、RLS。SQL Editor
で全体を流す想定。再実行しやすいよう `DROP POLICY IF EXISTS`
あり）。一覧の短い説明は **`supabase/migrations/README.md`**。

習慣のクラウド同期に必要な **`habits.time_mode`** も同ファイル内。`002_google_oauth.sql`（Google 連携）、
`003_push_subscriptions.sql`（Web Push の端末ごとの購読。送信は Edge Function `daily-reminders` を pg_cron で
5 分ごとに `x-cron-secret` 付きで呼ぶ。各端末のタイムゾーンで 1 日 1 回、失効購読は削除）。ルート
`README.md` の Supabase 節は本節と `migrations/README.md` と同期させる。

## 環境変数（`.env.example`）

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase
- `VITE_GOOGLE_CLIENT_ID` — 任意。Google Calendar 連携
- `VITE_VAPID_PUBLIC_KEY` — 任意。Web Push（`src/lib/webPush.ts`）。未設定・未ログイン・SW 無し（開発サーバー）
  では、タブを開いている間だけのローカル通知（`dailyReminders.ts`）にフォールバック。購読が有効な端末ではローカル通知を出さない

## npm scripts

- `dev` — Vite 開発サーバー
- `build` — `tsc -b` && `vite build`
- `lint` — ESLint
- `preview` — プレビュー

## 実装時の注意

- 同期は **タスク単位の三方向マージ**（フィールド単位ではない。同じタスクを両端末で編集したら `updatedAt` の新しい方）
- Google Calendar: **Edge Function** `google-calendar`（authorization code を `exchange` で refresh token に交換し `google_oauth` 表に保存、サーバー側で access_token リフレッシュ）。Web は `VITE_GOOGLE_CLIENT_ID` で **直接 Google OAuth**（`linkIdentity` は使わない。Supabase の `provider_refresh_token` は PKCE で取れないため）。`signIn` → Google 同意 → コールバック `?code=` → `exchange` → `status` / `events`。invoke アクション: `exchange` / `store` / `status` / `events` / `disconnect`。`events` は `timeZone`（IANA）を受け取り `Intl` で HH:mm を算出。Web は取得後に `start` / `end` ISO からローカル TZ で `date` / `startTime` / `endTime` を再正規化（`normalizeCalendarEventTimes`）。Google Cloud の **Authorized redirect URIs** にアプリオリジン（`http://localhost:5173` 等）が必要。Supabase secrets: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`。`googleConnected` は localStorage に永続化せず `status` で同期。`calendarEvents` はクライアントのみ。ログアウトで `disconnect` + リセット
- 未分類（`__inbox__`）は削除不可（リスト DnD
  では並べ替え無効）。サイドバーでは未分類行の左端（色→名前）を基準に他リストも揃え、並べ替えハンドルは名前の右・削除の左
- README
  と古いドキュメント間のマイグレーション説明の齟齬に注意（**スキーマの正本は
  `supabase/migrations/001_chronograma_schema.sql`**。短い説明は
  `supabase/migrations/README.md`。ルート `README.md` と本ファイルの DB
  節はそれと同期させる）
