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
| 締切の色 | 期限切れ＝赤、今日まで＝オレンジ、明日まで＝薄いオレンジ。To-Do の行と今日の計画で同じ | `components/ui/dueTone.ts` `DUE_TONE_CLASS` |
| 落とし先の光り方 | 藍の薄い塗り＋内側の枠 | `lib/taskDrag.ts` `DROP_HIGHLIGHT_CLASS` |
| Google の予定の色 | 予定ごとの色、無ければピーコック。カレンダー本体・日パネルで共通 | `lib/googleColors.ts`（`DEFAULT_GOOGLE_EVENT_HEX`）・`colorVars` |
| 優先度の色 | 高＝赤・中＝オレンジ・低＝青、なし＝グレー。完了の丸・詳細・右クリックメニューで共通 | `lib/priorityColor.ts`（`PRIORITY_RING_CLASS`・`PRIORITY_TEXT_CLASS`） |
| 睡眠の色 | 夜の色 1 つ（ライト #5c6bc0、ダーク #7986cb）。`text-sleep`・`bg-sleep`・`.gc-sleep`。習慣画面の直近 28 日のマス目はデータの色なので藍のまま | `index.css`（`--color-sleep`） |
| 習慣の達成・時間外 | 達成＝習慣の色の塗り＋✓、時間外＝35% の塗り＋✓。場所があれば丸の下にグレーで「時間外」、無いところ（習慣画面の週のマス）はツールチップ | `lib/habitMark.ts` |
| メニュー・候補の行のハイライト | ↑↓ で選んでいる行とホバーは同じ薄いグレー（ダーク zinc-700）。メニューと時刻の候補で共通。今の値は ✓ | `components/ui/surface.ts`（`MENU_ROW_ACTIVE`・`MENU_ROW_HOVER`） |
| ブラウザが描く部品 | ラジオ・チェックボックスは墨（`accent-color`）。ダークのときは `color-scheme: dark` で、ラジオ・選択欄の一覧・スクロールバーも暗い見た目。部品ごとに色を付けない | `src/index.css`（`@layer base`） |
| 完了チェック | タスク・記録・買い物とも墨色。買い物はチェックリストなので四角、大きさ・文字・入力欄は今日の To-Do と同じ。いつかは ☆ | `CompletionCircle` の `shape` |

### 見た目の部品

| 部品 | 決まり | 場所 |
| --- | --- | --- |
| ボタン | `buttonClass({ variant, size })`。variant: primary（墨の塗り）/ secondary（枠）/ ghost（取り消し）/ danger（赤枠）/ link。size: xs〜lg。形は角丸の四角（xs は 6px、ほかは 8px）。ピルはチップ（`chipClass`）だけ | `components/ui/buttonClass.ts` |
| アイコン | `CheckIcon` などの部品と、パスの定義 `ICON_PATHS`。コンポーネントに `<path` を直書きしない。画面ごとに切り替わる path は `PathIcon`。意味を伝えるアイコンは `label` | `components/icons.tsx`・`lib/iconPaths.ts`・`components/PathIcon.tsx` |
| 切り替えタブ | `Segmented`（`role` tab/radio・`size`・`fullWidth`）。表記は「To-Do」 | `components/ui/Segmented.tsx` |
| モーダル | `Modal`・`ModalTitle`。背景・角（rounded-2xl）・枠・ダーク（zinc-900）・アニメーション・見出しの大きさ・Esc（一番上だけ）・背景で閉じる・フォーカスを戻す・Tab を中に閉じ込める・開いたときのフォーカス先（`initialFocus`） | `components/ui/Modal.tsx` |
| 確認 | `askConfirm({ message, confirmLabel, danger, requireText })` → `Promise<boolean>`。`window.confirm` / `window.prompt` は使わない。重い操作は赤いボタンで、開いたときは取消にフォーカス。取り消せないものだけ聞く | `lib/confirmDialog.tsx`・`components/ui/ConfirmDialog.tsx` |
| メニュー | `MenuItem`（アイコン・右端の補足/キー/チェック・赤・中のメニューの ›）・`MenuDivider`・`MenuLabel` | `components/ui/Menu.tsx` |
| 右クリックのメニュー | `ActionMenu`（項目・中のメニュー・検索・↑↓→←Enter Esc・はみ出さない位置）。どの右クリックもこれの上に作る。色を選ぶ中のメニューは `ColorPalette`（`bare`）か `ColorSwatches` を入れる | `components/ui/ActionMenu.tsx` |
| タスクのメニュー | 右クリック・スマホの行の ≡・⌘/ で開く。検索・期限（カレンダー付き）・優先度・リスト/セクションへ移動・完了・詳細・アーカイブ・削除。選択中の行なら選択中のすべてに効く。いつかの行は予定する・かなえた・削除だけ、チェックリストの行はチェック（全部済みならチェックを外す）・削除だけ。`TaskItem` のある所・今日の計画の To-Do 行・月カレンダーの時刻なしのタスクで出る | `components/TaskContextMenu.tsx` |
| ゴミ箱・アーカイブの行のメニュー | 右クリックで行のボタンと同じ操作。ゴミ箱: 復元・完全に削除（確認あり）。アーカイブ: 戻す・削除（ゴミ箱へ） | `components/TaskBinView.tsx` |
| 予定・記録・Google の予定のメニュー | タイムライン（今日の計画・週）と月カレンダーで右クリック。予定: 色・完了/未完了・予定どおり記録・記録を始める・詳細・削除。記録: 色（＝ラベル）・詳細・削除。Google: 色・Google で開く・削除（書き込めない予定は開くだけ） | `components/timeline/EventContextMenu.tsx` |
| リスト・セクションのメニュー | リスト: 名前の変更・色・種類・削除（未分類は出さない。色は丸を押しても選べる）。セクション: 名前の変更・ここにタスクを追加・削除 | `components/ListContextMenu.tsx`・`TaskList.tsx` |
| 予定の色・時刻の判断 | 色は `useTaskColor`（記録は色＝ラベル、予定は色だけ）、「予定どおり記録」「終わった予定」は `planTiming`。予定カードとメニューで同じ | `hooks/useTaskColor.ts`・`lib/planTiming.ts` |
| 色選択 | 丸は 24px・選択中は ✓ でどこでも同じ。列の数は置き場所の幅で決める（広い所は 12 列、ポップオーバーは 6 列）。ラベル編集の「色を選択」は自由な色を作る別の役割なので別の格子 | `components/ui/ColorSwatches.tsx` |
| 追加の入力欄 | `InlineAddInput`。細い枠に ＋ と文字、押すと薄い背景（今日の計画だけ枠の代わりに下線、`underline`）。Enter で追加して続けて書ける、Esc で書いた分を消す。外したときは書いた分を残す（カレンダーの中・サブタスクは足す）。今日・To-Do・買い物・いつか（印は ☆）・カレンダーの中（月のマス・終日行は小さい版）・サブタスク | `components/ui/InlineAddInput.tsx` |
| 入力欄 | `fieldClass({ size, active })`。地なし・細い枠（zinc-200、ダーク zinc-700）・角丸 8px・フォーカスで藍のリング・text-sm。size: md（px-3 py-2、詳細・ダイアログ・連携の設定・ログイン）/ sm（px-2 py-1.5、習慣の時刻・タイマーの終了時刻・設定の行の選択・カレンダーの横のリスト選択・リストの種類・記録の時刻・Google の予定の日時・時間帯）。`disabled` で薄く、`aria-invalid` で赤い枠、ポップオーバーを開いている欄は `active`。`input`・`select`・`textarea` と、欄のふりをするボタン（`DateField`・期限/予定日・時間帯）に使う。その場で名前を書き換える欄・`InlineAddInput`・チップやメニューの形の選択・検索の欄・ラベル名の欄（ラベル編集の行とナビの色ラベルのカード。`labels/labelNameInputClass.ts`）・リスト名の欄（ナビ）・予定作成カードの題とリスト・睡眠の行の時刻には使わない | `components/ui/fieldClass.ts` |
| チップ | `chipClass({ variant, size })`。形はピル。見るだけのもの（To-Do 行のタグ・絞り込み・タイマーのタグ）は `fill`（藍の薄い塗り）、押して選ぶもの（記録のラベル・最近の記録）は `outline`（細い枠、選んだら色の塗り）、足すもの（＋）は `add`（点線の枠） | `components/ui/chipClass.ts` |
| 開閉する見出し | `DisclosureButton`。小さな ＞ が開くと下を向く。色は見出しの役割で `alert`（やり残し＝赤）/ `default`（候補）/ `muted`（完了）。今日の計画と To-Do の「完了」 | `components/ui/Disclosure.tsx` |
| 空状態 | `EmptyState`。線のアイコン＋中央。画面（To-Do・ゴミ箱・検索・いつか・習慣）は `lg`、パネルの中（日パネル・時間未定のタスク）は `sm`。一覧の途中の一言（「この日の予定はなし」・メニューの「見つかりません」）は文字だけ | `components/ui/EmptyState.tsx` |
| アイコンボタン | `iconButtonClass(extra)`。丸・枠なし・乗せたときだけ薄い地。予定カードの右上（詳細・削除・閉じる・Google で開く）とラベル編集の行の削除。行の右端の操作は枠ありの `RowActionButton` | `components/ui/iconButtonClass.ts` |
| ピル選択 | `PillToggle`。形はピル、選択中は墨の塗り（`buttonClass` の primary と同じ）、それ以外は細い枠（`chipClass` の outline と同じ）。`value`/`onChange` は 1 つ選ぶ（radiogroup）、`values`/`onToggle` は複数選ぶ（aria-pressed）。予定カードの「予定 / タスク」・繰り返し予定の範囲・習慣の曜日・繰り返しタスクの曜日 | `components/ui/PillToggle.tsx` |
| 小見出し | `SectionLabel`（`as`・`level`）と `sectionLabelClass(level)`。2 段で、どちらも text-xs・font-medium。`section`（zinc-400）は画面・パネル・カードの中のまとまりの見出し、`field`（zinc-500）はフォームの欄の名前。画面の題・今日の計画の区切りの見出し（太い黒）・カードの題・開閉する見出し・メニューの区切り・リストのセクション名には使わない | `components/ui/SectionLabel.tsx`・`components/ui/sectionLabelClass.ts` |
| 見出し | 画面の題（h1）は `PAGE_TITLE_CLASS`（text-2xl・semibold・墨）。画面の区切り（今日の計画の To-Do・習慣、習慣画面の「この日の習慣」）は `SECTION_HEADING_CLASS`（text-base・太い墨）。カード・設定のまとまりの題（統計・週のふりかえり・睡眠・設定・習慣のフォーム）は `CARD_TITLE_CLASS`（text-sm・太い墨） | `components/ui/headingClass.ts` |
| 画面のスクロール枠 | `PAGE_SCROLL_CLASS`（min-h-0・min-w-0・flex-1・overflow-y-auto）。To-Do・ゴミ箱・カレンダー・検索・統計・習慣・設定。縦に並べる画面は flex-col を足す | `components/ui/layoutClass.ts` |
| 控えめな文字 | 灰色の添え書きは 3 種類。`HINT_TEXT`（text-xs・zinc-600、ダーク zinc-300）は説明・手助け（欄の下の説明・設定の説明・連携の手順・「記録して完了」などの説明文）、`META_TEXT`（text-xs・zinc-500、ダーク zinc-400。HINT より一段薄い）は静かな事実（件数・日時・長さ・行の題の下の 2 行目・題の横の期間）、`SUBTLE_TEXT`（text-sm・zinc-500、ダーク zinc-400）は本文の大きさの添え書き（今日の計画の日付・予定カードの日時・本文の大きさの短い一言）。どれも 12px の文字で 4.5:1 を満たす。余白などは足して組み合わせる。10px のデータのラベル（グラフの軸・時刻の目盛り・月のマス・終日の行）、統計のタイルの数字のラベル、To-Do 行の 2 行目（メモ・締切・セクション）、欄の名前、チップ・ボタン・メニューの中の文字、`EmptyState`、小見出し・見出し、色で状態を伝える文字には使わない | `components/ui/textClass.ts`（連携の設定の「1. 2. 3.」の手順は `STEPS_LIST_CLASS`） |
| 完了の丸 | `CompletionCircle`。20px（サブタスク 16px）・枠 1.5px・優先度の色・押せる範囲 40px | `components/ui/CompletionCircle.tsx` |
| 日付の移動 | `DayNav`（今日 ＜ ＞）。今日を見ているときは「今日」を押せないだけで消さない。T / K / J のヒント | `components/ui/DayNav.tsx` |
| 濃い色の浮く面 | `INVERSE_SURFACE`（元に戻す・移動のトースト・選択中の件数・ヒント） | `components/ui/surface.ts` |
| ポップオーバー | 面は `FLOATING_SURFACE`・`POPOVER_PANEL`・`anchoredCardClass`。ダークの背景は zinc-800（下の画面より一段明るく） | `components/ui/surface.ts` |
| 月のカレンダー（日付を選ぶ） | 月の切り替え・日付・今日/明日/なし。期限のポップオーバー・タスクの右クリックメニュー・カレンダー画面の見出しの日付ジャンプ（`footer={false}`・`month` で見ている月から始める）で共通 | `components/DatePickerBody.tsx` |
| マウスを乗せたときのヒント | アイコンだけのボタンは `aria-label` を、`tip(説明, キー)` を付けたものはその説明＋キーを、0.5 秒後に出す（マウスのある端末だけ）。ボタンに `title` は使わない | `lib/tooltip.ts`・`components/ui/Tooltip.tsx` |
| タスクのまとめて操作 | 完了・削除・アーカイブ・期限・優先度・リスト移動。何件に何をしたかをトーストで出す | `hooks/useBulkTaskActions.ts` |

### 日付・時刻

| 役割 | 決まり | 場所 |
| --- | --- | --- |
| 日付キー | `yyyy-MM-dd` にするのは `toDateKey`、戻すのは `fromDateKey`（正午にして日付がずれないようにする）。date-fns の locale は `dateFnsLocale(i18n.resolvedLanguage)` | `lib/dateKey.ts` |
| 時刻 `HH:MM` | 保存済みの時刻 → 分は `timeToMinutes`（欠けた分は 0）、入力の検証は `toMinutes`（不正なら null）。分 → 時刻は `minutesToTime`（折り返さず 24:00 も書ける）、24 時で折り返すのは `addClockMinutes`。Date の時刻は `clockOf`、0 埋めは `pad2` | `lib/clockTime.ts` |
| 長さの表示 | `formatDuration`（1時間15分 / 1h 15m、言語に合わせる）。月のマスなど狭いところは `formatDurationShort`（3h20 / 45m） | `lib/timeGrid.ts` |
| 日付の表示 | `useDateFormat()`（React の外は `formatDate(date, name)`）。名前: monthDay・monthDayWeekday・monthDayWeekdayLong・shortDate・shortDateWeekday・shortDateWeekdayYear・yearMonth・fullDate・monthDayTime・weekRange。形式は i18n の `dateFormat.*`。日本語の曜日は半角の括弧＋前に空白「10月3日 (土)」、英語は曜日が先「Sat, Oct 3」 | `hooks/useDateFormat.ts`・`lib/dateFormat.ts` |

### 挙動

| 役割 | 決まり | 場所 |
| --- | --- | --- |
| 浮く面の閉じ方 | 外側を押す・Esc は一番上だけ・`data-popover-keep` の要素は内側扱い。返す層を `useHotkey` の scope に使う。外を押したら保存・Esc は取り消しの面（ナビの色ラベルのカード）は `onEscape` | `hooks/useDismiss.ts` |
| Esc で閉じる層 | 一番上の層だけ閉じる（タスク詳細・完了＋記録・日付ピッカー・ミニカレンダー・予定カード・ラベルのダイアログ・ナビの色ラベルのカード・ショートカット一覧）。モーダルは Esc 以外の閉じるキーを `closeKeys` で足す | `hooks/useHotkey.ts` `useEscapeLayer`・`components/ui/Modal.tsx` |
| ショートカット | `useHotkey(キー, 処理, { scope, allowInInputs, enabled })`。scope: `'global'`（層が開いていないときだけ）/ `'always'`（⌘Z・⌘K・⌘N・⌘A）/ 層（`useEscapeLayer`・`useDismiss` の戻り値。その層が一番上のときだけ）。入力中・変換中・部品が先に使ったキーでは動かない。false を返すと次に回す。To-Do 一覧の `e` はカーソルの行の詳細、Delete は削除 | `hooks/useHotkey.ts` |
| キーの書き方 | `'e'`・`'Delete'`・`'mod+Enter'`・`'shift+ArrowDown'`・`'?'`・`'Space'`。修飾キーは書いたものだけ。? / は Shift を見ない | `lib/keyboard.ts` `matchesHotkey` |
| 入力中か・変換中か | 入力中＝テキスト欄・選択・contenteditable（ショートカットも ⌘Z もこれで見る）。`isComposing` または keyCode 229 のキーではショートカット・Esc を動かさない | `lib/keyboard.ts` `isTypingTarget`・`isImeKeyEvent` |
| Enter で確定 | 変換確定の Enter では送らない | `lib/keyboard.ts` `isSubmitEnter` |
| 複数行の入力欄 | `useTextAreaEntry`: Enter で改行、⌘/Ctrl+Enter で確定して欄を離れる、Esc で欄を離れる（書いた分は捨てない・親のダイアログは閉じない）、外したら保存。変換中の Enter / Esc は何もしない。タスク詳細のメモと完了＋記録のメモ | `hooks/useTextEntry.ts` `useTextAreaEntry`・`lib/keyboard.ts` `textAreaKeyAction` |
| 1 行の入力欄 | `useTextEntry`: Enter で確定、Esc で取り消し（親のダイアログは閉じない）、外したら確定。Esc / Enter のあとの blur は無視する | `hooks/useTextEntry.ts` |
| ⌘ の表示 | Mac は ⌘、それ以外は Ctrl。`shortcutLabel(['mod', 'Z'])` | `lib/keyboard.ts` `modKeyLabel`・`shortcutLabel` |
| 削除 | 戻せるもの（タスク・記録・セクション・リスト・習慣・ラベル・Google の予定）は確認なしで消して「元に戻す」トースト。戻せないもの（ゴミ箱から完全に削除・アカウント）だけ `askConfirm` | — |
| 文字からタスクを足す | 「明日 課題」＝やる日、「明日まで 課題」「by / due」＝締切、時刻つき＝タイムラインの予定、「@リスト」＝リスト、「毎日」「毎週金」「毎週月水」「毎週月・水・金」「平日」「隔週」「毎月15日」「毎年」「3日ごと」「every fri」「every mon wed」「every weekday」「every 2 weeks」＝繰り返し（最初の回の日が締切。日付を書かなければ既定のやる日か今日から数えて最初に当たる日。曜日が 2 つ以上なら繰り返しに曜日を持たせる）。上部の追加欄・今日の計画・カレンダーのセル・予定作成カード・サブタスクで同じ。欄ごとに違うのは書かなかったときの既定値だけ（セル＝その日、予定作成カード＝ドラッグした日と時間帯、サブタスク＝親とそのリスト固定で @… は題名に残る）。書いた日付・時刻は既定値より優先。いつか・チェックリストには日付を付けない。足すのと日時を付けるのは 1 回で元に戻る | `lib/quickAddTask.ts` `addTaskFromQuickText`・`parseQuickAdd` |
| To-Do のドラッグ | 運ぶ側は `startTaskDrag`（常に copyMove を許す）、受ける側は `acceptTaskDrag`（運ぶ側の許可に合わせる。To-Do・Google の予定以外では光らない）。画面ごとに `effectAllowed`・`dropEffect` を書かない | `lib/taskDrag.ts` |
| 習慣の達成 | 習慣画面・今日画面・週カレンダーとも、押すと付き、もう一度押すと外す（その日の習慣の記録も外れる） | ストアの `toggleHabitDate` |
| 記録を足して完了 | 完了の丸はどこでも完了の切り替えだけ（時刻つきの予定も記録を足さない）。「記録して完了」は通知の「記録する」から開く。予定カードは「完了」と「予定どおり記録」を別のボタンにする。記録の追加と完了は 1 つの操作で、元に戻すも 1 回 | `hooks/useCompleteWithLog.tsx` |
| タイマーの切り替え | どこからでも切り替えられる。前の記録は保存し「○○の記録を保存して切り替えました」と知らせる。行・予定カードは `startTimerForTask` を通す | `lib/timerDrop.ts`・ストアの `startTimer` |

---

## まだ違うところ

なし
