# Chronograma — ファイルの地図と保存・同期・DB・運用

アプリ名は **Chronograma**。ローカルの作業ディレクトリ名は `jikanwari` のままの場合がある。

## 既存ドキュメント

| ファイル | 役割 |
| --- | --- |
| [`RULES.md`](./RULES.md) | 挙動の決まり（通知・操作・ラベルと色・タイムゾーン・言葉・表示・同期と保存）。**挙動はここを正とする** |
| [`PRINCIPLES.md`](./PRINCIPLES.md) | UI/UX の原則 |
| [`UI_CONSISTENCY.md`](./UI_CONSISTENCY.md) | 同じ役割の色・見た目・挙動を共有している部品 |
| [`IDEAS.md`](./IDEAS.md) | まだ作業に分けていないアイデアと方向性 |
| [`PUBLISHING.md`](./PUBLISHING.md) | 公開の手順・秘密と環境変数の一覧 |
| ルート `README.md` | プロジェクト概要・起動手順・Supabase と通知の手順 |
| 本ファイル | ファイルの地図と、保存・同期・DB・運用の技術的な事実 |

具体的な作業は GitHub の Issue。挙動は `RULES.md` を正とし、ここには書かない。
更新の決まりは `.cursor/rules/sync-cursor-context.mdc`。

## プロダクト概要

- To-Do・カレンダー・記録・習慣の **React Web SPA**（`src/`）。スマホ・タブレットも同じコードを **PWA** で出す
- 既定の保存先はブラウザの **IndexedDB**（「保存（IndexedDB）」）
- **Supabase**（任意）: ログインはメールのマジックリンク（コード入力も可）か Google（`signInWithOAuth`、implicit で `#access_token` に戻る。カレンダー連携の `?code&state` とは別。カレンダーの権限は求めない）。リスト・セクション・タスク・習慣と設定をクラウド同期する。未設定なら認証は noop 相当で手元だけ

## 技術スタック

| 領域 | 内容 |
| --- | --- |
| ランタイム | React 19, TypeScript |
| ビルド | Vite 8（`vite.config.ts`。rolldown の `codeSplitting` で react / i18n / supabase / dnd-kit / date-fns と言語の文言 `locale-ja` / `locale-en` を別ファイルに。`VITE_APP_VERSION` を埋め込む） |
| スタイル | Tailwind CSS 4（`@tailwindcss/vite`）、`src/index.css` |
| 状態 | Zustand 5 + `persist` |
| DnD | `@dnd-kit/core`・`sortable`・`utilities` |
| 日付 | `date-fns` |
| i18n | `i18next` + `react-i18next`（`src/i18n/config.ts`、`react.useSuspense: false`。文言は `src/locales/ja.ts` / `en.ts`、最初から作る名前は `locales/builtinNames.ts`。言語キー `chronograma-lang`） |
| BaaS | `@supabase/supabase-js`（`loadSupabase()` で遅れて読む。`getSupabase()` は読み込み済みのときだけ返す） |

遅延読み込み: 開いたときだけ要る詳細・メニュー・ポップオーバーは `src/components/lazyOverlays.ts`、「今日の計画」以外の画面は `App.tsx` で、どれも `lib/lazyComponent.ts` の `lazyNamed`（読めなければ `retryFailedLazyLoads` で取り直す）。詳細・メニューは `ui/OverlaySuspense` の中で描く。デプロイ直後の古いファイル名は `lib/chunkLoad.ts`（`isChunkLoadError`・`reloadForStaleChunk`、`vite:preloadError` も）。

### PWA

- `public/manifest.webmanifest`（アイコン `public/icons/`、ショートカット `/?view=planner`・`/?add=1`・`/?start=last`、`share_target` は GET `/?add=1&title=&text=&url=`）、`index.html` の apple-touch-icon・theme-color・`viewport-fit=cover`
- OGP: `index.html` の `og:*` / `twitter:*`。画像 `public/og.png`（1200×630）は `npm run og`（`scripts/og/render.mjs`）。`og:url`・`og:image`・`twitter:image` はビルドで `SITE_URL`、無ければ `VERCEL_PROJECT_PRODUCTION_URL` を前に付けた絶対 URL（`src/lib/ogMeta.ts`、`vite.config.ts` の `ogAbsoluteUrls`）
- `public/sw.js`: 画面はネットワーク優先・失敗時キャッシュ、`/assets/` はキャッシュ優先。別オリジン（Supabase / Google）は触らない。`push` で通知、`notificationclick` で既存ウィンドウへ `open-view` を postMessage（無ければ新しく開く）
- `src/lib/pwa.ts`: SW 登録（本番ビルドのみ）、`beforeinstallprompt` と `promptInstall`、起動 URL（`?record=` / `as` / `launch`・`?add=1`・`?start=last`）を `consumeLaunch` で読んで消す（`boot.tsx`）。`?start=last` は `lib/quickStart.ts`（`useQuickStartLaunch`）、共有の中身は `lib/shareTarget.ts` の `sharedQuickAdd` → `requestQuickAdd(prefill)`
- URL と履歴: `src/lib/urlHistory.ts` の `setupUrlHistory()`（`boot.tsx`）。画面の状態の持ち主はストア（`selectedView`・`selectedListId`・`filterTag`・`filterColor`）で、URL はその写し。形は `/?view=<SmartView>` か `/?list=<リスト id>`（＋`&tag=`・`&color=`）、解釈と組み立ては `src/lib/viewUrl.ts`（前の名前 `activity-log` → `planner`、`plan-vs-actual` → `calendar` を読み替える）。パスは常に `/` なので `vercel.json` の書き換えは不要

## エントリ

- `src/main.tsx`: 保存データを読み終えて（`openDataStore`）から `src/boot.tsx` を読み込む（`lib/startAfterDataLoaded.ts`）
- `src/boot.tsx`: `./i18n/config` を読み、`installGlobalErrorReporting`・`setupUrlHistory`・`consumeLaunch` のあと `AuthProvider`（`src/contexts/AuthContext.tsx`）で `App` を包む
- `src/App.tsx`: レイアウト（ルートは `h-dvh`）、画面の切り替え（`SmartView`、`src/store/storeTypes.ts`）、`AccountSyncLoader` → `AccountSync`（ログインしてから `useSupabaseSync`・Notion・Canvas・Google への送信を読む）、`OverlayHost`（詳細と右クリックメニューの置き場、開閉は `lib/overlays.ts`）、DnD のルート（`hooks/useAppDnd.ts`）、ショートカット（`hooks/useGlobalShortcuts.ts`、表は `lib/shortcuts.ts` の `SHORTCUTS`）

## ファイルの地図

### `src/components/`

| 場所 | 役割 |
| --- | --- |
| `Sidebar.tsx`・`TodoNavPanel.tsx`・`SmartViewRow.tsx`・`MobileBottomNav.tsx` | ナビ（PC のサイドバー・lg 以上の To-Do の細いパネル・スマホの下のタブとドロワー） |
| `TaskList.tsx`・`TaskItem.tsx`・`SortableTaskItem.tsx`・`SortableSubtaskItem.tsx`・`SectionHeaderDnD.tsx`・`NestDragGuide.tsx`・`DndTaskDragShell.tsx`・`DragOverlayTaskRow.tsx` | To-Do の一覧と行・並べ替え |
| `todo/` | 一覧の中身（`TaskListActiveContent`・`TaskListHeader`・子の行・完了の欄・いつかの `SomedayParts` / `DreamBoard`） |
| `TaskDetail.tsx`・`detail/` | タスクの詳細と欄ごとの部品（題名・メモ・場所・繰り返し・見積もり・記録の時刻など） |
| `QuickAdd.tsx`・`QuickAddDetails.tsx`・`QuickAddReading.tsx` | クイック追加と読み取りのチップ |
| `TodayPlannerView.tsx`・`today/` | 今日の計画（見出し・やり残し・To-Do・習慣・期限の日・候補・締め・気分・はじめての案内） |
| `RecordPanel.tsx`・`FloatingTimer.tsx`・`RecordPromptHost.tsx`・`CompleteWithLogModal.tsx`・`LogTimeRow.tsx`・`LogTitleInput.tsx`・`RecentLogChips.tsx`・`TimeLogTagField.tsx`・`UntaggedLogList.tsx`・`TimerDropZone.tsx` | 記録（タイマー・後から記録・予定のあとの確認・ラベルなしの記録） |
| `SleepRow.tsx`・`SleepTimesField.tsx`・`SleepStatsCard.tsx` | 睡眠 |
| `CalendarHubView.tsx`・`CalendarView.tsx`・`WeekCalendarView.tsx`・`CalendarScheduleView.tsx`・`CalendarDayPanel.tsx`・`CalendarTaskDock.tsx`・`CalendarDateNav.tsx`・`CalendarMobileHeader.tsx`・`CalendarInlineTaskAdd.tsx` | カレンダー（月・週・3 日・予定の一覧、選択日パネル、下の To-Do） |
| `calendar/` | カレンダーの部品（`TimeBlock`・週の列と見出し・終日の行・習慣の行・時間割・よく入れる予定・空き時間） |
| `timeline/` | タイムラインのカードとポップオーバー（`EventPopover`・`GoogleEventPopover`・`QuickCreatePopover`・`HabitSlotPopover`・`TimeGutter`・授業の欠席と課題） |
| `HabitsView.tsx`・`habits/`・`HabitContextMenu.tsx` | 習慣（週の表・直近 4 週・詳細・作成と編集・ルーティン） |
| `StatsView.tsx`・`WeekReviewCard.tsx`・`ReviewMonthHeat.tsx`・`ReviewShareDialog.tsx`・`DayInsights.tsx`・`EstimateBiasHint.tsx` | 統計と週のふりかえり |
| `SearchBox.tsx`・`SearchPalette.tsx`・`SearchResults.tsx` | 検索 |
| `CompletedTasksView.tsx`・`TaskBinView.tsx` | 完了済み・アーカイブ済み / ゴミ箱 |
| `SettingsView.tsx`・`settings/`・`DailyRhythmSettings.tsx`・`InstallAppSection.tsx`・`AccountMenu.tsx` | 設定（`settings/SettingsPrimitives.tsx` の部品、データ・連携・記録の書き出し・自動バックアップ・タイムゾーン・フィードバック） |
| `addons/` | 追加機能の画面（`AddonsView`）と機能ごとのページ（期限の日・学校の学期と授業） |
| `labels/` | ラベル（色に付けた名前）の選び方・パレット・ラベルの画面 |
| `ui/` | 共有の部品（`Menu`・`Modal`・`SideSheet`・`ConfirmDialog`・`CompletionCircle`・`DueChip`・`DayRow`・`Segmented`・`Tooltip`・`ErrorBoundary`・`OverlaySuspense` と `*Class.ts` の見た目） |
| `TaskContextMenu.tsx`・`ListContextMenu.tsx`・`TimeSlotMenu.tsx`・`DueDatePopover.tsx`・`DueDateTimeMenu.tsx`・`DateField.tsx`・`DatePickerBody.tsx`・`TimeInput.tsx`・`TimeZonePicker.tsx`・`TaskTimeZoneField.tsx`・`TaskRemindersField.tsx`・`RepeatWeekdays.tsx`・`ListKindPicker.tsx`・`ListSectionHeading.tsx` | メニューと入力の部品 |
| `AccountSync.tsx`・`AccountSyncLoader.tsx`・`SyncIndicator.tsx`・`syncIndicatorLabel.ts`・`MobileSyncNotice.tsx`・`StorageFullBanner.tsx`・`SignedOutNotice.tsx` | 同期・保存の状態 |
| `GoogleConnectLine.tsx`・`GoogleStatusDot.tsx`・`IntegrationReconnectLines.tsx`・`ReconnectLine.tsx`・`CanvasSubmittedToast.tsx` | 連携の状態 |
| `UndoToast.tsx`・`MoveToast.tsx`・`CanvasSubmittedToast.tsx`（どれも `ui/Toast.tsx` の `Toast`、置き場は `ToastStack`）・`ShortcutsHelp.tsx`・`OverlayHost.tsx`・`lazyOverlays.ts`・`icons.tsx`・`PathIcon.tsx` | 画面の周り |

### `src/store/`

| 場所 | 役割 |
| --- | --- |
| `taskStore.ts` | ストアの作成と `persist` の設定、公開する名前の再エクスポート。画面は `../store/taskStore` だけを import する |
| `slices/` | 操作（`tasks`・`taskTree`・`sections`・`lists`・`habits`・`timeLogs`・`eventSeries`・`eventTemplates`・`dayMoods`・`google`・`settings`・`ui`・`data`、型は `sliceTypes.ts`） |
| `undo.ts` | ⌘Z の履歴（各 slice に `pushUndo` を渡す） |
| `storeTypes.ts`・`storeConstants.ts`・`storeDefaults.ts` | 型（`SmartView`・`TaskState` など）・定数（`STORE_VERSION`・`PERSIST_STORAGE_KEY`・`INBOX_LIST_ID`・`TRASH_KEEP_DAYS`）・i18n を使う初期値 |
| `persistKeys.ts` | 値ごとの保存先（`DATA_KEYS` 本体・`VIEW_KEYS` は `chronograma-view-v1`・`TRANSIENT_KEYS` は保存しない） |
| `storedSettings.ts`・`viewState.ts` | 本体の設定の読み方・画面の好みの読み方 |
| `migrate.ts`・`recoverLocal.ts` | 保存データの版の移行・localStorage で動いた回の取り込み |
| `taskHelpers.ts`・`taskRecurrence.ts`・`habitRecord.ts`・`liveHabits.ts`・`schoolOfState.ts` | 純粋な関数（繰り返しの次回・習慣の達成と記録化・ゴミ箱に無い習慣 `selectLiveHabits`・日ごとに出す習慣（ゴミ箱も）`selectHabitsByDay`・今の学校） |

### `src/lib/`（主なまとまり）

| まとまり | 主なファイル |
| --- | --- |
| 保存 | `dataStore.ts`・`persistStorage.ts`・`persistentStorage.ts`・`autoBackup.ts`・`backupFormat.ts`・`importRollback.ts`・`deviceCleanup.ts`・`crashRecovery.ts`・`bootFailure.ts`・`pendingEdits.ts` |
| 同期 | `syncPull.ts`・`syncMerge.ts`・`supabaseData.ts`・`syncWake.ts`・`syncVersion.ts`・`versionSeen.ts`・`settingSync.ts`・`settingMerge.ts`・`settingPlans.ts`・`labelSync.ts`・`labelIds.ts`・`labelPendingAdds.ts`・`timerSync.ts`・`sleepTimerSync.ts`・`dayMood.ts`・`accountBoundary.ts`・`mergeConflictReport.ts`・`tabLeader.ts`・`cloudReady.ts`・`supabase.ts` |
| 設定の表（同期の計画つき） | `timetable.ts`・`schoolTerms.ts`・`absenceCourses.ts`・`addons.ts`・`dues.ts`・`eventTemplates.ts`・`courseLinks.ts`・`extraTimeZones.ts`・`skippedEvents.ts`・`googleSkip.ts` |
| 連携 | Google（`googleCalendar.ts`・`googlePush.ts`・`googlePushQueue.ts`・`googleEvent*.ts`・`googleDeleted.ts`）、Notion（`notion.ts`）、Canvas・Moodle（`canvas.ts`・`canvasIds.ts`・`canvasSubmitted.ts`）、送り待ち（`integrationWrites.ts`・`writeBackQueue.ts`）、つなぎ直し（`integrationReconnect.ts`） |
| 通知 | `notifications.ts`・`localReminders.ts`・`webPush.ts`・`timerEndAlert.ts`・`notificationLaunch.ts`・`notificationCleanup.ts` |
| タスクと時間 | `taskTimeRange.ts`・`taskLifecycle.ts`・`taskDefaults.ts`・`recurrence.ts`・`eventSeries.ts`・`movedPlans.ts`・`carryDays.ts`・`estimate.ts`・`parseQuickAdd.ts`・`quickAddTask.ts`・`listKind.ts`・`listTree.ts`・`foldTaskFolders.ts`・`somedayTier.ts`・`searchTasks.ts` |
| 計画と記録 | `dayPlan.ts`・`plannedItemUtils.ts`・`matchEvents.ts`・`weekReview.ts`・`freeSlots.ts`・`slotFitTodo.ts`・`timerLength.ts`・`timerRecord.ts`・`sleep.ts`・`sleepTimer.ts`・`vagueLog.ts`・`logCategory.ts`・`logCategoryColors.ts`・`recordExport.ts`・`reviewImage.ts` |
| 習慣 | `habitTiming.ts`・`habitSchedule.ts`・`habitStats.ts`・`habitDraft.ts`・`habitPastRules.ts`・`habitSlots.ts`・`habitSuggest.ts`・`routineDrift.ts` |
| タイムライン・DnD | `overlapLayout.ts`・`planVisual.ts`・`timeGrid.ts`・`useTimelineDrag.ts`・`useTimelineDrop.ts`・`dragEnd.ts`・`dndCollision.ts`・`subtaskDnD.ts`・`listDnD.ts`・`taskDepth.ts`・`taskDragIntent.ts`・`appTouchSensor.ts` |
| 色・日付・タイムゾーン | `googleColors.ts`・`colorMath.ts`・`dateKey.ts`・`dateFormat.ts`・`timeZone.ts`・`taskTimeZone.ts`・`wallTime.ts`・`appClock.ts`・`weekStart.ts`・`japaneseHolidays.ts` |
| アプリの周り | `pwa.ts`・`urlHistory.ts`・`viewUrl.ts`・`shortcuts.ts`・`lazyComponent.ts`・`chunkLoad.ts`・`errorReport.ts`・`feedback.ts`・`importTasksCsv.ts`（見本 `fixtures/`）・`textLimits.ts`・`onboarding.ts` |

### そのほかの `src/`

| 場所 | 役割 |
| --- | --- |
| `src/hooks/` | 画面から使う hook（同期 `useSupabaseSync`・連携 `useNotionSync` / `useCanvasSync` / `useGooglePush` / `useGoogleCalendarEvents`・通知 `useReminders`・自動バックアップ `useAutoBackup`・DnD `useAppDnd` / `useTaskListDnd`・ショートカット `useGlobalShortcuts` / `useHotkey`・追加機能 `useAddonOn` / `useSchool`・書きかけ `useDraftField`・浮かせる面を画面に収める `useFitInViewport`（計算は `lib/viewportFit.ts`）など） |
| `src/types/` | `task.ts`（`Task` と `kind` ごとの型）・`list.ts`（`TaskList`・`ListKind`）・`section.ts`・`habit.ts`・`calendarEvent.ts`・`plannedItem.ts`・`sync.ts` |
| `src/contexts/AuthContext.tsx` | ログイン（`AuthProvider`） |
| `src/i18n/`・`src/locales/` | i18n の設定と文言 |
| `src/test/` | テストの準備（`setup.ts`・`setupUnit.ts`・`fakeNow.ts`・`fakeSupabaseDb.ts`・`swHarness.ts`） |

### リポジトリのほか

| 場所 | 役割 |
| --- | --- |
| `supabase/migrations/` | スキーマの正本（番号順、一覧は `README.md`） |
| `supabase/functions/` | Edge Function: `daily-reminders`（Web Push の送信、`schedule.ts`・`batch.ts`・`dues.ts`・`wrapUp.ts`・`payload.ts`）・`google-calendar`・`notion`・`canvas`（Canvas・Moodle、`moodle.ts`・`feedUrl.ts`・`ical.ts`・`body.ts`）・`account`（アカウントの削除）。共有は `_shared/`（`secretBox.ts`・`rateLimit.ts`・`tokenSweep.ts`・`pushEndpoint.ts`・`dayResult.ts`・`habitTiming.ts`・`pinnedFetch.ts`・`cors.ts`・`http.ts`）。Deno の設定は `deno.json`・`deno.lock` |
| `supabase/tests/` | pgTAP の DB テスト |
| `supabase/metrics/` | 運用で見る SQL（`health.sql`・`usage.sql`・`versions.sql`） |
| `scripts/` | `build/startup-size.mjs`（起動時に読む JS の上限）・`lint/unchecked-index.mjs`・`og/render.mjs`（OGP 画像）・`shots/`（画面の撮影、`README.md`） |
| `e2e/` | Playwright（`*.spec.ts`、文言は `i18n.ts` の `t()`、保存データの用意は `savedData.ts`） |
| `public/` | `sw.js`・`manifest.webmanifest`・`icons/`・`og.png`・`privacy.html`・`terms.html` |
| `.github/workflows/` | `ci.yml`（static・test・test-tz・check・functions・database）・`test-tz.yml` |
| `.githooks/pre-commit` | ステージしたファイルを Prettier で確かめる（`npm install` の `prepare` が `core.hooksPath` に設定） |

## 保存（IndexedDB）

- 本体: IndexedDB の DB `chronograma-data` の `kv`（`src/lib/dataStore.ts`）。Zustand `persist` のキーは `chronograma-storage`（`PERSIST_STORAGE_KEY`）、版は `STORE_VERSION`。本体に入るのは `DATA_KEYS`（`store/persistKeys.ts`）
- 起動時（`main.tsx` の `openDataStore`、ストアと画面を読み込む前）に全部を読んで手元に持ち、ストアの読み込みは同期のまま
- 同じタスクの間の書き込み（本体・前回同期の控え・設定の版・本体の中の `dataOwner`）は 1 つのトランザクション。控え・設定の版を書くときに本体がまだ前のトランザクションで書いている途中なら、本体もいまの値で一緒に書く
- localStorage からの移行: 本体と控え（旧キー `tickdo-storage` も）は初めて開いたときに 1 回だけ移し、読み直して確かめてから localStorage から消す。設定の版（`chronograma-settings-sync-v1:` / `-base-v1:`）も IndexedDB に移す（`meta` の `migratedSettingsFromLocalStorage`）
- 移した後に localStorage で動いた回（IndexedDB を開けなかった）: 次に開けたとき、その回の本体を `chronograma-storage-recovered-local`（`RECOVERED_LOCAL_KEY`）に置き、ストアを作った直後に `store/recoverLocal.ts` の `mergeRecoveredState` で合わせる
  - 行は id ごとに両方を残し、同じ id はその回のほう。行以外は IndexedDB の本体を基にし、その回の値はストアの既定値と違うときだけ使う（`*UpdatedAt` を持つものはその時刻が新しいときだけ、オブジェクトはキーごと、id を持つ配列・文字列の配列は両方を残す）。動いているタイマーは IndexedDB の側
  - 持ち主が片方だけなら null、別の人どうしならその回のほうにして IndexedDB の本体を `chronograma-storage-before-recovery-{時刻}` に残す
  - 置き換える前の控えを `chronograma-storage-recovered-local-baseline:{控えのキー}` に残し、その回で消した行を戻さない（`dropRowsDeletedInRecovered`）
  - 合わせた本体と取り込みの印の削除は同じトランザクション。その回に無い人の控えは消す（`reportFailure` の `storage` / `recovered`）
- IndexedDB か BroadcastChannel が使えない・8 秒で開けない・移せない端末は localStorage のまま（旧キーは `migrateLegacyPersistKey`）。一度開けた端末（localStorage `chronograma-data-in-indexeddb`）で開けなかったときは保存と同期を止める（`dataStoreUnavailable`、`main.tsx`）
- 接続が切れたら（`onclose`・`onversionchange`・書き込みの `InvalidStateError` / `UnknownError`）1 回開き直して書き直し、だめなら `dataStoreLost`。その後の変更とページを離れて書き終えていない分は localStorage `chronograma-data-unsaved` に置き、次に開いたときに IndexedDB の書いた時刻（`meta` の `at:{キー}`）より新しければ書く。読み込み直す前は `reloadWhenSaved`
- 他のタブの書き込みは BroadcastChannel（localStorage のときは storage イベント）で知り、IndexedDB から読み直す
- 版の違う本体（`store/migrate.ts` の `migratePersistedState`）: 古い版は `chronograma-storage-before-migration-{時刻}` に写してから移す。新しい版は移さずに保存を止める（`lib/persistStorage.ts` の `blockPersisting('newer')`）。読めない・移せないときも止め（`unreadable`）、`chronograma-storage-unreadable-{時刻}` に写す。バナーは `StorageFullBanner`（写しの書き出しは `latestStorageCopy`）。写しを残す数は `lib/deviceCleanup.ts`
- バックアップ: 形は `lib/backupFormat.ts`（`BACKUP_SCHEMA_VERSION`）、入れる値は `BACKUP_KEYS`・入れない理由は `BACKUP_EXCLUDED`。自動バックアップは `lib/autoBackup.ts`（IndexedDB `chronograma-backups`）、取り込み前の控えは `lib/importRollback.ts`

## Supabase 同期（`src/hooks/useSupabaseSync.ts`）

- ログイン済みかつ `getSupabase()` があるときだけ。同期は常に 1 本ずつ直列（タブ間は Web Locks）
- 回すとき: 変更の 1.8 秒デバウンス後・フォーカス復帰時・表示中 60 秒ごと（Realtime の通知を購読できている間は 5 分ごと）・他の端末の変更の通知（`lib/syncWake.ts`、`038`。自分が送った行のこだまは除く）
- **通常**（端末に前回同期の控え `chronograma-sync-baseline-v1:{userId}` あり）: 取得（`lib/syncPull.ts` の `pullRemote`）→ `mergeSnapshots`（`lib/syncMerge.ts`）で三方向マージ → 手元に入れる → push（削除はマージで決めた ID だけ）→ 控えを保存
- **この端末で初回**（控え無し）: `fetchListsTasksHabits` → `decideHydrate`（`lib/supabaseData.ts`）
  - リモートが空 → 手元を push
  - リモートが trivial（未分類のみ・タスク・習慣・追加リストなし）かつ手元にデータ → `push_local`
  - それ以外 → リモートで上書き（選択リストが消えていれば未分類へ）
- **取得**（`lib/syncPull.ts`）
  - 前回取得したサーバーの内容（`mirror`）を目印・全部を取った時刻と一緒に `chronograma-sync-mirror-v1:{userId}` に残し、アプリの版（`SYNC_PROTOCOL_VERSION` と `VITE_APP_VERSION`）と持ち主が同じときだけ使う（`savePullState` / `loadPullState`。ログアウト・アカウントの削除・容量不足で消す）
  - 差分: 目印より 5 分前より後に変わった行（`updated_at`、`(updated_at, id)` の keyset）と消えた行の印（`sync_tombstones`、`008`）を当てる（`fetchChangesSince`）。取得に無いだけの行は消えたとみなさない。同じ差分では印を優先。表ごとに 1,000 行を超えたらページに分ける
  - 目印はサーバーの時刻（`sync_server_now()`、`008`）。端末の時計は使わない
  - ふだんの 1 回は `sync_changes_since(p_since, p_mood_since, p_limit)`（`035`）の 1 往復（`fetchSyncRound`）: 時刻・差分・印・上限で消した印・版の下限・設定の表ごとの `updated_at`・1 日の気分の差分・`has_rows`。関数が無い DB（`PGRST202`）では 1 つずつ取る
  - 全部を取る（`fetchListsTasksHabits`）とき: 残した内容が無い・この端末でこの人として初めて・目印が無い・`has_rows` が偽・前回の全部の取得から 6 時間（`FULL_FETCH_INTERVAL_MS`）・送った行が断られた（`stale`）か送信が途中で失敗した・前回の取得から 30 日（`TOMBSTONE_RETENTION_MS`）・印が上限で消えていた（`sync_tombstone_purges.last_deleted_at` が目印より後、`010`、`tombstonesTrimmed`）
  - サーバーの時刻・印の表・上限で消した印の表が読めないときは同期の失敗にする。差分で作った内容に、前回同期した手元の行が印も無く無いときは全部を取り直す（`missingWithoutTombstone`）。送れた行・消せた行は `mirror` にも入れる（`applyPushToMirror`）
- **push**（`pushListsTasksHabits`）
  - 各行に取得した版（`base_updated_at`、取得に無い行は `-infinity`）を付けて upsert し、受け付けた行（`id, updated_at`）を返させる。返らなかった行は断られた行（`stale`）で、控えを取得した版にして最大 3 回すぐ取り直す
  - upsert は lists → list_sections → tasks → habits、削除は tasks → habits → list_sections → lists。削除は取得した行を版つき（`id` と `updated_at` の組）で、取得に無い行だけ無条件。`deletes` 未指定（初回の `push_local`）はローカルにない ID を消す
  - 列が無い・版が通らないときは送り直さず同期の失敗にする
- **大量の削除**（`isMassDelete`、`syncMerge.ts`）: 確かめる前に自動バックアップを取り、`askConfirm`。消さないと答えたら `mergeWithoutBaseline`
- **読めない行**（`normalizeStoredRows`）を外したときは持ち主の前回同期の控えを消す（次は控えなしで合わせ、外した行はサーバーから戻る）
- **アカウントの境目**（`lib/accountBoundary.ts`）: ログアウト・別の人に替わった・ログインする前のデータを入れないときは、手元を消す前に自動バックアップ（`beforeSignOut` / `beforeSignIn`、`backupNow` は取れたかを返す）を待つ。取れなければ `askConfirm`
- **設定の表**（利用者ごとに 1 行）: 手元は変えた時刻ともとにしたサーバーの版を `chronograma-settings-sync-v1:{userId}` に、合わせた版の中身・ラベルの id を `chronograma-settings-base-v1:{userId}` に持つ（本体と同じトランザクション）。1 回の計画は `lib/settingSync.ts` の `settingSyncStep`、中身ごとの三方向は `lib/settingMerge.ts`、表ごとの計画は `lib/settingPlans.ts`。ログアウトで `clearSettingSyncedAt` が消す
- **Google カレンダー**: Edge Function `google-calendar`。Web は `VITE_GOOGLE_CLIENT_ID` で直接 Google OAuth（`linkIdentity` は使わない。Supabase の `provider_refresh_token` は PKCE で取れないため）。`signIn` → 同意 → コールバック `?code=` → `exchange`（refresh token を `google_oauth` に保存）→ `status` / `events`。アクションは `exchange` / `store` / `status` / `events` / `disconnect`。`events` は `timeZone`（IANA）を受け取り、Web は `start` / `end` からローカルの `date` / `startTime` / `endTime` に直す（`normalizeCalendarEventTimes`）。Google Cloud の Authorized redirect URIs にアプリのオリジンが要る。secrets は `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`。`googleConnected` は `status` で決め、`calendarEvents` は端末だけ

## データベース（`supabase/migrations/`）

### 進め方

- 正本は `001_chronograma_schema.sql`（`lists` / `list_sections` / `tasks` / `habits` / `user_settings` / `user_extra_time_zones` / `push_subscriptions` / `google_oauth` / `notion_connection` / `canvas_connection` / `edge_rate_limits`、索引・トリガー・関数・RLS）と番号順のファイル。一覧と短い説明は `supabase/migrations/README.md`
- どれも何度流しても同じ形。変更は新しい番号のファイルで足し、コミット済みのファイルは書き換えない。本番は `supabase db push --linked`（先に `--dry-run`）
- ルート `README.md` の Supabase 節は本節と `migrations/README.md` に合わせる

### 書き込みの確かめ

- 利用者の表は主キー `(user_id, id)`
- `lists` / `list_sections` / `tasks` / `habits`: トリガー `sync_write_guard`（`004`）。`base_updated_at` を送った書き込みはサーバーの `updated_at` が同じときだけ通し、`updated_at` をサーバーの時刻にする。アプリ（anon / authenticated）からの版を送らない書き込みは断る（`017`、`app_outdated`）。外部キーの動作で変わった行は通す
- 設定の表（`user_settings` / `user_extra_time_zones` / `user_active_timer` / `user_event_templates` / `user_course_links` / `user_timetable` / `user_addons` / `user_sleep_timer` / `user_skipped_events`）: トリガー `settings_write_guard`（`007`）で同じ確かめ
- 同期の版の下限は `app_config.min_sync_version`（`017`、端末からは書けない `029`）。アプリの `SYNC_PROTOCOL_VERSION`（`lib/syncVersion.ts`）より大きければ送らずに読み込み直しを促す
- どの版が同期しているか: `app_versions_seen`（`023`）。`lib/versionSeen.ts` の `noteAppVersion` が `note_app_version(版, 取り決めの版)` を呼ぶ（この端末・この人・この版で 1 日 1 回、localStorage `chronograma-version-seen-v1:{userId}`。失敗は `reportSyncError` の `version-seen`）。版ごとの直近 7 日の人数は `supabase/metrics/versions.sql`
- 消えた行の印 `sync_tombstones`（`008`、トリガー `record_sync_tombstones`、同じ id が入り直すと消す。端末は select だけ）。1 人 50,000 件まで（`010` の `trim_sync_tombstones`、消した印の一番新しい時刻を `sync_tombstone_purges.last_deleted_at`）、30 日より古い印は pg_cron のジョブ `purge-sync-tombstones`。アカウントの削除では Edge Function `account` が `deleteUser` の前に印を消す
- 差分の索引 `(user_id, updated_at)`（`009`）
- 1 人の行数の上限（`006` の `enforce_row_limit`: `tasks` 200,000・`list_sections` 5,000・`lists` 1,000・`habits` 1,000・`push_subscriptions` 100。超えると `row_limit_exceeded`）。行の大きさの上限は `001` の `*_size_check`（入力欄の長さは `src/lib/textLimits.ts`）
- ブラウザから呼ぶ Edge Function の回数の上限は `hit_rate_limit`（`search_path` は空、`013`）、数は `_shared/rateLimit.ts` の `RATE_LIMITS`（超えると 429）

### `tasks` の列

- 種類: 端末は `Task.kind`（`'todo'` / `'event'` / `'log'` / `'sleep'`、`src/types/task.ts`）。サーバーと前の版のバックアップは印 `is_time_log`・`is_sleep`・`is_event`（`014`）で持ち、`supabaseData.ts`・`backupFormat.ts` で相互に直す（書き出しは `kind` と印の両方）
- ラベル: `tasks.category`（記録のラベル名。前の版の端末のため記録の `tags` にも同じ名前を 1 つ写す、`lib/taskDefaults.ts` の `withLogCategory`）・`tasks.color`・`tasks.label_id`（`033`、端末は `Task.labelId`）。この版は `label_id_sent` を付けて送り、付けない書き込みが `category` / `color` を変えるとトリガー `tasks_label_id_guard` が `label_id` を外す
- そのほか: `estimate_minutes`（`015`）・`source_task_id`（`016`、▶ で始めた記録の元）・`event_series`（`027`、毎週の予定の印 `{ id, weekdays, until, skipHolidays }`。端末は `series`）・`moved_plans`（`032`、`[{ date, startTime, endTime, to }]`、`lib/movedPlans.ts`）・`someday_tier`（`034`、`'dream'` か null、`lib/somedayTier.ts`）・`carried_days`（`037`、`lib/carryDays.ts`）・`dream_id`（`040`、夢の一歩から作った To-Do の元の夢）・`is_vague`（`051`、「なんとなく」の記録。端末は `vague`、`lib/vagueLog.ts`）
- 項目ごとの合わせ方で、前回同期のときにどの行も持っていなかった `series` / `movedPlans` などは「無い」値として比べる（`syncMerge.ts` の `ABSENT_WHEN_EMPTY`）

### `habits` の列

- `archived_at`（`003`）・`time_overrides`（`018`、日ごとの時間。`Habit.timeOverrides`、`lib/habitTiming.ts` の `habitTimesOn`）・`rest_dates`（`031`、休みの日。`isHabitScheduledOnDate`、同期は `mergeHabitRestDates`・控えは `SyncBaseline.habitRestDates`）・`weekday_times`（`031`、`habitUsualTimesOn`）・`goal_minutes`（`031`、`habitMinutesOn`）・`deleted_at`（`042`、ゴミ箱）・`past_rules`（`047`、前の日の設定。`habitAsOf`・`lib/habitPastRules.ts`）・`kind`（`048`、`habit` / `routine`）・`ended_on`（`050`、やめた日。`isHabitEndedOn`）
- `deleted_at`・`past_rules`・`kind`・`ended_on` は `ABSENT_WHEN_EMPTY`。端末は時間指定を `Habit.timeMode`（`none` / `fixed` / `range`）で持つ

### 設定の表

| 表.列 | 中身・同期 |
| --- | --- |
| `user_settings.log_labels` | ラベル表。同期は `lib/labelSync.ts`（初めての端末は両方を合わせる、それ以外は `settingSyncStep`）。取り込みで作ったラベルは `logLabelPendingAdds`、合わせた版のラベルの id は `saveSettingBase` / `labelBaseIds`。ラベルの id（`033`、`lib/labelIds.ts`）: id の無いラベルは `legacyLabelId`（`md5('chronograma-label:' \|\| 名前)` の uuid）、名前を変えたラベルは `logLabelIds`（名前 → id）。同期で `fillLabelIds`（手元の行の id の付け忘れ）・`resolveIncomingLabels`（取得した行を id から今の名前・色で読む） |
| `user_extra_time_zones.zones` | 他のタイムゾーン（`002`、`lib/extraTimeZones.ts` の `planExtraTimeZoneSync`） |
| `user_event_templates.templates` | よく入れる予定（`022`、`lib/eventTemplates.ts` の `planEventTemplateSync`） |
| `user_course_links.links` | 授業の予定の名前と LMS の科目のつながり（`024`、`lib/courseLinks.ts` の `planCourseLinkSync`） |
| `user_timetable.timetable` | 時間割（`027`。時限・学期・祝日を除くか・前の版の欠席 `absences` / `absenceLimits`。`lib/timetable.ts` の `planTimetableSync`。一度も変えていない既定の値は送らない） |
| `user_addons.addons` | 追加機能（`041`）: `{ enabled, dues, googleSkip, absenceCourses, school, googleEventColors }`。`googleEventColors` は Google の予定にアプリで付けた色 `{ "e:<予定 ID>" / "s:<繰り返し ID>": { hex, title } }`（`lib/googleEventColors.ts`。手元はストアの `googleEventColors` で、送る・届くときに `addonsWithEventColors`・`splitEventColors`）。`dues` は `[{ id, title, date, repeat: none / monthly / yearly, notifyDays }]`（`lib/dues.ts`）、`school` は学期と授業 `{ terms: [{ id, name, termStart, termEnd, absences, absenceLimits, courses, hidden }] }`（`lib/schoolTerms.ts`。null なら時間割と前の版の `absenceCourses` から 1 つめの学期 `LEGACY_TERM_ID` を作って見せる `schoolOf`、欠席の数は `courseAttendance`）。判定は `lib/addons.ts` の `isAddonOn`・画面は `useAddonOn`、同期は `planAddonsSync`（知らない項目は残して送る） |
| `user_active_timer` | 動いているタイマー（`019`、`started_at` が null なら止まっている。`ends_at` は「あと何分」の終わり `028`、前の版のアプリが替えたらトリガー `user_active_timer_clear_ends_at` が null に。`vague_for` は「なんとなく」にしたタイマーの始めた時刻 `051`、`started_at` と同じときだけ「なんとなく」）。同期は `lib/timerSync.ts` の `planActiveTimerSync`、手元の時刻は `activeTimerUpdatedAt` |
| `user_sleep_timer` | 睡眠のタイマー（`043`、`started_at` が null なら寝ていない。`lib/sleepTimerSync.ts`） |
| `user_skipped_events.events` | やらなかった予定（`045`、`lib/skippedEvents.ts` の `mergeSkipped`） |
| `day_moods` | 1 日の気分とひとこと（`025`、主キー `(user_id, day)`、`mood` は 1〜5 か null、行は消さない。トリガー `day_mood_write_guard`。同期は `lib/dayMood.ts` の `runDayMoodSync`、手元は `dayMoods[日付]` の `updatedAt` / `syncedAt`） |

### サーバー専用の表と通知

- `google_oauth` / `notion_connection` / `canvas_connection` はクライアント向けポリシーなし（Edge Function が service_role で読み書き）。`google_oauth.access_token` / `access_token_expires_at`（`039`）はアクセストークンの使い回し
- トークンの列（`google_oauth.refresh_token` / `access_token`・`notion_connection.token`・`canvas_connection.token` / `feed_url`）は `enc:v2:<鍵の名前>:` で始まる AES-GCM の暗号文（`_shared/secretBox.ts`。今の鍵 `TOKEN_ENCRYPTION_KEY`、前の鍵 `TOKEN_ENCRYPTION_PREVIOUS_KEYS` は開くときだけ、鍵の名前は鍵から決まる 8 桁の 16 進、追加データは表・列・利用者。`enc:v1:` は今の鍵・前の鍵の順に試す）。今の鍵の `enc:v2:` でない値は読んだときに閉じ直し、読まれない行は `daily-reminders` が回の終わりに表ごと 100 行まで閉じ直す（`_shared/tokenSweep.ts`）。平文は閉じ直す処理のほかでは開かない（`PlaintextSecretError`）
- Web Push: pg_cron が 5 分ごとに Edge Function `daily-reminders` を `x-cron-secret` 付きで呼ぶ（`net.http_post` の `timeout_milliseconds := 60000`、秘密は Vault。手順はルート `README.md` の「通知」）。何をいつ出すかは `daily-reminders/schedule.ts`（純粋関数、サーバーとブラウザで共有）
  - 送る時間は前の成功の回から今まで（上限 60 分。`reminder_runs`（`012`、1 行、service_role だけ）の `last_ok_at`、失敗が 1 つでもあった回は進めない）。送った通知は購読ごとの `reminder_sent`。前の回が走っている間（`running_since`、10 分より古ければ取り直す）は何もしない。幅と記録は `daily-reminders/batch.ts` の `runWindowStart` / `runFinishPatch`
  - 回の終わりに時刻・数・最後の失敗を残す（`021`、`runStatsPatch`）。プッシュサービスが 403 を返して消した購読は `last_key_mismatch`（`046`、`runKeyMismatchPatch`）。端末は購読の `applicationServerKey` が今の `VITE_VAPID_PUBLIC_KEY` と違えば購読し直す（`webPush.ts` の `subscribedWithKey`）
  - 購読・タスクは 1000 行ずつキーの順に読む（`batch.ts` の `fetchAllAfter`、offset は使わない）。未完了のタスクは部分索引 `tasks_reminder_open_idx`（`026`）と同じ条件。購読の `endpoint` はプッシュサービスの URL だけ（`_shared/pushEndpoint.ts`）
  - 止め忘れの列 `push_subscriptions.timer_started_at` / `timer_title` と終わり `timer_ends_at` はトリガーがその人の全部の購読に写す（`019` / `028`）。時間の通知を送った終わりは `timer_end_notified_for`
  - 期限の日は `daily-reminders/dues.ts` の `duesToNotify`（印は `reminder_sent` の `dues|日付`）
  - Web Push を購読していない端末は `App` が 30 秒ごとに `checkLocalReminders`（`src/lib/localReminders.ts`）

### テストと CI

- pgTAP は `supabase/tests/*.sql`（RLS・`sync_write_guard` / `settings_write_guard`・印と上限・行数の上限・サーバー専用の表と関数（`006_server_only.test.sql`）・版の記録（`010_app_versions_seen.test.sql`）・列ごとのテスト）。手元では `supabase start` → `supabase test db`（Docker が要る。本番には向けない）
- CI（`.github/workflows/ci.yml`）の `database` は migration を流し、pg_cron を有効にしてもう一度全部を流してから `supabase test db`。`functions` は全 Edge Function を `deno check --config supabase/functions/deno.json --frozen`（手元でも同じ）
- Edge Function の Deno の設定は `supabase/functions/deno.json`（`nodeModulesDir: none`、ルートの `package.json` は読まない）と `deno.lock`。supabase-js は `npm:@supabase/supabase-js@<版>`（ルートの `package.json` と同じ版）、web-push は `npm:web-push@3.6.7`

## 端末のエラー（`client_errors`、`011`・種類は `020`）

- ログイン中の端末が `src/lib/errorReport.ts` の `reportError(kind, error, extra?)` で insert する。表は端末から読めない
- 送るもの: `ErrorBoundary` の `componentDidCatch`（`render`）、window の `error` / `unhandledrejection`（`boot.tsx` の `installGlobalErrorReporting`）、同期の失敗（`reportSyncError`。回線の失敗とオフラインは送らない）、部品の読み込みの失敗（`chunk`）、`reportFailure(kind, stage, error, extra?)`（`extra.stage` が段階）
  - `storage`: `save`・`open`・`recovered`・`load`・`load-rows` / `other-tab-rows`・`auto-backup`・`connection-lost`
  - `integration`: `canvas` / `canvas:complete` / `notion` / `notion:advance`・`google`
  - `push`: `subscribe` / `save` / `delete` / `detach:delete` / `detach`・`rekey:delete` / `rekey:unsubscribe`
  - `sync`: 控えの保存の失敗 `baseline`・差分の取りこぼし `delta-miss`・両方が同じ項目を別の値にした回数 `merge-conflicts`（`extra.conflicts`、localStorage `chronograma-merge-conflicts-v1` にためて 1 日 1 回、`lib/mergeConflictReport.ts`）・`version-seen`
- ログインしていない間・オフラインの間は localStorage `chronograma-pending-errors-v1` に新しい 10 件までため、ログイン・回線が戻ったら 1 回でまとめて送る（起きた時刻は `extra.occurred_at`）。同じエラーは 10 分に 1 回・1 時間に 20 件まで、送信に失敗したら 5 分止める。場所はパスと `?view=` だけ、トークン・JWT・メールアドレスは伏せる
- 版 `app_version` はビルド時の `VITE_APP_VERSION`（`vite.config.ts`。package.json の版 + Vercel のコミット）
- 運用で見る SQL は `supabase/metrics/health.sql`（直近 24 時間の種類・段階・版ごとの数、通知の最後の成功と最後の回（`reminder_runs`）、cron のジョブと失敗、pg_net の応答）。Edge Function の中のエラー（`console.error`）はこの表に入らず、Supabase の Edge Functions → 関数 → Logs で見る

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

## フィードバック（`feedback`、`036`）

- 画面は `components/settings/FeedbackDialog.tsx`（Supabase の設定が無ければ出さない）、送るのは `lib/feedback.ts` の `sendFeedback`（前後の空白を除いて 2000 文字まで、アプリの版・ブラウザを付ける）
- 表は authenticated の本人の行の insert だけ（端末から読めない・変えられない）。`created_at` はサーバーの時刻、1 人 24 時間に 20 件まで（トリガー `limit_feedback`、超えたら `feedback_rate_limited`）、アカウントの削除で消える。返事はアカウントのメールアドレスへ。pgTAP は `016_feedback.test.sql`

```sql
select f.created_at, u.email, f.message, f.app_version, f.user_agent
from public.feedback f
join auth.users u on u.id = f.user_id
order by f.created_at desc
limit 50;
```

## 環境変数（`.env.example`）

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase
- `VITE_GOOGLE_CLIENT_ID` — 任意。Google カレンダー連携
- `VITE_VAPID_PUBLIC_KEY` — 任意。Web Push（`src/lib/webPush.ts`）。秘密鍵は Edge Function の secrets。未設定・未ログイン・SW 無し（開発サーバー）では、タブを開いている間だけの通知（`src/lib/localReminders.ts`）
- ビルド時: `SITE_URL`（任意、OGP の絶対 URL）。Vercel では `VERCEL_PROJECT_PRODUCTION_URL` を使う
- Edge Function の secrets と Vercel の環境変数の一覧は `doc/PUBLISHING.md`

## npm scripts

- `dev` — Vite 開発サーバー
- `build` — `tsc -b && vite build`
- `preview` — ビルドのプレビュー
- `lint` — ESLint（CI で必須）。型を見るルール（`no-floating-promises`・`no-misused-promises`・`await-thenable`）入り: Promise を返す関数を `onClick` などに直接渡さず `() => void fn()` で呼ぶ
- `lint:unchecked-index` — `noUncheckedIndexedAccess` を入れたときの型エラーをファイルごとに数える（テスト以外）。合計が `scripts/lint/unchecked-index.mjs` の `LIMIT` を超えると落ちる（CI でも）。減ったら `LIMIT` を下げ、0 件になったら `tsconfig.app.json` で有効にする
- `format` / `format:check` — Prettier（`.prettierrc`、対象外は `.prettierignore`）
- `test` — Vitest
- `test:tz` — タイムゾーンと時刻を替えて Vitest を 4 回（`TZ`・`FAKE_NOW`）
- `test:e2e` — Playwright（`e2e/`）。`chromium`（PC・英語、全部）と `webkit-ja`（iPhone 14 の WebKit・日本語、`onboarding`・`todo`・`japanese`）
- `shots` — 画面の撮影（`scripts/shots/`）
- `og` — OGP 画像（`scripts/og/render.mjs`）
- 起動時に読む JS の大きさ — `npx vite build --manifest && node scripts/build/startup-size.mjs [--list]`。入口と `boot` から静的に読む JS の gzip の合計が `LIMIT_GZIP_KB` を超えると落ちる（CI でも）
