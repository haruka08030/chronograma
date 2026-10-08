# Chronograma — Cursor 用プロジェクトコンテキスト

アプリ名は **Chronograma**。ローカルの作業ディレクトリ名は `jikanwari`
のままの場合がある。

## 既存ドキュメント

- ルートの `README.md`: プロジェクト概要・Web の起動手順・Supabase 手順
  （日本語）
- `doc/RULES.md`: 実装で守り続ける決まり（通知・操作・表示・同期など）
- `doc/IDEAS.md`: まだ作業に分けていないアイデアと方向性
- 具体的な作業は GitHub の Issue
- 本ファイル: エージェント・ルール用の**実装寄りの全体像**

**メンテナンス**: Cursor
で本リポジトリを開いたエージェントは、`.cursor/rules/sync-cursor-context.mdc`（常時適用）に従い、アプリやマイグレーション等を変えたときは可能な限り同じ作業で本ファイルを最新に保つ。

## プロダクト概要

- タスク、カレンダー表示、タイムログ、習慣トラッキング向けの **React Web
  SPA**（`src/`）。スマホ・タブレットも同じコードを **PWA**（ホーム画面に追加）で提供する。
  旧 Flutter 版（`mobile/`）は廃止（Git 履歴にのみ残る）
- **既定の永続化**: ブラウザ **localStorage**（Zustand `persist`、キー
  `chronograma-storage`、スキーマの版は `storeConstants.ts` の `STORE_VERSION`）。旧キー `tickdo-storage`
  は初回のみ `migrateLegacyPersistKey` で移行
- **オプション**: **Supabase** でメール **マジックリンク**（コード入力も可）または **Google**（`signInWithOAuth`、implicit で `#access_token` に戻る。カレンダー連携の `?code&state` とは別）でログインし、**リスト
  / タスク / 習慣** のクラウド同期。Google ログインはカレンダーの権限を求めない。未設定時は認証が noop 相当でローカルのみ

## 技術スタック

| 領域       | 内容                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ランタイム | React 19, TypeScript                                                                                                                                                                 |
| ビルド     | Vite 8（`vite.config.ts` で react / i18n / supabase / dnd-kit / date-fns を別ファイルに分ける。開いたときだけ要る詳細・メニュー・ポップオーバーは `src/components/lazyOverlays.ts` で遅延読み込みし、手すきのときに先読み。「今日の計画」以外の画面も `App.tsx` で遅延読み込み。どれも `lib/lazyComponent.ts` の `lazyNamed` で、読めなかったら境界が戻るとき（`retryFailedLazyLoads`）に取り直す。詳細・メニューは `ui/OverlaySuspense` の中で描き、読めなければ何も出さずに知らせて、次に押したとき・回線が戻ったとき・開き直したときに読み直す。画面は `ErrorBoundary` の「もう一度」か画面の切り替えで読み直す。デプロイ直後の古いファイル名（`lib/chunkLoad.ts` の `isChunkLoadError`）でオンラインなら 1 回だけ再読み込み（1 分は空ける。`vite:preloadError` と共通の `reloadForStaleChunk`） |
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
  通知タップの `?record=` / `as` / `launch` を `consumeLaunch` で読んで消す（`main.tsx`）。設定の `InstallAppSection` とサイドバーの
  「アプリとして使う」から案内
- URL と履歴: `src/lib/urlHistory.ts` の `setupUrlHistory()`（`main.tsx`）。画面の状態の持ち主はストア（`selectedView`・`selectedListId`・
  `filterTag`・`filterColor`）で、URL はその写し。形は `/?view=<SmartView>` か `/?list=<リスト id>`、絞り込みがあれば `&tag=`・`&color=`
  （解釈と組み立ては `src/lib/viewUrl.ts`。旧 `activity-log`→`planner`、`plan-vs-actual`→`calendar`）。起動時に URL の画面を開き、
  画面が替わるたびに `pushState`、ブラウザ・Android の「戻る」（`popstate`）で URL の画面を開く。最初の履歴・戻る/進むで開いた画面・
  リストの削除や同期でリストが替わったときは `replaceState`。積む URL は画面のクエリだけで、置き換えるときはほかのクエリ（Google の OAuth の
  `code`・`state`）とハッシュ（Supabase のログイン）を残す。戻った先のリストが無ければ `all`。モーダル・ドロワー・検索語は URL に載せない。
  パスは常に `/` なので `vercel.json` の書き換えは不要
- スマホ幅: 下部ナビは 今日 / To‑Do / カレンダー / 習慣 / 設定。統計は「今日」の上の段の右端のアイコンから開く（開いているあいだは「今日」タブが選ばれる）。To‑Do のリストは題名の左の ≡ か、画面を右へ払うと出るドロワーから開く。「今日の計画」は md 未満で「やること / タイムライン」を切り替え

## エントリ

- `src/main.tsx`: `./i18n/config` を読み込み後、`AuthProvider` で `App` をラップ
- `src/App.tsx`: レイアウト（ルートは `h-dvh`＝iOS Safari のツールバー分の見切れ回避）、`useSupabaseSync()`、ビュー切替（`calendar` は
  `CalendarHubView`）、グローバルキーバインド、DnD ルート。**ToDo
  面**（リスト選択 `selectedView === null` または `all` / `today` / `upcoming` /
  `overdue`）かつ検索が空のときだけ グローバルヘッダーは ToDo
  面かつ検索が空のとき**検索欄のみ**（`AccountMenu` は
  `SettingsView` へ）。それ以外の画面ではヘッダー非表示（カレンダーは
  ハブ内のメニュー）。**lg(≥1024px) 以上**で To‑Do 系ビュー（`isTodoNavView`＝ToDo
  面＋`completed` / `archived` / `deleted`）のときだけ、サイドバーの**右**に細い
  `TodoNavPanel`（`w-52`）を常設し（`useIsLargeScreen`）、その右がメイン列。
  詳細は列ではなくオーバーレイシートなので、メイン列は常に一覧のみ。
  サイドバー自体はどのビューでも全タブを表示し続ける。**md 未満**は下部に `MobileBottomNav`（今日 / To‑Do /
  カレンダー / 習慣 / 設定）。メイン列は
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
- **通知**: 何をいつ出すかは `supabase/functions/daily-reminders/schedule.ts`（純粋関数、サーバーとブラウザで共有）。
  朝のまとめ（`dailyReminders.planTime`）・予定の前（`eventReminderMinutes`）・締切の前（`notificationsEnabled`、前日 20:00 ＋ 3 時間前）・
  予定のあとの記録の確認（`recordPrompts`、通知の「予定どおり / 記録する」→ `logPlanAsPlanned` / `RecordPromptHost`）・
  タイマーの止め忘れ（3 時間）。タスクごとの通知は `Task.reminders`（`TaskRemindersField`、null は既定）。
  Web Push 購読中は Edge Function、それ以外は `App` が 30 秒ごとに `checkLocalReminders`（`src/lib/localReminders.ts`）。
  「今日の計画」でタスクが 1 件以上あるときに一度だけおすすめの通知をまとめてオンにする案内。`dailyCapacityMinutes`（既定 8h）を
  超えて計画すると穏やかに警告。設定は `DailyRhythmSettings`。日の集計は `getDayPlan`（`src/lib/dayPlan.ts`）
- **タスク連動タイマー**: `startTimer(title, tags, taskId)`。停止時に元タスクが未完了なら `completePromptTaskId`
  を立てて `FloatingTimer` が「完了にしますか？」を出す。1 分未満の停止はログを作らない。動いているタイマーはアカウントで 1 つ
  （`user_active_timer`、`lib/timerSync.ts`）。別の端末で始めたものもここで止められる
- **クイック追加の日時解釈**（`parseQuickAddTitle`）: 空白区切りの語から 今日/明日/明後日/曜日/来週X曜/9/30/10月3日、
  15時/15時半/午後3時/15:00/3pm、範囲 15:00-16:30・15時〜16時半、長さ 1時間/30分/1h/45m を読む。
  英語は today/tomorrow/tmr/tonight/曜日/noon と、空白をまたぐ next fri（来週の金曜）・this fri・this week/next week（その週の日曜締切）・
  this weekend（土曜）・in 2 days/in 3 weeks/in a week・Dec 5/5 Dec/Dec 5 2027 も読む（表示言語を問わない。`readEnPhrase`）
  時刻があれば予定（`scheduledDate`+時間幅、長さ未指定は 60 分）、日付だけなら To‑Do では期限日・「今日の計画」では予定日
- **週のふりかえり**: `WeekReviewCard`（統計の先頭）＋ `getWeekReview`（`src/lib/weekReview.ts`）。
  計画どおり実行率は、時刻つき予定（タスク・範囲習慣）を `matchPlanAndActualForDate` でログと突き合わせた割合
- **同期**: `useSupabaseSync` は毎回 取得（`lib/syncPull.ts` の `pullRemote`。ふだんは差分）→ `mergeSnapshots`（`src/lib/syncMerge.ts`）で前回同期ベースライン
  （localStorage `chronograma-sync-baseline-v1:{userId}`）との三方向マージ → ローカル反映 → push（削除は
  マージで決めた ID だけ）。フォーカス復帰時と表示中 60 秒ごとにも同期。ベースラインが無い初回は従来の `decideHydrate`

- **リストの種類**（`TaskList.kind`、`src/types/list.ts`）: `tasks` は未分類（表示名「To‑Do」）だけ / `someday`（いつか・Wish）/ `checklist`（買い物など）。
  To‑Do はラベルで分ける。ほかの `tasks` のリストと未分類のセクションは `foldTaskFolders`（`src/lib/foldTaskFolders.ts`）がラベルに畳む
  （`taskStore` の購読で、読み込み・同期・取り込みのどこから来ても）。未分類を開いていたら「すべて」へ（`settleTodoView`）。
  `unplannedListIds`（`src/lib/listKind.ts`）の ID は スマートビュー（今日・近日中・期限切れ・すべて）、`getDayPlan`、`getWeekReview`、
  統計、`checkAndNotify`、Edge Function `daily-reminders` の残り件数から除外（そのリストを開けば見える）。いつか・チェックリストの切り替えはリスト見出しの
  `ListKindPicker`、サイドバーのリスト行に種類アイコン。新規ユーザーの初期リストは 未分類 / いつか / 買い物（`initialLists`）。
  クイック追加の `@名前`（`parseQuickAddTitle` の `listName`、`findListByName`）で追加先を指定。`tasks` 以外のリストには日付を付けない。
  DB は `lists.kind`。未適用の DB では push 時に kind なしで送り直す

- **いつか / チェックリストの画面**: To-Do と同じ `TaskList` / `TaskItem`（名前の直し方・Enter で次の行・ドラッグで並べ替えと子にする・右クリックのメニュー（項目はリストの種類に合わせて少ない）・複数選択・キー操作は同じ）。
  リストの種類で変えるのは次だけ:
  - 完了の印（`CompletionCircle` の `shape`）: To-Do は丸、チェックリストは四角、いつかは ☆ / ★
  - 締切・優先度の欄と並び順を出さない（行の日付ボタン、メニューの締切・優先度、`TaskDetail` の欄）。完了で「記録も付ける」を聞かない
  - いつかは行のカレンダーとメニューの「予定する」（`useScheduleWish` → `promoteToPlanned`。未分類へ移してその日の予定に。子だけ予定すると親から外れて 1 件になる）。下の一覧は「かなえたこと」
  - チェックリストは `toggleTask` が `toggleChecklistTree`（`lib/listTree.ts`）になる: 子のある行は子ごと、子がそろったら親もチェック済み。チェックした子は親の下に残す。下の「チェック済み」に「全部戻す」（`uncheckTasks`）「チェック済みを消す」
  - 追加欄の例文（`QuickAdd` の `placeholder`）。カレンダー（月・週・日パネル）と予定 vs ログからは除外
- **記録の分類**: 分類は 1 つ選ぶチップ（`TimeLogTagField`、同じチップで解除、＋で追加すると設定の分類にも保存）。既定の分類
  （`logCategories.defaults`、勉強・課題・就活…）を新規ユーザーに入れ、persist v26 で空の既存ユーザーにも入れる。分類なしで記録したら
  `inferLogCategory`（`src/lib/logCategory.ts`: 元タスクの先頭タグ → 同じタイトルの前回の分類）を `startTimer` / `addTimeLog` /
  `addCompletedTaskWithTime` で補う。タイトル空でも分類だけで開始可（タイトル＝分類名）
- **今日画面から記録**: `QuickLogStarter`（「今日の計画」の見出し下）。「記録する」でタイトル（任意）＋分類、よく使う記録 2 件
  （`frequentLogs`: 直近 30 日の回数順、同数は新しい順）はワンタップで再開。記録中は `FloatingTimer` に任せて隠れる

- **色**（`src/lib/googleColors.ts`）: リスト・習慣・記録の分類はすべて Google カレンダーの 11 色（パレット切り替えは廃止、
  persist v28 で既存のリスト・習慣の色を色相の最も近い色へ、未分類はラベンダー）。タイムラインは、予定・記録・外部予定とも
  薄い塗り＋枠（`.gc-plan`。予定＝リスト色、記録＝分類色、外部予定＝ピーコック）。色は style の `--c` で渡す
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
  時間が過ぎた予定＝`.gc-missed`、記録＝分類色の `.gc-plan`）。照合は小さな文字だけ（✓ 予定どおり / N分ズレ）。未実行を赤くしない、
  「予定外」も付けない。Google 連携は未接続なら 1 行（ボタンや警告を並べない）。凡例は 予定 / 記録 / 終わった予定 の 3 つ
- **記録の色**: `Task.color`（`#RRGGBB`、`tasks.color`）があれば分類の色より優先（`recordHex`）。
  予定と記録で Google の予定を「記録にする」と、その予定の色を写す（`addCompletedTaskWithTime(..., color)`）。Google の予定の色は
  `googleEventHex`（予定の colorId 1〜11 → 画面の 11 色、無ければ Edge Function `google-calendar` の `events` が返す
  `calendarColor`（カレンダー自体の色、旧パレットなので最も近い 11 色へ）、それも無ければピーコック）で `CalendarEvent.color` に解決
- **呼び名**: 画面上は「記録」に統一（ナビ「予定と記録」「記録」）。コード上の識別子（activity-log 等）は従来どおり
- **カレンダー**: 下の ToDo ドックは既定で閉じる（右の日パネルと重複するため）。月のマスには記録を分類色の積み上げ帯＋合計時間で
  先頭に表示。月外のマスは日付と中身だけ薄く（マス全体の opacity は罫線ごと消えるのでやめた）
- **習慣**: 達成率は `consistencyForLast7Days`（直近 7 日、今日は達成済みのときだけ数える）に一本化。連続日数は今日まだなら昨日から
- **予定と記録の見せ方**（`src/lib/planVisual.ts` の `planVisualState`）: 予定・記録・外部の Google 予定は同じ薄い塗り＋枠
  （`.gc-plan`。記録は分類色、予定はリスト色、Google はピーコック）で、記録は右・予定は左の列で見分ける。時間が過ぎた予定は完了・未完了とも
  グレー（`.gc-missed`、完了は ✓）。クリック / ドラッグで作成中の枠（`CreateGhost`）も `.gc-plan`。週・日タイムライン、終日の行、月表示（時刻つきは
  「● 15:00 タイトル」、終日は帯）で共通
- **1 文字ショートカット**（`App.tsx`、`src/lib/shortcuts.ts`）: t 今日 / j・n 次 / k・p 前 / d 今日の計画 / w 週 / m 月 / l ログ /
  c 追加 / / 検索 / ? 一覧（`ShortcutsHelp`）。入力中・修飾キー・ダイアログ表示中は無視。日付移動は `dispatchNav` のイベントを
  各画面が `useNavShortcut` で受ける（今日の計画・カレンダー・ログ・予定 vs ログ・習慣）

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

ファイルの分け方: `taskStore.ts` は作成・保存の設定（persist）と公開する名前の再エクスポートだけ。
操作は `src/store/slices/*.ts`（sections / taskTree / tasks / lists / habits / timeLogs / google / settings / ui / data）、
⌘Z の履歴は `undo.ts`（各 slice に `pushUndo` を渡す）、型は `storeTypes.ts`、定数は `storeConstants.ts`、
保存データの移行は `migrate.ts`、i18n を使う初期値は `storeDefaults.ts`。
純粋な関数（localStorage・i18n を読まないので単体テストできる）は `taskHelpers.ts`・`taskRecurrence.ts`（繰り返しの次回）・
`habitRecord.ts`（習慣の達成と記録化）。画面からは今までどおり `../store/taskStore` だけを import する

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
- `calendarEvents`, `googleConnected`, `googleAccessToken`
- `activeTimer`, `habits`（`addHabit` / `updateHabit` / `deleteHabit` /
  `archiveHabit` / `restoreHabit` / `toggleHabitDate`）

### `SmartView`

`all` | `today` | `upcoming` | `overdue` | `calendar` | `plan-vs-actual` |
`activity-log` | `stats` | `habits` | `completed` | `archived` | `deleted` | `settings`（旧
`week-calendar` は v12 マイグレーションで `calendar` + `calendarMode: week`
に統合）。`archived` / `deleted` は `TaskBinView`（アーカイブ済み / ゴミ箱）。`completed` は `CompletedTasksView`（完了済み）

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
  あり）を未完了→完了にすると、即時トグルではなく「完了を記録」モーダルを開く。開始・終了時刻は予定の時刻で埋まっており、ずれたらピッカーで調整し、メモ（任意）付きで保存すると、タイムログ（`kind: 'log'`）を作成してから元タスクを完了にする
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
- **タスクの種類**: `Task` は `kind`（`'todo'` / `'event'` / `'log'` / `'sleep'`）で分けた型（`TodoTask` / `EventTask` / `LogTask` / `SleepTask`。`src/types/task.ts`）。判定は `isTodoTask` / `isEventTask` / `isLogTask`（睡眠も含む記録）/ `isSleepTask`。`dueDate` は To-Do では期限日、記録・睡眠では開始日、予定では使わない（null）。サーバーの列と前の版のバックアップでは `is_time_log` / `isTimeLog`・`is_sleep` / `isSleep`・`is_event` / `isEvent`（`014`）の印で持ち、読み書きの所（`supabaseData.ts`・`backupFormat.ts`）で `kind` と相互に直す（バックアップの書き出しは `kind` と印の両方）。保存データは永続化 v38 で `kind` に移行
- **予定（`kind: 'event'`）**: 完了の丸の無い、時刻のある予定（バイト・授業）。カレンダーの作成カードで To-Do／予定を選ぶ。完了にできない（`toggleTask` は何もしない）、時間が過ぎたらグレー（Google の予定と同じ）。To-Do の一覧・カレンダー横ドック・今日の計画の To-Do・やり残し・完了数・統計には入れない。今日の「予定 N 時間」と週の振り返りの予定と記録の突き合わせにも、Google の予定と同じく入れない。カレンダー・空き時間の候補（ふさがっている時間）・予定の前の通知は To-Do の予定と同じ。To-Do の置き場には戻せない（日時の無い予定はどこにも出ないため）。予定カードでは「記録にする」（始まった予定）と「記録を開始」。締切・繰り返し・優先度・サブタスクは持たない（予定にすると外す）
- **タイムログ**: `kind: 'log'`（睡眠は `'sleep'`）。`startTimer` / `stopTimer`,
  `addTimeLog`, `addCompletedTaskWithTime`。ストア上は `completed: true`
  のまま。**ToDo
  一覧（`TaskList`）とカレンダー横ドック（`CalendarTaskDock`）、月カレンダー（`CalendarView`）には
  タイムログ行を出さない**（完了済みにも混ぜない）。確認・追加は「ログ」「予定
  vs ログ」や週カレンダーのログ列などで行う。`TaskItem`
  はタイムログ行に取り消し線を付けない（緑の 円チェック）。`importData` は
  `is_time_log` / `isTimeLog` / `is_sleep` / `isSleep` を `kind` に直す。未完了件数・手動 DnD
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
  エイリアス。`timeLogTagPresets` 含む。**import
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
- **取得**（`src/lib/syncPull.ts`）: 前回取得したサーバーの内容（`mirror`、メモリだけ・ログインごと）に、目印より 5 分前より後に変わった行（`updated_at`、`(updated_at, id)` の順に keyset で全部）と消えた行の印（`sync_tombstones`、`008`）を当てて、いまのサーバーの内容を作る（`fetchChangesSince`）。差分では取得に無い行は消えたとはみなさず、印のある行だけ外す。行を先、印を後に取り、同じ差分では印を優先する。目印は取得を始めたときにサーバーに聞いた時刻（`sync_server_now()`、`008`）。端末の時計とずれの見積もりは使わない。全部を取る（`fetchListsTasksHabits`）のは: タブを開いた・ログインした最初の同期、この端末でこの人として初めて、目印が無い、前回の全部の取得からサーバーの時計で 6 時間、送った行が断られた（`stale`）・送信が途中で失敗した、前回の取得から 30 日（印を残す期間、`TOMBSTONE_RETENTION_MS`）、差分で取る範囲の印がサーバーの上限で消えていた（`sync_tombstone_purges.last_deleted_at` が目印より後、`010`。`tombstonesTrimmed`）。サーバーの時刻（`sync_server_now()`）・印の表（`sync_tombstones`）・上限で消した印の表（`sync_tombstone_purges`）が読めないときは、全部の取得や「印は無い」に逃げず、同期の失敗にする。差分で作った内容に、前回同期した手元の行が印も無く無いときは、消さずにその場で全部を取り直す（`missingWithoutTombstone`）。送れた行・消せた行は `mirror` にも入れる（`applyPushToMirror`）
- **push**: 各行に取得した版（`base_updated_at`、取得に無い行は `-infinity`）を付けて upsert し、受け付けた行（`id, updated_at`）を返させる。返らなかった行は断られた行（`stale`）。届いた行はサーバーの時刻に置き換え、断られた行は控えを取得した版にして最大 3 回すぐ取り直す。削除は取得した行を版つき（`id` と `updated_at` の組）で、取得に無い行だけ無条件で消す。列が無い・版が通らないときは送り直さず同期の失敗にする。upsert のあと、`deletes` 指定時はその ID だけを **tasks → habits → sections → lists** の順で削除。
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
| `Sidebar.tsx`                                                                                              | ヘッダ左のアイコンでメニュー（設定・外観へ／アカウント節へ／`VITE_APP_INSTALL_URL` があれば入手リンク）。ナビに設定行は無し。**ナビの内容はビューに依らず一定**: 「To‑Do」行＋カレンダー等の他スマートビュー、**統計**はスクロールナビの下・フッター区切り線の上に単独行。「To‑Do」行は To‑Do 系ビュー（`isTodoNavView`）で選択表示になり、押すと `all`（すべて）へ切替（すでに To‑Do 系なら何もしない）。To‑Do のサブナビ（期限別／リスト／アーカイブ・ゴミ箱）は **lg 以上では `TodoNavPanel`**、**lg 未満では「To‑Do」行直下にインデントして展開**（md〜lg 未満は常設サイドバー側。`useIsDesktop` / `useIsLargeScreen` で排他にし、リスト行の DnD id を二重登録しない）。**md 未満のドロワーは To‑Do のナビだけ**（To‑Do の題名の左の ≡、または To‑Do 画面を右へ払うと出る。画面の左端は OS・ブラウザの「戻る」が先に取るので端に頼らない）。常設サイドバーとドロワーは CSS で出し分けず**片方だけマウント**する（state / ref の共有を避ける）。モバイルドロワーは不透明背景で、下端は `pb-[calc(3.5rem+safe-area)]` で `MobileBottomNav` を避ける。**フッターは通知トグルのみ**（エクスポート／JSON インポート／CSV 取り込みは `SettingsView` の「データ」節へ移動）                                                                                                                                                           |
| `TodoNavPanel.tsx` | To‑Do のサブナビ本体（`TodoNavContent`：「すべて／今日／近日中／期限切れ」→区切り→リスト（小見出しなし・並べ替え／色／改名／削除。**各リスト直下にそのリストのセクション行**をインデント表示し、タップで `selectList`＋`quickAddSectionId`）と「リストを追加」→区切り→「アーカイブ済み／ゴミ箱」）と、lg 以上でサイドバー右に常設する細いパネル（`TodoNavPanel`、`w-52`、見出しは「To‑Do」）。`App.tsx` が `isTodoNavView` && `useIsLargeScreen` のときだけマウント。リスト名の追加／改名は **Enter は `!isComposing` のときだけ確定** |
| `SmartViewRow.tsx` | サイドバー／`TodoNavPanel` 共通のスマートビュー行（`button` ＋アイコン＋`sidebar.views.*` ラベル＋選択スタイル。選択中は `aria-current="page"`） |
| `TaskList.tsx`, `TaskItem.tsx`, `SortableTaskItem.tsx`, `SortableSubtaskItem.tsx`, `NestDragGuide.tsx` | 一覧・ソート・DnD（多段サブタスク・`DnDSubtreeRows` 等。階層変更は水平ドラッグ。右ドラッグ中は `NestDragGuide` でサブ化プレビュー）。`TaskItem` は**タイトルクリックでインライン編集**（修飾キー・一括選択時は従来どおり行操作）。行のその他の領域のクリックで `onRowClick`→詳細。タイトル下には期限テキスト（今日/日付/期限超過）と**メモ（`description`）の最初の非空行を1行だけ truncate 表示**し、期限編集はホバー時の日付アイコン／詳細（`hideDueDatePicker` で日付アイコン非表示可）。ホバーで**キュー（リスト）型 SVG**のリスト移動メニュー（ルートのみ）・**アーカイブ（箱）アイコン**・削除。アーカイブと削除は行のアイコンをワンクリックで実行。**md 未満は日付アイコン／アーカイブ／削除を出さず、⋮ メニューにアーカイブ・削除を畳む**（行の固定アイコンで幅を食うとタイトルが 80px 程度しか残らないため。サブタスク行の ⋮ は md 未満だけ）                                                                                                                                                                                                                                                                                                                                                 |
| `SectionHeaderDnD.tsx`                                                                                     | リスト内セクション見出し：並べ替えハンドルはタイトル右（編集・削除の左）。「セクションなし」と見出し左端を揃える                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `TaskDetail.tsx`                                                                                           | 詳細編集。**常に右からのオーバーレイシート**（`fixed inset-0`＋`max-w-md`、外側クリック / ✕ で閉じる）。分割ペイン（`layout` prop）は廃止済みで、どのビューでも行のクリック／タップで開く。記録（`isLogTask`）は行動ログ UI に切替え、優先度・リスト等は非表示。通常タスクは **期限（日付＋締切時刻 `dueTime`）** と **予定（予定日 `scheduledDate` ＋時間幅 `startTime`〜`endTime`）** を別セクションで編集。ログの日時は **開始／終了それぞれ「日付＋時刻」** を近接配置（Google カレンダー風）。**場所（`location`）** 入力＋「Google マップで開く」リンク（`src/lib/linkify.ts` の `googleMapsUrl`。URL を入れたらそのまま、住所等は Maps 検索）。**メモ（`description`）** は表示／編集トグル式（クリックで `textarea` 編集、blur で表示に戻る）。表示モードでは `linkifySegments` で **URL 部分だけを色付きのクリック可能リンク**としてインライン描画                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
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
| `HabitsView.tsx`                                                                                           | 週の表（`habits/HabitWeekTable`: 行＝習慣、列＝見ている週の 7 日、丸で達成の付け外し、右端は連続か今週の回数）。週は `selectedCalendarDateKey`（カレンダーと同期）を 7 日ずつ動かす。名前を押すと右から詳細（`habits/HabitDetailSheet`、枠は `ui/SideSheet` でタスクの詳細と同じ）: 連続・最長・直近 4 週の達成率・月のカレンダー・編集・アーカイブ・削除。行の右クリック（長押し）でメニュー。追加は「習慣を追加」で展開（名前欄の Enter は IME 未変換時のみ送信、Esc で閉じる）。時間指定は `none` / `fixed` / `range`。集計は `habitStats.ts`、フォームは `habitDraft.ts` |
| `TaskBinView.tsx`                                                                                          | アーカイブ済み / ゴミ箱（`mode="archived" \| "deleted"`）。該当タスクを一覧（親も同じ箱なら親のみ代表表示）し、復元 / 戻す / 完全削除、ゴミ箱は「空にする」。`App.tsx` の `archived` / `deleted` ビューで描画 |
| `SettingsView.tsx`                                                                                         | 外観（テーマ）、アカウント（`AccountMenu`）、**活動ログのタグ候補**（`#settings-time-log-tags`・1行1タグのテキストエリア、`parseTimeLogTagPresetLines` で blur 時に保存）、**データ**（`#settings-data`・エクスポート／JSON インポート（全置換・`confirm.importOverwrite`）／CSV タスク追加（マージ））。`#settings-appearance` / `#settings-account` でメニューからのスクロール先                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `SearchResults.tsx`                                                                                        | 検索                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `AccountMenu.tsx`                                                                                          | ログイン / ログアウト・アカウント削除（設定画面）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `FloatingTimer.tsx`, `UndoToast.tsx`, `MoveToast.tsx`, `MobileBottomNav.tsx`                               | 周辺 UI。md 未満はボトムナビ＋ safe-area 上にフロート。`MobileBottomNav` で主要画面切替（統計は「今日」から開き、そのあいだは「今日」が選ばれる。完了済み・アーカイブ・ゴミ箱は「To‑Do」。タブでビューを切り替えると `onNavigate` でドロワーを閉じる） |

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
`timeLogTags.ts`（`timeLogTagUniverse`・**`buildTimeLogTagUniverse`（プリセット先頭）**・`parseTimeLogTagPresetLines`）,
`TimeLogTagField.tsx`, `useTimelineDrag.ts`（ブロックの `setPointerCapture` 後は
`click` が届かないため、タップで詳細/完了モーダルを開く処理は `onBlockTap` で
`pointerup` 時に行う。タップ誤判定を減らすため、ドラッグ判定は `pointerdown`
からの移動量（6px 超）で行う）, `useTimelineDrop.ts`, `notifications.ts`,
`googleCalendar.ts`, `matchEvents.ts`, `plannedItemUtils.ts`,
`parseQuickAdd.ts`, `taskDepth.ts`（`getIndentTargetId` 含む）, `taskDragIntent.ts`（`isIndentIntent` 等）, `linkify.ts`（`extractUrls` / `linkifySegments` / `googleMapsUrl`）, `id.ts` など。

## データベース（`supabase/migrations/`）

**正本**: `001_chronograma_schema.sql`（`lists` / `list_sections` / `tasks` / `habits` / `user_settings` / `user_extra_time_zones` /
`push_subscriptions` / `google_oauth` / `notion_connection` / `canvas_connection` / `edge_rate_limits`、インデックス、トリガー、関数、RLS）。
SQL Editor で番号順に全部流す（どれも何度流しても同じ形）。変更は番号順の新しいファイルで足し、コミット済みのファイルの SQL は書き換えない。本番への適用は `supabase db push --linked`（先に `--dry-run` で確かめる）。
利用者の表は主キー `(user_id, id)`。`lists` / `list_sections` / `tasks` / `habits` は、トリガー `sync_write_guard`（`004`）で書き込みを確かめる: `base_updated_at`（端末が取得した版）を送った書き込みはサーバーの `updated_at` が同じときだけ通し、`updated_at` をサーバーの時刻にする。アプリ（anon / authenticated）からの版を送らない書き込みは断る（`017`、`app_outdated`）。外部キーの動作で変わった行は通し、`updated_at` をサーバーの時刻にする。同期の取り決めの版の下限は `app_config.min_sync_version`（`017`）で、アプリの `SYNC_PROTOCOL_VERSION`（`lib/syncVersion.ts`）より大きければ送らずに読み込み直しを促す。`user_settings` / `user_extra_time_zones` / `user_active_timer` はトリガー `settings_write_guard`（`007`）で同じように確かめる（行は `user_id` で 1 つ）。消えた行は `sync_tombstones`（`008`、トリガー `record_sync_tombstones` が残す・同じ id が入り直すと消す。端末は select だけ。差分の取得に使う）。印は 1 人 50,000 件まで（`010` のトリガー `trim_sync_tombstones`。超えたら古い印から消し、消した印の一番新しい時刻を `sync_tombstone_purges.last_deleted_at` に残す）、30 日より古い印は pg_cron のジョブ `purge-sync-tombstones` が毎日消す（`010`）。アカウントの削除では Edge Function `account` が `deleteUser` の前に本人の印を消す。差分の目印にするサーバーの時刻は `sync_server_now()`（`008`、`authenticated` だけ）。差分の取得の索引 `(user_id, updated_at)`（`009`）。1 人が持てる行数に上限がある（`006` のトリガー `enforce_row_limit`。`tasks` 200,000・`list_sections` 5,000・`lists` 1,000・`habits` 1,000・`push_subscriptions` 100。超えると `row_limit_exceeded` で断り、同期の表示は「未同期」＋上限の説明）。記録の分類は `tasks.category`（To-Do の `tags` とは別。更新前の端末のため、記録の `tags` にも同じ名前を 1 つ写す。`lib/taskDefaults.ts` の `withLogCategory`）。ラベル表は `user_settings.log_labels`（同期は `lib/labelSync.ts`：初めての端末は両方を合わせる。それ以外は `lib/settingSync.ts` の `settingSyncStep`: 手元は「変えた時刻」と「もとにしたサーバーの版」（localStorage `chronograma-settings-sync-v1:{userId}`）を持ち、手元だけ変えていればその版を `base_updated_at` に付けて送る、サーバーだけ変わっていれば合わせる、両方なら手元の編集時刻をサーバーの時計に直して新しいほう。送ったら返ったサーバーの `updated_at` を手元の時刻と版にする。断られたら取り直して最大 3 回合わせ直す。版を外して送り直すことはしない）。習慣のアーカイブは `habits.archived_at`（`003`、null は使用中）。習慣の日ごとの時間（タイムラインで枠を動かした日だけ）は `habits.time_overrides`（`018`、null は無し。`Habit.timeOverrides`、判定・枠・✓ の記録は `lib/habitTiming.ts` の `habitTimesOn`）。時間バーに並べる他のタイムゾーンと付けた名前は `user_extra_time_zones.zones`（`002`、同期は `lib/extraTimeZones.ts` の `planExtraTimeZoneSync`、ラベル表と同じ合わせ方）。動いているタイマーは `user_active_timer`（`019`、利用者ごとに 1 行、`started_at` が null なら止まっている。同期は `lib/timerSync.ts` の `planActiveTimerSync`、手元の時刻は `activeTimerUpdatedAt`。ラベル表と同じ合わせ方で、両方で変えていたときだけ違う: 止めた側と動いている側なら動いているほう、知らずに別々に始めていたら始めた時刻が後のほう（同じなら中身を並べて大きいほう）で、負けたほうは勝ったほうを始めた時刻までの記録にする。記録を作るのは食い違いに気づいた端末だけ（勝ったほうを送れた後・負けて合わせた後）。止めた端末が記録を作り、ほかの端末はタイマーが消えるだけ）。止め忘れの通知の列 `push_subscriptions.timer_started_at` / `timer_title` は、トリガーがこの行をその人の全部の購読に写す（`019`）。`google_oauth` / `notion_connection` / `canvas_connection` はクライアント向けポリシーなし（Edge Function が
service_role で読み書き）。トークンの列（`google_oauth.refresh_token`・`notion_connection.token`・`canvas_connection.token` / `feed_url`）は `enc:v1:` で始まる AES-GCM の暗号文（`supabase/functions/_shared/secretBox.ts`、鍵は secret `TOKEN_ENCRYPTION_KEY`、追加データは表・列・利用者）。暗号化する前の値は読んだときに書き直す。Web Push の送信は Edge Function `daily-reminders` を pg_cron で 5 分ごとに `x-cron-secret`
付きで呼ぶ（各端末のタイムゾーンで 1 日 1 回、失効購読は削除）。送る時間は前の成功の回から今まで（上限 60 分。`reminder_runs`（`012`、1 行、service_role だけ）の `last_ok_at`。失敗が 1 つでもあった回は進めない。送った通知は購読ごとの `reminder_sent` で外す）。前の回が走っている間（`running_since`、10 分より古ければ取り直す）は次の回は何もしない。回の終わりに最後の回の時刻・数・最後の失敗の時刻を別の update で残す（`021`、`runStatsPatch`。書けなくても目印の外しと `last_ok_at` は止めない）。幅と記録の決め方は `daily-reminders/batch.ts` の `runWindowStart` / `runFinishPatch`。cron の `net.http_post` は `timeout_milliseconds := 60000`、`x-cron-secret` の値は Vault（`vault.decrypted_secrets` の `chronograma_cron_secret`）から読む（手順はルート `README.md` の「通知」）。購読の `endpoint` はブラウザのプッシュサービスの URL だけ（`supabase/functions/_shared/pushEndpoint.ts`）。ブラウザから呼ぶ Edge Function は利用者ごとに呼び出し回数の上限がある（`hit_rate_limit`、`search_path` は空（`013`）、上限の数は `supabase/functions/_shared/rateLimit.ts` の `RATE_LIMITS`。超えると 429）。一覧の短い説明は **`supabase/migrations/README.md`**。
DB のテストは pgTAP の `supabase/tests/*.sql`（RLS: 他人の行・anon、`004` / `007` の書き込みの確かめ、`019` の動いているタイマーと止め忘れの列の写し、`008` / `010` の印と上限、`006` の行数の上限、サーバー専用の表と関数（`006_server_only.test.sql`: トークンの表・`edge_rate_limits`・`reminder_runs` はブラウザから読めず書けない、public の全表で RLS が有効、`hit_rate_limit` はブラウザから呼べず `search_path` が空、`client_errors` は本人の insert だけで `created_at` は決められず新しい 500 件だけ残る））。手元では `supabase start` → `supabase test db`（Docker が要る。本番には向けない）。CI（`.github/workflows/ci.yml`）の `database` は DB だけ起こして migration を流し、pg_cron を有効にしてもう一度全部を流し（何度流しても同じ形・`010` のジョブ）、`supabase test db`。`functions` は全 Edge Function を `deno check --config supabase/functions/deno.json --frozen`（手元でも同じコマンド）。Edge Function の Deno の設定は `supabase/functions/deno.json`（`nodeModulesDir: none`、ルートの `package.json` は読まない）と依存の版の `supabase/functions/deno.lock`。supabase-js は `npm:@supabase/supabase-js@<版>`（ルートの `package.json` と同じ版）、web-push は `npm:web-push@3.6.7`。
ルート `README.md` の Supabase 節は本節と `migrations/README.md` と同期させる。

### 端末のエラー（`client_errors`、`011`・種類は `020`）

ログイン中の端末が `src/lib/errorReport.ts` の `reportError(kind, error, extra?)` で insert する。送るもの: `ErrorBoundary` の `componentDidCatch`（`render`）、window の `error` / `unhandledrejection`（`main.tsx` の `installGlobalErrorReporting`、1 回だけ付ける）、同期の失敗（`reportSyncError`。取得・送信の失敗、断られた行、取り直しても断られ続けた行、設定の同期。回線の失敗とオフラインは送らない）、部品の読み込みの失敗（`chunk`）、`reportFailure(kind, stage, error, extra?)` で送る黙って続けていた失敗（回線の失敗は送らない。`extra.stage` が段階）: `storage`（本体の保存 `save`・保存データが読めない `load`・壊れた行を外した `load-rows` / `other-tab-rows`・自動バックアップ `auto-backup`）、`integration`（`canvas` / `canvas:complete` / `notion` / `notion:advance`・Google の設定の誤り `google`）、`push`（`subscribe` / `save` / `delete` / `detach:delete` / `detach`）。前回同期の控えの保存の失敗は `sync` の `baseline`。ログインしていない間・オフラインの間は端末（localStorage `chronograma-pending-errors-v1`）に新しい 10 件までためて、ログインしたとき・回線が戻ったときに 1 回でまとめて送る（起きた時刻は `extra.occurred_at`）。同じエラー（種類・メッセージ・スタックの先頭の行）は 10 分に 1 回、1 時間に 20 件まで、送信に失敗したら再送せず 5 分止める。場所はパスと `?view=` だけ、トークン・JWT・メールアドレスは伏せる。版 `app_version` はビルド時の `import.meta.env.VITE_APP_VERSION`（`vite.config.ts`。package.json の版 + Vercel のコミット）。表は端末から読めない。運用で見る SQL は `supabase/metrics/health.sql`（直近 24 時間の種類・段階・版ごとの数、通知の最後の成功と最後の回の数（`reminder_runs`、`021`）、cron のジョブと失敗、pg_net の応答）。SQL Editor で見る:

```sql
select created_at, kind, message, url, app_version, extra, left(stack, 400) as stack
from public.client_errors
where created_at > now() - interval '7 days'
order by created_at desc
limit 100;

-- 多いものから
select kind, message, count(*) as n, count(distinct user_id) as users, max(created_at) as last
from public.client_errors
where created_at > now() - interval '7 days'
group by kind, message
order by n desc
limit 50;
```

## 環境変数（`.env.example`）

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase
- `VITE_GOOGLE_CLIENT_ID` — 任意。Google Calendar 連携
- `VITE_VAPID_PUBLIC_KEY` — 任意。Web Push（`src/lib/webPush.ts`）。未設定・未ログイン・SW 無し（開発サーバー）
  では、タブを開いている間だけのローカル通知（`dailyReminders.ts`）にフォールバック。購読が有効な端末ではローカル通知を出さない

## npm scripts

- `dev` — Vite 開発サーバー
- `build` — `tsc -b` && `vite build`
- `lint` — ESLint（CI で必須）
- `format` / `format:check` — Prettier（設定は `.prettierrc`、対象外は `.prettierignore`）
- `preview` — プレビュー

## 実装時の注意

- 同期は **項目ごとの三方向マージ**（前回同期の項目ハッシュと比べ、片方だけが変えた項目はその側。両方が変えた項目は手元の時刻をサーバーの時計に直して新しい方）。送信は取得した版つきで、他の端末が先に変えていればサーバーが断り、取り直して合わせる
- Google Calendar: **Edge Function** `google-calendar`（authorization code を `exchange` で refresh token に交換し `google_oauth` 表に保存、サーバー側で access_token リフレッシュ）。Web は `VITE_GOOGLE_CLIENT_ID` で **直接 Google OAuth**（`linkIdentity` は使わない。Supabase の `provider_refresh_token` は PKCE で取れないため）。`signIn` → Google 同意 → コールバック `?code=` → `exchange` → `status` / `events`。invoke アクション: `exchange` / `store` / `status` / `events` / `disconnect`。`events` は `timeZone`（IANA）を受け取り `Intl` で HH:mm を算出。Web は取得後に `start` / `end` ISO からローカル TZ で `date` / `startTime` / `endTime` を再正規化（`normalizeCalendarEventTimes`）。Google Cloud の **Authorized redirect URIs** にアプリオリジン（`http://localhost:5173` 等）が必要。Supabase secrets: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`。`googleConnected` は localStorage に永続化せず `status` で同期。`calendarEvents` はクライアントのみ。ログアウトで `disconnect` + リセット
- 未分類（`__inbox__`）は削除不可（リスト DnD
  では並べ替え無効）。サイドバーでは未分類行の左端（色→名前）を基準に他リストも揃え、並べ替えハンドルは名前の右・削除の左
- README
  と古いドキュメント間のマイグレーション説明の齟齬に注意（**スキーマの正本は
  `supabase/migrations/` の番号順のファイル**。短い説明は
  `supabase/migrations/README.md`。ルート `README.md` と本ファイルの DB
  節はそれと同期させる）
