# Chronograma — 同じ役割なのに色・見た目・挙動が違うところ

2026-10-02 にコードを読んで洗い出した一覧（色 / 見た目の部品 / 挙動の 3 観点）。
原則は **同じ役割のものは切り出して共有する**。直したら行を消すか「済」にする。

行番号は調べた時点のもの。直す前に grep で場所を確かめること。

---

## 1. 先に直すもの（使い心地・事故）

| # | 何が違うか | 場所 | 状態 |
| --- | --- | --- | --- |
| A | Google の予定の削除だけ、確認も取り消しも無い（Delete キーでも即消え、Google 側から消える） | `timeline/GoogleEventPopover.tsx` の Delete キー・削除ボタン | 済（確認を出す。`confirmRemoveGoogleEvent` に集約）。Google の予定が無い環境なので画面では未確認 |
| B | 日本語の変換確定の Enter で確定・送信される入力欄がある（主に Safari） | `TaskDetail.tsx`（タイトル・タグ・サブタスク）、`TaskList.tsx`（セクション名）、`TimeInput.tsx` | 済（`lib/keyboard.ts` `isSubmitEnter`）。Safari 実機では未確認。ほかの入力欄も順次これに寄せる |
| C | 同じ「明日 課題」が To-Do 画面では締切、今日画面ではやる日になる。既定のリストも違う | `QuickAdd.tsx` と `TodayPlannerView.tsx` の submit | 済（`lib/quickAddTask.ts` `addTaskFromQuickText`、「まで」「by / due」は `parseQuickAdd`）。画面で確認済み |
| D | タスク詳細に Esc で閉じる操作が無く、`role="dialog"` も無いので開いている間も 1 文字ショートカットが効く。完了＋記録のモーダルも同じ | `TaskDetail.tsx`（モーダル）、`CompleteWithLogModal.tsx` | 済。Esc は `hooks/useEscapeLayer.ts` で一番上の層だけ閉じる（詳細・完了モーダル・日付ピッカー・ミニカレンダー・予定カード 2 種・ラベルのダイアログ・ショートカット一覧）。画面で確認済み |
| E | 記録中に別のタイマーを始めると、ボタンは押せないのにドラッグは黙って切り替える。今日画面・予定カードは `canStartTimerFor` を通らない | `lib/timerDrop.ts`、`TodayPlannerView.tsx`、`timeline/EventPopover.tsx`、`RecordPanel.tsx` | 済（行・予定カードは `startTimerForTask` を通す。切り替えの知らせはストアの `startTimer`）。画面で確認済み |

決定（2026-10-02 ユーザー）:
- **C**: どの入力欄でも「明日 課題」＝やる日、「明日まで 課題」＝締切。時刻つきは今までどおりタイムラインの予定。
- **E**: どこからでも切り替えられる。前の記録は保存し、「○○の記録を保存して切り替えました」と知らせる。

---

## 2. 色

### 「今日」と「選んだ日」の印（4 通り以上ある）
| 場所 | 今日 | 選んだ日 |
| --- | --- | --- |
| `CalendarView.tsx`（月）・`WeekCalendarView.tsx`（日付の数字） | 藍の塗り `bg-date-500` | 藍の枠 `ring-date-400` |
| `WeekCalendarView.tsx` の曜日・今日の列・選んだ列 | 墨色 `accent-*` | 墨色の枠 |
| `DueDatePopover.tsx` | **藍の枠**（逆） | **藍の塗り**（逆） |
| `CalendarDateNav.tsx`（ミニカレンダー） | 藍の塗り | グレーの塗り `bg-zinc-200` |
| `HabitsView.tsx`（週のマス・見出しの帯） | 墨色の枠・文字 | 墨色の枠・帯 |
| `SleepStatsCard.tsx` | 文字の濃さだけ | — |

→ **済（2026-10-02）**: 「今日＝藍の塗り、選んだ日＝藍の枠」に統一し、`lib/dayMarker.ts`（`dayMarkerClass`・`TODAY_TEXT`・`TODAY_COLUMN`・`SELECTED_COLUMN`）に切り出して上の全か所で使う。塗れないところ（曜日の見出し、達成の色で塗る習慣の丸、睡眠の目盛り）は今日を藍の文字で示す。今日かつ選んだ日は塗り＋外側の枠。

### そのほか
- 同じタスク行で「今日」が 2 色: 締切の今日はオレンジ（`TaskItem.tsx` `DUE_TONE_CLASS`）、予定日の今日は藍（`SCHEDULED_TONE_CLASS`）。**このままにする（2026-10-02 決定）**: 締切は焦らせる色、やる日は日付の色で役割が違う。ただし `TodayPlannerView.tsx` の `META_TONE_CLASS` は `DUE_TONE_CLASS` の複製なので共有する
- 完了チェック: **済（2026-10-02）**: タスク・記録・買い物とも墨色。買い物はチェックリストなので四角のまま、大きさ・文字・入力欄は今日の To-Do に合わせた（前は大きかった）。いつかの ☆ はこのまま（気に入っている）。`TaskItem`（`border-2`）と今日画面（`border-[1.5px]`）の枠の太さの違いは 3 の `CompletionCircle` でそろえる
- 色選択の選択中の表し方が 3 種類: 墨色の枠（`TodoNavPanel.tsx`）、黒/白の枠（`settings/CategoryManager.tsx`）、✓（`HabitsView`・`labels/ColorPalette`・`labels/SelectColorDialog`）
- 11 色パレット（`GOOGLE_COLORS`）は色選択では使われず、新しいリストの自動割り当てだけ（`taskStore.ts` の `addList`・移行、`useNotionSync.ts`）。`lib/googleColors.ts` 冒頭のコメント（「リスト・習慣は 11 色のまま」）は古い
- 日パネルの Google の予定だけ青で固定（`CalendarDayPanel.tsx`）。カレンダー本体は予定ごとの色
- `TimeInput.tsx` の候補のハイライトだけ青
- 習慣の「時間外」が画面で違う: 習慣画面は白地＋色の枠＋△、今日画面は 35% の塗り＋オレンジの文字
- 優先度の色が 2 か所で定義（`lib/priorityColor.ts` と `TaskDetail.tsx` の `PRIORITY_OPTIONS`）
- 藍を直書き: `HabitsView.tsx` のマス目 `rgba(99,102,241)`（データの色として残す、[NEXT_TASKS](./NEXT_TASKS.md)）、`SleepRow.tsx` の `indigo-400`、`SleepStatsCard.tsx` の `#5c6bc0`、`lib/backupFormat.ts` の既定色 `#6366f1`
- 使われていない: `lib/tagColors.ts`（`getTagColor` など、外から import されていない）

---

## 3. 見た目の部品（切り出し候補）

| 部品 | 今の状態 | 切り出し先の案 |
| --- | --- | --- |
| ボタン | **済（2026-10-02）**: `components/ui/buttonClass.ts` の `buttonClass({ variant, size })` に統一。形はすべてピル（ユーザー決定）。primary（墨の塗り）/ secondary（枠）/ ghost（取り消し）/ danger（赤枠）/ link、大きさ xs〜lg。ダイアログ・予定カード・タイマー・習慣・設定（`settingsButton` は廃止）・アカウント・一括操作バーなど約 50 か所。残り: アイコンだけのボタン（下の行） | `Button`（primary / secondary / ghost / danger / link、sm / md） |
| アイコンボタン | `iconButton` を EventPopover と GoogleEventPopover が別々に定義 | `IconButton` |
| アイコン SVG | **済（2026-10-02）**: 12 種 63 か所を `components/icons.tsx`（`CheckIcon` など）に、ナビの一覧などが持っていた形は `lib/iconPaths.ts` の `ICON_PATHS` に寄せた。鉛筆は 2 種類あったのを 1 つに。残り: EventPopover の文字の ▶、FloatingTimer の停止の四角 | `components/icons.tsx` |
| 切り替えタブ | `SettingsPrimitives` の `Segmented` は設定画面だけ。月/週（`CalendarHubView`）、予定/記録（`CalendarDayPanel`）、やること/タイムライン（`TodayPlannerView`）は手書きで見た目も違う | `Segmented` を `components/ui/` へ移して使い回す |
| ピル選択 | 予定/タスク（`QuickCreatePopover`）は選択中が薄い墨、範囲（`GoogleEventPopover`）は黒塗り、曜日（`HabitsView`）は角丸 | `PillToggle` |
| モーダル | 中央に出るものが 3 種（`labels/ModalLayer`・`CompleteWithLogModal`・`ShortcutsHelp`）で角・背景・アニメーションが違う | `ModalLayer` を共通の `Modal` に |
| ポップオーバー | 予定カード 3 種が同じ外枠 class と「外を押す・Esc で閉じる」effect を重複。ドロップダウン 7 種で角・影・ダークの背景が違う | `AnchoredCard`・`popoverPanel` 定数・`useDismiss` |
| 月カレンダー | `DueDatePopover` の `monthGridDays` と `CalendarDateNav` の `miniMonthDays` がほぼ同じ。見た目（大きさ・見出し・＜＞の位置）も違う | `lib/monthGrid.ts`・`MiniMonthCalendar` |
| 日付の移動（＜ 今日 ＞） | 今日画面・週のふりかえり・習慣・カレンダーで 4 通り | `DayNav` |
| 色選択 | 5 か所（`ColorPalette`、`HabitsView` の `ColorPicker`、`SelectColorDialog`、`TodoNavPanel` の `ColorPicker`、`CategoryManager`）で列数・大きさ・選択中の印が違う | `SwatchGrid` |
| 完了の丸 | `TaskItem` と今日画面で大きさ・枠の太さ・優先度の付け方が違う | `CompletionCircle`・`CheckIcon` |
| 見出し・空状態 | 小見出しの文字サイズ・色が 9 通り。開閉する見出しは今日画面がボタン＋＞、`TaskList` が `<details>`。空状態はアイコンあり 3 種・文字だけ 9 種 | `SectionLabel`・`Disclosure`・`EmptyState` |
| 追加の入力欄 | 今日画面（線なし）、買い物（下線）、いつか（点線の枠）、`QuickAdd`（押すと開く・追加/キャンセルボタンつき）、分類・リスト・カレンダー内・サブタスクがそれぞれ別 | `InlineAddInput`（Enter・IME・Esc を内側で扱う） |
| チップ | タスクのタグ（`TaskItem`）、絞り込みチップ（`TaskList`）、タイマーのタグ（`FloatingTimer`）、分類チップ（`TimeLogTagField`）、＋チップ（`TimeLogTagField`・`CategoryManager`）、最近の記録（`RecordPanel`） | `Chip` |

---

## 4. 挙動と処理の重複

### 入力欄の Enter / Esc / blur
- IME ガードあり＋NumpadEnter: 10 か所。ガードありで Enter だけ: 8 か所。ガード無し: 1-B の 5 か所。`e.key === 'NumpadEnter'` はブラウザが `'Enter'` を返すので実際には効かない
- Esc の意味が 5 通り（クリアして閉じる / クリアして blur / 閉じるだけ / 元に戻して閉じる / 何もしない）。変換中の Esc を区別しているところは無い
- blur で保存する欄（`TaskDetail`・`TaskItem`・`TaskList`・`TodoNavPanel`・`CategoryManager`・`CalendarInlineTaskAdd`・`TimeLogTagField`）に「Esc で取り消した」印が無い。Esc のあとに blur が来ると保存されてしまうおそれ（未確認）
- 今日画面の追加欄からフォーカスが外れると、下のヒントが消えて行が上にずれる（押そうとした行と違う行を押しうる。自動テストで発見）
- → `useTextEntry({ onSubmit, onCancel, commitOnBlur })`

### 完了
- 完了時に「記録も付ける」を聞くのは To-Do 画面の `TaskList` だけ。今日画面・買い物・いつか・予定カードは `toggleTask` だけ
- 「記録を足して完了」の取り消し: 予定カードと週カレンダーは 1 回で戻るが、`TaskList` の `submitCompleteWithLog` は 2 回必要。まとめて完了（`bulkComplete`）は件数ぶん必要で、完了済みを選ぶと未完了に戻してしまう
- 習慣: 習慣画面と今日画面は付け外しできるが、週カレンダーの習慣の枠は付けるだけ（`completeHabitAsPlanned`）

### 削除
| 対象 | 今の挙動 |
| --- | --- |
| タスク（各所） | すぐゴミ箱へ＋取り消しトースト |
| 記録 | タスク詳細では確認あり、予定カード・行メニューでは確認なし（同じものなのに違う） |
| セクション | 確認＋取り消しバナーの両方 |
| リスト | 確認もバナーも無し（⌘Z だけ） |
| 習慣 | 確認あり、バナー無し |
| 記録の分類 | すぐ消える |
| ゴミ箱から完全削除 | 確認（戻せないので正しい） |
| Google の予定 | 1-A |

→ 戻せるものは「すぐ消す＋取り消しトースト」、戻せないものだけ確認、にそろえる（`deleteWithUndo`）

### ポップオーバー・モーダルの閉じ方
- 外を押す・Esc の扱いが部品ごとに違う（Esc が入力中も効くもの・効かないもの、`data-popover-keep` を見るもの・見ないもの、`mousedown` と `pointerdown`、全面の透明ボタン）
- Esc が無い: `ColorLabelPicker`、`TaskItem` の行メニュー、`TodoNavPanel` の色選択、`AccountMenu`
- `ModalLayer` がいちばん整っている（`aria-modal`・Esc・背景クリック・フォーカスを戻す）。フォーカスの閉じ込めはどこにも無い
- → `useDismiss(ref, onClose, { escape, outside, keepSelector })`

### 日付・時刻の処理の重複
- 「1時間30分」: 同じ関数が 5 つ（`RecordPanel`・`TodayPlannerView`・`SleepRow`・`SleepStatsCard`・`WeekReviewCard`）＋日本語固定の `lib/timeGrid.ts` `formatDuration`（英語表示でも日本語）＋短い `CalendarView` `formatMinutesShort`
- HH:MM → 分: `lib/clockTime.ts` `toMinutes`、`lib/timeGrid.ts` `timeToMinutes`、ほか 4 つの `toMin`
- 分 → HH:MM: `useTimelineDrop`・`useTimelineDrag` の `minutesToTime`（同じ）、ほか 6 か所以上
- 0 埋め: `pad2` が 2 つ、`pad`・`p2`・`p`
- 今の HH:MM: `nowRounded`・`nowHm`・`hhmm`・`floorTo5`
- 今日の日付キー: `format(new Date(), 'yyyy-MM-dd')` が 20 か所以上、名前つきの同じ関数が `dayKeyOf`・`habitDateKey`・`dayKey` ほか
- 日付キー → 正午の Date: `parseDateKey`・`dateOfKey`・`parseISO(\`${key}T12:00:00\`)` が約 20 か所
- 日付の表示形式: i18n キー、`isJa ? … : …`、直書きが混在。「月日（曜）」の括弧が半角と全角で混在
- 言語から date-fns の locale を選ぶ式が約 20 か所
- → `lib/clockTime.ts` を広げる、`lib/dateKey.ts`、`useDateFormat()`

### ショートカット
- 仕組みが複数: `App.tsx` の全体リスナー、`lib/shortcuts.ts` のイベント、部品ごとの window リスナー（予定カード 2 種・`TaskList`・`DueDatePopover`・`CalendarDateNav`・`ShortcutsHelp`）
- 「入力中か」の判定が 2 つ（`lib/shortcuts.ts` `isTypingTarget` と `lib/keyboard.ts` `isTextFieldUndoTarget`）＋各所の手書き
- 一覧に載っている `e`・Delete は予定カードの中でしか効かない
- 「ダイアログが開いているか」を DOM の `[role="dialog"]` で見ている
- → `useHotkey(key, handler, { scope, allowInInputs })`

### 入力の解釈（「15時 ES 1時間」「@リスト」）
- 効くのは `QuickAdd` と今日画面だけ。カレンダー内の追加・予定作成カード・サブタスク・いつか・買い物では効かない
- → 1-C で作る共通の追加関数を、ほかの入力欄にも広げる

---

## 進め方
1. 1 の A〜E（このファイルを書いた日に着手）
2. 色: 「今日・選んだ日」の印をそろえる → 完了チェックの色を決める
3. 部品: アイコン → ボタン → 切り替えタブ → モーダル/ポップオーバー → 色選択 → 月カレンダー … の順に 1 種類ずつ置き換え、撮って確かめる
4. 挙動: `useTextEntry`・`useDismiss`・削除の方針・日付処理の共通化
