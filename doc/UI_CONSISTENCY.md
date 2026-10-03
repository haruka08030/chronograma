# Chronograma — 同じ役割の色・見た目・挙動

同じ役割のものは切り出して共有する。前半は「もう共通になっているので必ずこれを使う」もの、後半は「まだ画面ごとに違う」もの。

行番号は書いていない。場所は grep で確かめること。

---

## 共通になっているもの

### 色

| 役割 | 決まり | 場所 |
| --- | --- | --- |
| 今日・選んだ日 | 今日＝藍の塗り、選んだ日＝藍の枠、両方＝塗り＋外側の枠。塗れないところ（曜日の見出し、達成色で塗る習慣の丸、睡眠の目盛り）は今日を藍の文字で示す | `lib/dayMarker.ts`（`dayMarkerClass`・`TODAY_TEXT`・`TODAY_COLUMN`・`SELECTED_COLUMN`） |
| タスク行の「今日」 | 締切の今日はオレンジ（`DUE_TONE_CLASS`）、やる日の今日は藍（`SCHEDULED_TONE_CLASS`）。役割が違うので 2 色のまま | `TaskItem.tsx` |
| 完了チェック | タスク・記録・買い物とも墨色。買い物はチェックリストなので四角、大きさ・文字・入力欄は今日の To-Do と同じ。いつかは ☆ | — |

### 見た目の部品

| 部品 | 決まり | 場所 |
| --- | --- | --- |
| ボタン | `buttonClass({ variant, size })`。variant: primary（墨の塗り）/ secondary（枠）/ ghost（取り消し）/ danger（赤枠）/ link。size: xs〜lg。形は角丸の四角（xs は 6px、ほかは 8px）。ピルはチップ（最近の記録・ラベル・分類）だけ | `components/ui/buttonClass.ts` |
| アイコン | `CheckIcon` などの部品と、パスの定義 `ICON_PATHS` | `components/icons.tsx`・`lib/iconPaths.ts` |
| 切り替えタブ | `Segmented`（`role` tab/radio・`size`・`fullWidth`）。表記は「To-Do」 | `components/ui/Segmented.tsx` |
| モーダル | `Modal`・`ModalTitle`。背景・角（rounded-2xl）・枠・ダーク（zinc-900）・アニメーション・見出しの大きさ・Esc（一番上だけ）・背景で閉じる・フォーカスを戻す・Tab を中に閉じ込める | `components/ui/Modal.tsx` |
| ポップオーバー | 面は `FLOATING_SURFACE`・`POPOVER_PANEL`・`anchoredCardClass`。ダークの背景は zinc-800（下の画面より一段明るく） | `components/ui/surface.ts` |

### 挙動

| 役割 | 決まり | 場所 |
| --- | --- | --- |
| 浮く面の閉じ方 | 外側を押す・Esc は一番上だけ・`data-popover-keep` の要素は内側扱い | `hooks/useDismiss.ts` |
| Esc で閉じる層 | 一番上の層だけ閉じる（タスク詳細・完了＋記録・日付ピッカー・ミニカレンダー・予定カード・ラベルのダイアログ・ショートカット一覧） | `hooks/useEscapeLayer.ts` |
| Enter で確定 | 変換確定の Enter では送らない | `lib/keyboard.ts` `isSubmitEnter` |
| 文字からタスクを足す | 「明日 課題」＝やる日、「明日まで 課題」「by / due」＝締切。時刻つきはタイムラインの予定 | `lib/quickAddTask.ts` `addTaskFromQuickText`・`parseQuickAdd` |
| タイマーの切り替え | どこからでも切り替えられる。前の記録は保存し「○○の記録を保存して切り替えました」と知らせる。行・予定カードは `startTimerForTask` を通す | `lib/timerDrop.ts`・ストアの `startTimer` |
| Google の予定の削除 | 確認を出す | `confirmRemoveGoogleEvent` |

---

## まだ違うところ

### 色

- `TodayPlannerView.tsx` の `META_TONE_CLASS` は `DUE_TONE_CLASS` の複製
- 完了の丸の枠: `TaskItem` は `border-2`、今日画面は `border-[1.5px]`（→ `CompletionCircle`）
- 色選択の選択中の印が 3 種類: 墨色の枠（`TodoNavPanel.tsx`）、黒/白の枠（`settings/CategoryManager.tsx`）、✓（`HabitsView`・`labels/ColorPalette`・`labels/SelectColorDialog`）
- 11 色パレット（`GOOGLE_COLORS`）は色選択では使われず、新しいリストの自動割り当てだけ（`taskStore.ts` の `addList`・移行、`useNotionSync.ts`）。`lib/googleColors.ts` 冒頭のコメント「リスト・習慣は 11 色のまま」は事実と違う
- 日パネルの Google の予定だけ青で固定（`CalendarDayPanel.tsx`）。カレンダー本体は予定ごとの色
- `TimeInput.tsx` の候補のハイライトだけ青
- 習慣の「時間外」: 習慣画面は白地＋色の枠＋△、今日画面は 35% の塗り＋オレンジの文字
- 優先度の色が 2 か所で定義（`lib/priorityColor.ts` と `TaskDetail.tsx` の `PRIORITY_OPTIONS`）
- 藍の直書き: `SleepRow.tsx` の `indigo-400`、`SleepStatsCard.tsx` の `#5c6bc0`、`lib/backupFormat.ts` の既定色 `#6366f1`。`HabitsView.tsx` のマス目 `rgba(99,102,241)` はデータの色なので藍のまま（[NEXT_TASKS](./NEXT_TASKS.md)）
- 使われていない: `lib/tagColors.ts`（`getTagColor` など）

### 見た目の部品

| 部品 | 今の状態 | 切り出し先 |
| --- | --- | --- |
| アイコンボタン | `iconButton` を EventPopover と GoogleEventPopover が別々に定義 | `IconButton` |
| アイコン | EventPopover の文字の ▶、FloatingTimer の停止の四角が `icons.tsx` を使っていない | `components/icons.tsx` |
| ピル選択 | 予定/タスク（`QuickCreatePopover`）は選択中が薄い墨、範囲（`GoogleEventPopover`）は黒塗り、曜日（`HabitsView`）は角丸 | `PillToggle` |
| 月カレンダー | `DueDatePopover` の `monthGridDays` と `CalendarDateNav` の `miniMonthDays` がほぼ同じ。大きさ・見出し・＜＞の位置も違う | `lib/monthGrid.ts`・`MiniMonthCalendar` |
| 日付の移動（＜ 今日 ＞） | 今日画面・週のふりかえり・習慣・カレンダーで 4 通り | `DayNav` |
| 色選択 | 5 か所（`ColorPalette`、`HabitsView` の `ColorPicker`、`SelectColorDialog`、`TodoNavPanel` の `ColorPicker`、`CategoryManager`）で列数・大きさ・選択中の印が違う | `SwatchGrid` |
| 完了の丸 | `TaskItem` と今日画面で大きさ・枠の太さ・優先度の付け方が違う | `CompletionCircle` |
| 見出し・空状態 | 小見出しの文字サイズ・色が 9 通り。開閉する見出しは今日画面がボタン＋＞、`TaskList` が `<details>`。空状態はアイコンあり 3 種・文字だけ 9 種 | `SectionLabel`・`Disclosure`・`EmptyState` |
| 追加の入力欄 | 今日画面（線なし）、買い物（下線）、いつか（点線の枠）、`QuickAdd`（押すと開く・追加/キャンセルボタンつき）、分類・リスト・カレンダー内・サブタスクがそれぞれ別 | `InlineAddInput`（Enter・IME・Esc を内側で扱う） |
| チップ | タスクのタグ（`TaskItem`）、絞り込み（`TaskList`）、タイマーのタグ（`FloatingTimer`）、分類（`TimeLogTagField`）、＋チップ（`TimeLogTagField`・`CategoryManager`）、最近の記録（`RecordPanel`） | `Chip` |

### 入力欄の Enter / Esc / blur

- `isSubmitEnter` を使っていない欄が残っている。`e.key === 'NumpadEnter'` はブラウザが `'Enter'` を返すので効かない
- Esc の意味が 5 通り（クリアして閉じる / クリアして blur / 閉じるだけ / 元に戻して閉じる / 何もしない）。変換中の Esc を区別しているところは無い
- blur で保存する欄（`TaskDetail`・`TaskItem`・`TaskList`・`TodoNavPanel`・`CategoryManager`・`CalendarInlineTaskAdd`・`TimeLogTagField`）に「Esc で取り消した」印が無い。Esc のあとに blur が来ると保存されるおそれ
- 今日画面の追加欄からフォーカスが外れると、下のヒントが消えて行が上にずれる（押そうとした行と違う行を押しうる）
- → `useTextEntry({ onSubmit, onCancel, commitOnBlur })`

### 完了

- 完了時に「記録も付ける」を聞くのは To-Do 画面の `TaskList` だけ。今日画面・買い物・いつか・予定カードは `toggleTask` だけ
- 「記録を足して完了」の取り消し: 予定カードと週カレンダーは 1 回で戻るが、`TaskList` の `submitCompleteWithLog` は 2 回必要。まとめて完了（`bulkComplete`）は件数ぶん必要で、完了済みを選ぶと未完了に戻してしまう
- 習慣: 習慣画面と今日画面は付け外しできるが、週カレンダーの習慣の枠は付けるだけ（`completeHabitAsPlanned`）

### 削除

| 対象 | 今の挙動 |
| --- | --- |
| タスク（各所） | すぐゴミ箱へ＋取り消しトースト |
| 記録 | タスク詳細では確認あり、予定カード・行メニューでは確認なし |
| セクション | 確認＋取り消しバナーの両方 |
| リスト | 確認もバナーも無し（⌘Z だけ） |
| 習慣 | 確認あり、バナー無し |
| 記録の分類 | すぐ消える |
| ゴミ箱から完全削除 | 確認（戻せないので正しい） |
| Google の予定 | 確認（戻せないので正しい） |

→ 戻せるものは「すぐ消す＋取り消しトースト」、戻せないものだけ確認（`deleteWithUndo`）

### 日付・時刻の処理の重複

- 長さの表示: 共通は `lib/timeGrid.ts` `formatDuration`（言語に合わせる）。`SleepStatsCard`・`WeekReviewCard` は自前、`CalendarView` の `formatMinutesShort` は短い形
- HH:MM → 分: `lib/clockTime.ts` `toMinutes`、`lib/timeGrid.ts` `timeToMinutes`、ほか 4 つの `toMin`
- 分 → HH:MM: `useTimelineDrop`・`useTimelineDrag` の `minutesToTime`（同じ）、ほか 6 か所以上
- 0 埋め: `pad2` が 2 つ、`pad`・`p2`・`p`
- 今の HH:MM: `nowRounded`・`nowHm`・`hhmm`・`floorTo5`
- 今日の日付キー: `format(new Date(), 'yyyy-MM-dd')` が 20 か所以上、同じ関数が `dayKeyOf`・`habitDateKey`・`dayKey` ほか
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
- → `addTaskFromQuickText` をほかの入力欄にも広げる
