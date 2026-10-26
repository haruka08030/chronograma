# Chronograma — 同じ役割の色・見た目・挙動

同じ役割のものは切り出して共有する。前半は「もう共通になっているので必ずこれを使う」もの、後半は「まだ画面ごとに違う」もの。

行番号は書いていない。場所は grep で確かめること。

---

## 共通になっているもの

### 色

| 役割 | 決まり | 場所 |
| --- | --- | --- |
| 今日・選んだ日 | 今日＝藍の塗り、選んだ日＝藍の枠、両方＝塗り＋外側の枠。塗れないところ（曜日の見出し、達成色で塗る習慣の丸、睡眠の目盛り）は今日を藍の文字で示す | `lib/dayMarker.ts`（`dayMarkerClass`・`TODAY_TEXT`・`TODAY_COLUMN`・`SELECTED_COLUMN`） |
| タスク行の「今日」 | 締切の今日はオレンジ（`DUE_TONE_CLASS`）、実行日の今日は藍（`SCHEDULED_TONE_CLASS`）。役割が違うので 2 色のまま。過ぎた実行日は灰色（責める色にしない） | `components/ui/dueTone.ts`・`TaskItem.tsx` |
| 締切の色 | 締切切れ＝赤、今日まで＝オレンジ、明日まで（と 2〜3 日後の「あと ◯ 日」）＝薄いオレンジ。判断は `dueToneOf`（タイムラインの点・To-Do の行・今日の計画で同じ）、文字は `dueDateLabel`（「10/8 (木)まで・あと 2 日」「1日遅れ」） | `components/ui/dueTone.ts` `DUE_TONE_CLASS`・`lib/dueTone.ts` `dueToneOf`・`components/ui/dueDateLabel.ts` |
| 落とし先の光り方 | 薄いグレーの塗り＋グレーの内側の枠（`accent`）。月・週の終日行・習慣の段・日パネル | `lib/taskDrag.ts` `DROP_HIGHLIGHT_CLASS` |
| Google の予定の色 | 予定ごとの色、無ければピーコック（`DEFAULT_GOOGLE_EVENT_HEX`）。カレンダー（月・週・スケジュール）・日パネル・今日の計画・予定カード・右クリックメニューで共通 | `lib/googleColors.ts`（`googleEventHex`・`DEFAULT_GOOGLE_EVENT_HEX`） |
| 色の付いた面 | 色は style の `--c` で渡す（`colorVars(hex)`）。style に背景色を直に書かない（lint で止める）。ベタ塗りにせず薄い塗り＋縁: 予定・記録・Google の予定の枠は `gc-plan`、色の丸（リスト・ラベル・習慣・色選択・記録の内訳の棒）は `gc-dot`、行の左の線は `gc-line`、量の濃さのマスは `gc-heat`、終わった予定は `gc-missed`（灰色） | `index.css`（`.gc-*`）・`lib/logCategoryColors.ts` `colorVars` |
| 予定の見せ方 | これから＝`gc-plan`、終わった予定（完了・未完了とも）＝`gc-missed`（完了は ✓）。色はタスク自身の色（＝ラベル）、リストの色は使わない | `lib/planVisual.ts`（`planVisualState`・`planHex`） |
| やらなかった予定 | 開始を過ぎてから消した Google の予定は、薄く・取り消し線（`gc-missed` に重ねる）。タイムラインの枠・終日の行・月のマス・予定一覧・日パネルで同じ | `components/ui/rowStateClass.ts` `SKIPPED_EVENT_CLASS` |
| 優先度の色 | 高＝赤・中＝黄・低＝青。なしは丸に色を付けず、選ぶ場所の文字はグレー。完了の丸・詳細・右クリックメニュー・追加欄の詳細のチップで共通 | `lib/priorityColor.ts`（`PRIORITY_RING_CLASS`・`PRIORITY_TEXT_CLASS`） |
| 睡眠の色 | 夜の色 1 つ（ライト #5c6bc0、ダーク #7986cb）。`text-sleep`・`bg-sleep`・`.gc-sleep` | `index.css`（`--color-sleep`） |
| 習慣の丸 | 線画で、塗るのは達成だけ。まだ＝習慣の色の細い輪（`gc-mark`）、達成＝薄い塗り＋その色の輪＋✓（`gc-mark-done`）、時間外＝その色の点線の輪＋✓（`gc-mark-off`）、過ぎた予定の日でやらなかった＝灰の細い輪（`gc-mark-missed`、習慣画面の週の表だけ）。丸の下にグレーで「時間外」（習慣画面の週のマスは小さく）。時刻はツールチップ。押せる丸は `aria-pressed`、週のマスの読み上げ名は「10月3日 (土) 達成」「10月3日 (土) 達成（時間外 21:00〜21:30）」。今日の計画のまだの丸は To-Do と同じ灰色（`COMPLETION_RING_IDLE`） | `lib/habitMark.ts`・`index.css`（`.gc-mark*`） |
| 色の丸の名前 | ヒント・読み上げは「ラベル名（色名）」、名前の無い色は色名。記録・予定のパレット・To-Do リストの色で同じ。パレットに名前は並べない | `hooks/useLabeledSwatches.ts` |
| メニュー・候補の行のハイライト | ↑↓ で選んでいる行とホバーは同じ薄いグレー（ダーク zinc-700）、押している間も同じ色（`MENU_ROW_PRESS`）。メニューと時刻の候補で共通。今の値は ✓ | `components/ui/surface.ts`（`MENU_ROW_ACTIVE`・`MENU_ROW_HOVER`・`MENU_ROW_PRESS`） |
| 行の状態 | 選んだ行＝藍の薄い塗り（ホバーより優先）、↑↓ のカーソル＝藍の内側の枠、押している間＝薄いグレー、つかんで持ち上げた行＝影と縁（長押しで浮かせた行は少し大きく、動きを減らす設定では影だけ）。To-Do の行・今日の計画の行・カレンダーの行で共通 | `components/ui/rowStateClass.ts`（`ROW_SELECTED_CLASS`・`ROW_CURSOR_CLASS`・`ROW_PRESS_CLASS`・`ROW_LIFTED_CLASS`・`LIFT_CARD_CLASS`） |
| ブラウザが描く部品 | ラジオ・チェックボックスは墨（`accent-color`）。ダークのときは `color-scheme: dark` で、ラジオ・選択欄の一覧・スクロールバーも暗い見た目。部品ごとに色を付けない。キーボードのフォーカスは藍の枠 | `src/index.css`（`@layer base`） |
| 完了チェック | 完了は墨の塗り＋✓。形は `shape`: To-Do は丸、チェックリスト（買い物）は四角、いつかは ☆（かなえたら黄色の ★）。買い物の行も To-Do と同じ `TaskItem` | `components/ui/CompletionCircle.tsx` の `shape` |

### 見た目の部品

| 部品 | 決まり | 場所 |
| --- | --- | --- |
| ボタン | `buttonClass({ variant, size })`。variant: primary（墨の塗り）/ secondary（枠）/ ghost（取り消し）/ danger（赤枠）/ link。size: xs〜lg（lg は 44px）。形は角丸の四角（xs は 6px、ほかは 8px）。ピルはチップ（`chipClass`）と `PillToggle` だけ | `components/ui/buttonClass.ts` |
| アイコン | `CheckIcon` などの部品と、パスの定義 `ICON_PATHS`。コンポーネントに `<path` を直書きしない（lint で止める。グラフの線・ブランドのロゴなど理由のあるものは理由を書いて外す）。画面ごとに切り替わる path は `PathIcon`。意味を伝えるアイコンは `label` | `components/icons.tsx`・`lib/iconPaths.ts`・`components/PathIcon.tsx` |
| 切り替えタブ | `Segmented`（`role` tab/radio・`size`・`fullWidth`）。灰色の溝で選んだものだけ白く浮かせる。画面の表示・設定値の切り替え。表記は「To-Do」 | `components/ui/Segmented.tsx` |
| モーダル | `Modal`・`ModalTitle`。背景の幕・角（rounded-2xl）・面（`FLOATING_SURFACE`、ダーク zinc-800）・アニメーション・見出しの大きさ（text-lg）・Esc（一番上だけ）・背景で閉じる（閉じるだけで下に届けない）・フォーカスを戻す・Tab を中に閉じ込める・開いたときのフォーカス先（`initialFocus`）。`width` は sm / md / lg。検索パレット（⌘K）は上寄り（`placement="top"`）・広め（`width="lg"`） | `components/ui/Modal.tsx` |
| 右から出るシート | `SideSheet`（タスクの詳細・習慣の詳細）。背景を押すか Esc で閉じる（背景の押下は下に届けない）。スマホは全画面で、上に戻るボタン ‹ を固定し、右に `mobileActions`。Tab は中だけ、閉じたら `returnFocus` へ | `components/ui/SideSheet.tsx` |
| 下から出るシートの幕 | `SheetBackdrop`。見せるだけの暗い幕（閉じるのはシートの `useDismiss`）。閉じるときは薄れて消える。`layer` はカードの下 / メニューの下 | `components/ui/SheetBackdrop.tsx` |
| 重ねる面のフォーカス | 開いたら面にフォーカス、Tab / Shift+Tab は面の中だけを巡回、閉じたら（閉じる動きの始まりで）元の場所へ戻す。戻す先が BODY なら `returnFocus`（タスク詳細は開いた行の題名）。`Modal`・`SideSheet`・`ActionMenu`・スマホのドロワー（`role="dialog"`・`aria-modal`） | `hooks/useFocusTrap.ts` |
| 重ねる面の閉じる動き | 閉じるときは 150ms で消える: 背景の幕は `animate-fade-out`、ダイアログ・メニュー・ポップオーバー・予定カードは縮みながら（`animate-pop-out`）、下からのシートは下へ（`animate-sheet-out`）、右からのシートは右へ（`animate-slide-out`）。呼び出し側が外す面は、一番外の要素に `useExitGhost` の ref を付けると写しが動いてから消える（写しは `inert`）。タスク詳細・習慣の詳細・スマホのドロワー・トーストは `usePresence`（`animate-*-out`）。動きを減らす設定ではすぐ消える | `hooks/useExitGhost.ts`・`hooks/usePresence.ts` |
| 確認 | `askConfirm({ message, title, confirmLabel, danger, requireText })` → `Promise<boolean>`。2 つの選び方と取消は `askChoice({ …, secondaryLabel })` → `'confirm' \| 'secondary' \| null`。`window.confirm` / `window.prompt` は使わない。重い操作は赤い枠のボタン（`danger`）で、開いたときは取消にフォーカス（`requireText` があればその欄）。取り消せないものだけ聞く | `lib/confirmDialog.tsx`・`components/ui/ConfirmDialog.tsx` |
| 毎週の予定の範囲 | 消すときに「この予定のみ / これ以降のすべての予定 / すべての予定」を聞く（既定は「この予定のみ」、見た目は確認のダイアログと同じ）。`askSeriesScope(title)`、予定・To-Do をゴミ箱へは `deleteTaskAsking(taskId)` | `lib/seriesScope.tsx`・`components/ui/SeriesScopeDialog.tsx` |
| メニュー | `MenuItem`（アイコン・名前の下の説明 `detail`・右端の補足/キー/チェック・赤 `danger`・中のメニューの ›）・`MenuDivider`・`MenuLabel` | `components/ui/Menu.tsx` |
| 右クリックのメニュー | `ActionMenu`（項目・中のメニュー・検索・↑↓→←Enter Esc・はみ出さない位置、`above` で上に出す）。スマホ（タッチの狭い画面）は下から出すシート: 行は 44px 以上、中のメニューは同じシートの中で切り替え（‹ で戻る）、危ない項目は区切って離す、検索欄は出さない。どの右クリックもこれの上に作る。色を選ぶ中のメニューは `ColorPalette`（`bare`）か `ColorSwatches` を入れる | `components/ui/ActionMenu.tsx` |
| タスクのメニュー | 右クリック・スマホの行の …・⌘/（ContextMenu キー・Shift+F10 も）で開く。時間を決める（時間未定のとき）・今日やる / 明日へ（Shift+T）・記録を始める・実行日・締切（カレンダー付き、日時を指定…）・優先度・リスト/セクションへ移動・ラベル・完了・編集・複製・アーカイブ・削除。選択中の行なら選択中のすべてに効く。いつかの行は予定する・夢/やりたいことへ移す・かなえた・削除、チェックリストの行はチェック（全部済みならチェックを外す）・削除だけ。今日の計画の行を指で押すと短いシート（時間を決める・今日やる / 明日へ・記録を始める・完了・実行日・締切・編集、メモがあれば題名の下に）。`TaskItem` のある所・今日の計画・カレンダーの横の To-Do・完了済み・検索結果・週のふりかえり・週の終日行・夢ボード・選択中のバーの「操作」で出る | `components/TaskContextMenu.tsx` |
| ゴミ箱・アーカイブの行のメニュー | 右クリックで行のボタンと同じ操作。ゴミ箱: 復元・完全に削除（確認あり）。アーカイブ: 戻す・削除（ゴミ箱へ）。選択中なら選択中のすべて | `components/TaskBinView.tsx` |
| 予定・記録・Google の予定のメニュー | 月・予定一覧・日パネルで右クリック。予定: 色・実行日・予定どおり記録（To-Do は記録して完了）・完了/未完了・記録を始める・編集・複製・（Google に送っているとき）この名前は Google に送らない・削除。記録: 色（＝ラベル）・編集・削除。Google: 複製・Google カレンダーで開く・削除（色はカードの色の四角で変える。書き込めない予定は開くだけ、やらなかった予定は削除だけ）。タイムラインの右クリック・長押しは `brief`（予定は完了/未完了・複製、Google は複製だけ。ほかはカード） | `components/timeline/EventContextMenu.tsx` |
| 習慣のメニュー | 習慣のカード・カレンダーの習慣の段・タイムラインの習慣の枠で右クリック（タッチは長押し）。編集・今日の記録・休む（その日だけ・カレンダーで選んだ日まで。休みの日なら休みを外す）・習慣の段に戻す（タイムラインに置いた枠）・アーカイブ・削除（タイムラインでは出さない）。アーカイブした習慣は戻す・削除だけ | `components/HabitContextMenu.tsx` |
| リスト・セクションのメニュー | リスト: 名前の変更・色・種類・削除（未分類は出さない。色は丸を押しても選べる）。セクション: 名前の変更・ここにタスクを追加・削除 | `components/ListContextMenu.tsx`・`hooks/useSectionEditing.tsx` |
| 並び順・絞り込みのボタン | 見出しの脇の小さなボタンで、押すとその下にメニュー（スマホは下からのシート）。並び順は `SortMenuButton`（今の並び順を出す）、絞り込みは `FilterMenuButton`。絞り込みの項目は `useTaskFilterMenu`（中のメニューの先頭に「指定なし」、右に今の値。リスト・ラベル・タグはあるものだけ）、選んでいるものは `FilterChips`（× で外す）、0 件は `FilterNoMatch`。To-Do 一覧の見出し・今日やる候補・完了済み | `components/ui/SortMenuButton.tsx`・`components/ui/useTaskFilterMenu.tsx`・`components/ui/FilterChips.tsx` |
| 予定の色・時刻の判断 | 色は `useTaskColor`（記録は色＝ラベル、予定は色だけ）、「予定どおり記録」「終わった予定」は `planTiming`。予定カードとメニューで同じ | `hooks/useTaskColor.ts`・`lib/planTiming.ts` |
| 色選択 | 丸は 24px・選択中は ✓ でどこでも同じ。Google カレンダーの 24 色を 12 列（狭い画面とポップオーバーは 6 列）。予定のカード・右クリックの中のメニューは `fill`（幅いっぱいに 8 列）。名前は `useLabeledSwatches`。ラベル編集の「色を選択」は自由な色を作る別の役割なので別の格子 | `components/ui/ColorSwatches.tsx`・`components/labels/ColorPalette.tsx` |
| 追加の入力欄 | `InlineAddInput`。細い枠に ＋ と文字、押すと薄い背景（今日の計画だけ枠の代わりに下線、`underline`）。Enter で追加して続けて書ける、Esc で書いた分を消す。外したときは書いた分を残す（カレンダーの中・サブタスクは足す）。`onExpand` のある欄（To-Do・今日の計画・カレンダーの中）は ⌘/Ctrl+Enter で足して詳細を開く、書いている間は右端に「詳しく書く」。今日・To-Do・買い物・いつか（印は ☆）・カレンダーの中（月のマス・終日行は小さい版）・サブタスク | `components/ui/InlineAddInput.tsx` |
| 追加欄の詳細 | 入力中だけ欄の下にチップ（実行日・時間・見積もり・締切・優先度・リスト・ラベル）。旗＝優先度、→|＝締切。チップには足したら付く値（書いた文・選んだ値・欄の既定を重ねたもの、`quickAddDraft`）を出し、選んだ値は書いた文より勝つ。いつか・チェックリストに入るなら日付のチップは出さない。To-Do・今日の計画・カレンダーの中の追加欄で共通。「こう読みました」の 1 行は `QuickAddReading` | `components/QuickAddDetails.tsx`・`components/QuickAddReading.tsx` |
| 入力欄 | `fieldClass({ size, active })`。地なし・細い枠（zinc-200、ダーク zinc-700）・角丸 8px・フォーカスで墨の薄いリング（`FIELD_FOCUS_RING`）・text-sm。size: md（px-3 py-2、詳細・ダイアログ・連携の設定・ログイン）/ sm（px-2 py-1.5、習慣の時刻・タイマーの終了時刻・設定の行の選択・カレンダーの横のリスト選択・リストの種類・記録の時刻・Google の予定の日時・時間帯）。`disabled` で薄く、`aria-invalid` で赤い枠、ポップオーバーを開いている欄は `active`。`input`・`select`・`textarea` と、欄のふりをするボタン（`DateField`・締切/実行日・時間帯）に使う。詳細の時刻の欄の幅は `TIME_FIELD_WIDTH`。その場で名前を書き換える欄・`InlineAddInput`・チップやメニューの形の選択・検索の欄・ラベル名の欄（ラベル編集の行とナビの色ラベルのカード。`labels/labelNameInputClass.ts`）・リスト名の欄（ナビ）・予定作成カードの題とリスト・睡眠の行の時刻には使わない（睡眠の行の時刻もフォーカスは同じリング `FIELD_FOCUS_RING`） | `components/ui/fieldClass.ts` |
| 日付の入力欄 | `DateField`（空にできない日付: 記録の開始日・終了日、Google の予定の日付、繰り返しの終わり、追加機能の日付）。ブラウザの `<input type="date">` は使わない。締切・実行日は `DueDatePopover`。中身はどれも `DatePickerBody` | `components/DateField.tsx`・`components/DueDatePopover.tsx` |
| 時刻の入力欄 | `TimeInput`。打てる欄＋15 分ごとの候補（↑↓・Enter・Esc、行のハイライトはメニューと同じ）。終わりの欄は `durationFrom` で開始の 15 分後から長さを添えて並べる（予定は 23:59 まで、記録・睡眠は `overnight` で 1 周）。ブラウザの `<input type="time">` は使わない | `components/TimeInput.tsx` |
| チップ | `chipClass({ variant, size, hover, selected })`。形はピル。見るだけのもの（To-Do 行のタグ・絞り込み）は `fill`（薄いグレーの塗り）、押して選ぶもの（記録のラベル・最近の記録・タイマーのタグ）は `outline`（細い枠、選んだらその色の縁と文字 `gc-chip-on`）、足すもの（＋）は `add`（点線の枠） | `components/ui/chipClass.ts` |
| 開閉する見出し | `DisclosureButton`。小さな ＞ が開くと下を向く。色は見出しの役割で `default`（候補）/ `muted`（完了・やり残し・アーカイブ）。`alert`（赤）を使う見出しは無い。今日の計画・To-Do の「完了」・日パネル・習慣のアーカイブ・習慣のフォーム・時間割・設定の連携 | `components/ui/Disclosure.tsx` |
| 空状態 | `EmptyState`。線のアイコン＋中央。画面（To-Do・ゴミ箱・検索・いつか・習慣・完了済み・スケジュール）は `lg`、パネルの中（日パネル・時間未定のタスク）は `sm`。一覧の途中の一言（「この日の予定はなし」・メニューの「見つかりません」）は文字だけ。作り方は文で説明せず、押せば 1 件できる例のボタン（`ExampleChips`、outline のチップ）を置く: 習慣は空の画面の下（押すとその名前で追加のカード）、いつかはまだ何も無いとき追加欄の下（押すと欄に入る）、今日の計画ははじめの案内の追加欄の下 | `components/ui/EmptyState.tsx`・`components/ui/ExampleChips.tsx` |
| さらに表示 | `ShowMoreButton`（`remaining` で残りの件数を添える）。長い一覧の終わりに置き、一覧（listbox）の外。最後の行から ↓ でも足される。行の数は `useShowMore`（始め 100 行・100 行ずつ）。検索・完了済み・アーカイブ・ゴミ箱・カレンダーのスケジュール・ラベルなしの記録・今日やる候補 | `components/ui/ShowMoreButton.tsx`・`hooks/useShowMore.ts` |
| アイコンボタン | `iconButtonClass(extra)`。丸・枠なし・乗せたときだけ薄い地。削除も赤くしない。予定カードの右上（詳細・削除・閉じる・Google で開く）・ラベル編集の行の削除・習慣の編集カードの削除・ゴミ箱/アーカイブの行の削除・セクションの見出しの名前変更と削除 | `components/ui/iconButtonClass.ts` |
| 行の右端の操作 | `RowActionButton`。アイコンだけで角丸の四角・枠あり（`buttonClass` の secondary xs）、名前はヒント。指で押す画面では一回り大きく。`revealOnHover`（マウスで乗せたときだけ）・`collapse`（乗せていない間は場所も取らず、行の時刻・締切と入れ替わる）・`mouseOnly`（タッチでは出さない）。今日の計画の行の記録を開始・今日やる・時間を決める | `components/ui/RowActionButton.tsx` |
| 乗せたときだけ出す操作 | 隠すかは画面の幅ではなく「マウスで乗せられるか」（`hover: hover`）で決め、タッチでは常に出す。キーボードで行に入ったときも出す。`REVEAL_ON_HOVER`（`group`）・`REVEAL_ON_ROW_HOVER`（`group/row`）・場所ごと入れ替える `SHOW_ON_ROW_HOVER` / `HIDE_ON_ROW_HOVER` | `components/ui/revealClass.ts` |
| 選択の四角 | `RowSelectCheckbox`。選んでいる間か選んだ行は出したまま、それ以外は PC で行に乗せたときだけ（スマホは隠す）。押しても行のクリックには渡さない。To-Do の行・アーカイブ・ゴミ箱 | `components/ui/RowSelectCheckbox.tsx` |
| 選択中のバー | `SelectionBar`。行を選んでいる間だけ下に浮かぶ（`INVERSE_SURFACE`、記録中はタイマーの上）。件数・その画面でよく使う操作・「操作」（タスクのメニュー）。操作したら選択を外す。To-Do 一覧・今日の計画・アーカイブ・ゴミ箱 | `components/ui/SelectionBar.tsx` |
| 行の色の線 | `RowColorLine`。行の左の細い線（ラベル・習慣の色、`gc-line`）。To-Do の一覧・今日の計画の行 | `components/ui/RowColorLine.tsx` |
| 締切の印 | `DueChip`（→| と「10/16 (金)まで」、締切の色）。To-Do の行とカレンダーの To-Do のカード。子の行が見えない所（今日の計画・カレンダーの横の To-Do）では子の締切を `ChildDueChip`（「ES 10/16 (金)まで」） | `components/ui/DueChip.tsx`・`components/ui/ChildDueChip.tsx` |
| 1 行の並び | `DayRow`（時刻・色の丸・題名。箱にせず、色は `EventMark` の丸だけ）。時刻の列の幅・行の高さは To-Do の行（`TaskItem` の `compact`）と同じ（`DAY_ROW_TIME_CLASS`・`DAY_ROW_PAD_CLASS`）。日パネルの Google の予定・記録 | `components/ui/DayRow.tsx` |
| メモの表示 | カード・シートのメモは `MemoPreview`（行数で切らず全部、リンクは押せる、空なら出さない）。中の URL は `LinkifiedText`（下線付きのリンク、長い URL は短く）。メモがリンクだけのタスク（Canvas・Notion）の「開く」アイコンは `TaskSourceLink`（To-Do の行・予定カード） | `components/ui/MemoPreview.tsx`・`components/ui/LinkifiedText.tsx`・`components/ui/TaskSourceLink.tsx` |
| 小見出し | `SectionLabel`（`as`・`level`）と `sectionLabelClass(level)`。2 段で、どちらも text-xs・font-medium。`section`（zinc-400）は画面・パネル・カードの中のまとまりの見出し、`field`（zinc-500）はフォームの欄の名前。画面の題・今日の計画の区切りの見出し（太い黒）・カードの題・開閉する見出し・メニューの区切り・リストのセクション名には使わない | `components/ui/SectionLabel.tsx`・`components/ui/sectionLabelClass.ts` |
| 見出し | 画面の題（h1）は `PAGE_TITLE_CLASS`（text-2xl・semibold・墨）。画面の区切り（今日の計画の To-Do・習慣、習慣画面の「この日の習慣」）は `SECTION_HEADING_CLASS`（text-base・太い墨）。カード・設定のまとまりの題（統計・週のふりかえり・睡眠・設定・習慣のフォーム）は `CARD_TITLE_CLASS`（text-sm・太い墨） | `components/ui/headingClass.ts` |
| 画面のスクロール枠 | `PAGE_SCROLL_CLASS`（min-h-0・min-w-0・flex-1・overflow-y-auto・記録中はタイマーの分の余白 `timer-safe`）。To-Do・ゴミ箱・カレンダー・検索・統計・習慣・設定。縦に並べる画面は flex-col を足す | `components/ui/layoutClass.ts` |
| 控えめな文字 | 灰色の添え書きは 3 種類。`HINT_TEXT`（text-xs・zinc-600、ダーク zinc-300）は説明・手助け（欄の下の説明・設定の説明・連携の手順・「記録して完了」などの説明文）、`META_TEXT`（text-xs・zinc-500、ダーク zinc-400。HINT より一段薄い）は静かな事実（件数・日時・長さ・行の題の下の 2 行目・題の横の期間）、`SUBTLE_TEXT`（text-sm・zinc-500、ダーク zinc-400）は本文の大きさの添え書き（今日の計画の日付・予定カードの日時・本文の大きさの短い一言）。どれも 12px の文字で 4.5:1 を満たす。余白などは足して組み合わせる。10px のデータのラベル（グラフの軸・時刻の目盛り・月のマス・終日の行）、統計のタイルの数字のラベル、To-Do 行の 2 行目（メモ・締切・セクション）、欄の名前、チップ・ボタン・メニューの中の文字、`EmptyState`、小見出し・見出し、色で状態を伝える文字には使わない。日本語の文を語の途中で折り返さないときは `PHRASE_WRAP` | `components/ui/textClass.ts`（連携の設定の「1. 2. 3.」の手順は `STEPS_LIST_CLASS`） |
| エラーの文字 | `ERROR_TEXT`（text-xs・red-600、ダーク red-400）。連携の失敗・入力の誤り（未来の時刻・終了が開始より前）など、エラーの 1 行はどれもこれ。余白は足して組み合わせる | `components/ui/textClass.ts` |
| 完了の丸 | `CompletionCircle`。20px（サブタスク 16px）・枠 1.5px・優先度の色・押せる範囲 40px（サブタスク 32px）。複数選択中は `inert`（押せない薄い印）。完了の無い予定の印は同じ大きさの色の丸 `EventMark` | `components/ui/CompletionCircle.tsx` |
| 日付の移動 | `DayNav`（今日 ＜ ＞、「今日」が左）。今日を見ているときは「今日」を押せないだけで消さない。T / K / J のヒント。今日の計画・習慣・習慣の詳細・カレンダー・週のふりかえり | `components/ui/DayNav.tsx` |
| 濃い色の浮く面 | `INVERSE_SURFACE`（元に戻す・移動・Canvas の提出済みのトースト・選択中のバー・ヒント） | `components/ui/surface.ts` |
| ポップオーバー | 面は `FLOATING_SURFACE`・`POPOVER_PANEL`・`anchoredCardClass`（予定カード: スマホは下からのシート、PC は押した所の横）。ダークの背景は zinc-800（下の画面より一段明るく） | `components/ui/surface.ts` |
| 月のカレンダー（日付を選ぶ） | 年（« »）と月（‹ ›）の切り替え・常に 6 週の日付・今日/明日/なし。`kind` は締切 / 実行日 / 日付。キーは ←→↑↓ で日・週、PageUp/PageDown で月、Home/End で週の頭と終わり、Enter で決める。締切・実行日のポップオーバー・`DateField`・追加欄の詳細・タスクと習慣の右クリックメニュー（`footer={false}`）・締切の日時・カレンダー画面の見出しの日付ジャンプ（`month` で見ている月から始める）で共通 | `components/DatePickerBody.tsx` |
| 締切の日時・時間を決める | 締切の日付と時刻を一度に決める「日時を指定…」は `DueDateTimeMenu`。時間未定のタスクの「時間を決める」は `TimeSlotMenu`（その日の空きから近い順に 3 つと長さ、「その他の時刻…」）。どちらも PC は押した所に小さく、スマホは下からのシート（`SheetBackdrop`） | `components/DueDateTimeMenu.tsx`・`components/TimeSlotMenu.tsx` |
| マウスを乗せたときのヒント | アイコンだけのボタンは `aria-label` を、`tip(説明, キー)` を付けたものはその説明＋キーを、0.5 秒後に出す（マウスのある端末だけ）。アイコンだけのボタンの名前とヒントは `tip(説明, { name: true })` で 1 回だけ書く（`aria-label` も付く。キーも添えるなら `{ key, name: true }`）。ショートカットのあるボタンは `shortcutTip(説明, id)`（キーは `SHORTCUTS` から）。ボタンに `title` は使わない（lint で止める） | `lib/tooltip.ts`・`components/ui/Tooltip.tsx` |
| タスクのまとめて操作 | 完了・未完了・削除・アーカイブ・締切・実行日・優先度・ラベル・リスト/セクションへ移動。何件に何をしたかを「元に戻す」トーストで出す（1 件の締切・優先度は出さない）。今と同じ値のタスクは対象から外す | `hooks/useBulkTaskActions.ts` |

### 日付・時刻

| 役割 | 決まり | 場所 |
| --- | --- | --- |
| 日付キー | `yyyy-MM-dd` にするのは `toDateKey`、戻すのは `fromDateKey`（正午にして日付がずれないようにする）。date-fns の locale は `dateFnsLocale(i18n.resolvedLanguage)` | `lib/dateKey.ts` |
| 時刻 `HH:MM` | 保存済みの時刻 → 分は `timeToMinutes`（欠けた分は 0）、入力の検証は `toMinutes`（不正なら null）。分 → 時刻は `minutesToTime`（折り返さず 24:00 も書ける）、24 時で折り返すのは `addClockMinutes`。Date の時刻は `clockOf`、0 埋めは `pad2`。開始を打ち直したときの終わりは `endAfterStartEdit`（長さを保つ `endKeepingLength`、日の終わりは 23:59 で止める）、開始＋長さの終わりは `endWithinDay` | `lib/clockTime.ts` |
| 長さの表示 | `formatDuration`（1時間15分 / 1h 15m、言語に合わせる）。月のマスなど狭いところは `formatDurationShort`（3h20 / 45m） | `lib/timeGrid.ts` |
| 日付の表示 | `useDateFormat()`（React の外は `formatDate(date, name)`）。名前: monthDay・monthDayWeekday・monthDayWeekdayLong・shortDate・shortDateWeekday・shortDateWeekdayYear・yearMonth・fullDate・monthDayTime。形式は i18n の `dateFormat.*`。今年でない日は年も付ける「10/3 (土)」は `shortDateWeekdayAnyYear`（`formatShortDateWeekday`）、週の範囲は `weekRange`（`formatWeekRange`）。日本語の曜日は半角の括弧＋前に空白「10月3日 (土)」、英語は曜日が先「Sat, Oct 3」 | `hooks/useDateFormat.ts`・`lib/dateFormat.ts` |

### 挙動

| 役割 | 決まり | 場所 |
| --- | --- | --- |
| 浮く面の閉じ方 | 外側を押す・Esc は一番上だけ・`inside` と `data-popover-keep` の要素は内側扱い。下からのシート（`swallow`）と全面の背景のある面（`backdrop`、背景を押したときだけ閉じる）は、閉じた押下を下のボタン・行・タイムラインに届けない（クリック・長押し・ドラッグも始まらない、`swallowPress`）。PC の小さなカード・メニューは閉じて押下は下へ通す。返す層を `useHotkey` の scope に使う。外を押したら保存・Esc は取り消しの面（ナビの色ラベルのカード）は `onEscape`、閉じる代わりに受け持つときは `onOutsidePress` | `hooks/useDismiss.ts`・`lib/swallowPress.ts` |
| Esc で閉じる層 | 一番上の層だけ閉じる（タスク詳細・習慣の詳細・完了＋記録・日付ピッカー・メニュー・予定カード・ラベルのダイアログ・ナビの色ラベルのカード・ショートカット一覧）。入力欄の Esc は欄のほうで扱い、閉じるのは次の Esc。モーダルは Esc 以外の閉じるキーを `closeKeys` で足す（ショートカット一覧の ?・検索パレットの ⌘K） | `hooks/useHotkey.ts` `useEscapeLayer`・`components/ui/Modal.tsx` |
| ショートカット | `useHotkey(キー, 処理, { scope, allowInInputs, enabled })`。scope: `'global'`（層が開いていないときだけ）/ `'always'`（⌘Z・⇧⌘Z・⌘K・⌘N・⌘A）/ 層（`useEscapeLayer`・`useDismiss` の戻り値。その層が一番上のときだけ）。入力中・変換中・部品が先に使ったキーでは動かない。false を返すと次に回す。キーと表示は表 `SHORTCUTS` に 1 か所（ショートカット一覧・ヒントもここから）。To-Do 一覧の `e` はカーソルの行の詳細、Delete / Backspace は削除 | `hooks/useHotkey.ts`・`lib/shortcuts.ts` |
| キーの書き方 | `'e'`・`'Delete'`・`'mod+Enter'`・`'shift+ArrowDown'`・`'alt+ArrowUp'`・`'?'`・`'Space'`。修飾キーは書いたものだけ。? / は Shift を見ない。alt 付きの文字・数字はキーの位置（`code`）で見る（Mac の Option は `key` を別の文字にする）。一覧の 'Alt' は Mac で ⌥ | `lib/keyboard.ts` `matchesHotkey`・`keyCapLabel` |
| タイムラインのブロックの時刻 | ドラッグもキー（フォーカスしたブロック・開いたカードで Alt+↑↓ は 15 分ずつ動かす、Alt+Shift+↑↓ は終わりを伸び縮み）も `applyBlockMove` / `applyBlockResize` を通る。記録は今より先にしない（伸ばすときは今で止める）、日をまたぐ記録は日付ごと動く、済んだ習慣の枠・書き換えられない Google の予定・日をまたぐ Google の予定・何日も続く予定はキーでは動かさない。動かすたびに元に戻すトースト、新しい時刻は読み上げにも伝える（`announce`） | `lib/timelineBlockEdit.ts`・`lib/announce.ts` |
| 入力中か・変換中か | 入力中＝テキスト欄・選択・contenteditable（ショートカットも ⌘Z もこれで見る）。`isComposing` または keyCode 229 のキーではショートカット・Esc を動かさない | `lib/keyboard.ts` `isTypingTarget`・`isImeKeyEvent` |
| Enter で確定・Esc で取り消し | 変換確定の Enter では送らない（`isSubmitEnter`）、変換を取り消す Esc では取り消さない（`isCancelEscape`） | `lib/keyboard.ts` `isSubmitEnter`・`isCancelEscape` |
| 複数行の入力欄 | `useTextAreaEntry`: Enter で改行、⌘/Ctrl+Enter で確定して欄を離れる、Esc で欄を離れる（書いた分は捨てない・親のダイアログは閉じない）、外したら保存。変換中の Enter / Esc は何もしない。タスク詳細のメモと完了＋記録のメモ | `hooks/useTextEntry.ts` `useTextAreaEntry`・`lib/keyboard.ts` `textAreaKeyAction` |
| 1 行の入力欄 | `useTextEntry`: Enter で確定、Esc で取り消し（親のダイアログは閉じない）、外したら確定（`commitOnBlur`）。Esc / Enter のあとの blur は無視する | `hooks/useTextEntry.ts` |
| ⌘ の表示 | Mac は ⌘、それ以外は Ctrl。`shortcutLabel(['mod', 'Z'])` | `lib/keyboard.ts` `modKeyLabel`・`shortcutLabel` |
| 削除 | 戻せるもの（タスク・記録・セクション・リスト・習慣・ラベル・Google の予定）は確認なしで消して「元に戻す」トースト。ほかにも回がある毎週の予定は先に範囲を聞く（`deleteTaskAsking`）。戻せないもの（ゴミ箱から完全に削除・アカウント）だけ `askConfirm` | `lib/seriesScope.tsx` |
| 文字からタスクを足す | 「明日 課題」＝実行日、「明日まで 課題」「締切」「〆切」「提出」「今週中」「by / due」＝締切、時刻つき＝タイムラインの予定、「@リスト」＝リスト、「毎日」「毎週金」「毎週月水」「毎週月・水・金」「平日」「隔週」「毎月15日」「毎年」「3日ごと」「2週間ごと」「every fri」「every mon wed」「every weekday」「every 2 weeks」＝繰り返し（最初の回の日が締切。日付を書かなければ既定の実行日か今日から数えて最初に当たる日。曜日が 2 つ以上なら繰り返しに曜日を持たせる）。書いた URL は題名から外してメモへ。上部の追加欄・今日の計画・カレンダーのセル・予定作成カード・サブタスクで同じ。欄ごとに違うのは書かなかったときの既定値だけ（セル＝その日、予定作成カード＝ドラッグした日と時間帯、サブタスク＝親とそのリスト固定で @… は題名に残る）。書いた日付・時刻は既定値より優先。いつか・チェックリストには日付を付けない。足すのと日時を付けるのは 1 回で元に戻る | `lib/quickAddTask.ts` `addTaskFromQuickText`・`lib/parseQuickAdd.ts` |
| To-Do のドラッグ | 運ぶ側は `startTaskDrag`（常に copyMove を許す）、受ける側は `acceptTaskDrag`（運ぶ側の許可に合わせる。To-Do・Google の予定以外では光らない）。画面ごとに `effectAllowed`・`dropEffect` を書かない | `lib/taskDrag.ts` |
| タッチの行 | 横に払う（`useRowSwipe`: 右へ＝完了、左へ＝今日やる・明日へ。その向きに操作があれば画面の横スワイプより先に取る）と長押し（`useRowLift`: 浮かせて選択に入れ、押さえたまま別の指のタップで足す）。今日の計画の行は `GestureRow`、To-Do の行は同じ hook を使う。並べ替えられる行は PC は左のつまみ、タッチは長押しで浮かせて運ぶ（`useRowGrip`） | `hooks/useRowSwipe.tsx`・`hooks/useTouchLift.ts`・`components/ui/GestureRow.tsx`・`hooks/useRowGrip.tsx` |
| 今日やる ⇄ 明日へ | 全部が今日に置いてあれば明日へ、そうでなければ今日へ。時刻と締切はそのまま（実行日だけ動かす）。右クリックメニューの先頭・Shift+T・今日の計画の行で共通。メニューの「実行日 › 今日 / 明日 / 来週 / 日付…」は `useScheduleEntry`（タスクの行と予定ブロックで共通） | `hooks/useTodayToggle.ts`・`hooks/useScheduleEntry.tsx` |
| 習慣の達成 | 習慣画面・今日画面・週カレンダー・習慣の詳細とも、押すと付き、もう一度押すと外す（その日の習慣の記録も外れる） | ストアの `toggleHabitDate` |
| 記録を足して完了 | 完了の丸はどこでも完了の切り替えだけ（時刻つきの予定も記録を足さない）。「記録して完了」は通知の「記録する」から開く。予定カードは「完了」と「予定どおり記録」を別のボタンにする。記録の追加と完了は 1 つの操作で、元に戻すも 1 回 | `hooks/useCompleteWithLog.tsx` |
| タイマーの切り替え | どこからでも切り替えられる。前の記録は保存し「「○○」の記録を保存して切り替えました」と知らせる（1 分未満なら記録せずに切り替えたと知らせる）。行・予定カード・メニュー・検索パレットは `startTimerForTask` を通す | `lib/timerDrop.ts`・ストアの `startTimer` |
| 遅れて読む面 | 詳細・メニュー・ポップオーバーは `OverlaySuspense` に置く。読めなかったら画面全体のエラーにせず閉じて知らせ、次に開いたとき・回線が戻ったときに読み直す | `components/ui/OverlaySuspense.tsx` |

---

## まだ違うところ

| 役割 | 違い | 場所 |
| --- | --- | --- |
| 時刻の入力欄 | 設定の朝のまとめ・夜のまとめの時刻がブラウザの `<input type="time">`（ほかは `TimeInput`） | `components/DailyRhythmSettings.tsx` |
| ドラッグ | Google の予定を運ぶ側の `effectAllowed = 'move'` を画面ごとに書いている | `components/CalendarView.tsx`・`components/calendar/WeekAllDayRow.tsx` |
| マウスを乗せたときのヒント | `tip()` ではなくブラウザの `title` で出している（月のマスの記録の合計・記録の内訳の棒・リストの種類の説明・アカウントの名前） | `components/CalendarView.tsx`・`components/RecordPanel.tsx`・`components/ListKindPicker.tsx`・`components/AccountMenu.tsx` |
| 下から出るシートの幕 | スマホ幅の予定・Google の予定・新規作成・習慣の枠・ラベルのカード（`anchoredCardClass(true)`）は `SheetBackdrop` を出さない。メニュー・時間を決める・締切の日時のシートは出す | `components/timeline/EventPopover.tsx`・`components/timeline/GoogleEventPopover.tsx`・`components/timeline/QuickCreatePopover.tsx`・`components/timeline/HabitSlotPopover.tsx`・`components/labels/ColorLabelCard.tsx` |
| 控えめな文字（説明） | 説明の一言を `HINT_TEXT` ではなく `META_TEXT` と同じ色の直書きで出している | `components/QuickAdd.tsx`（共有で入れた一言）・`components/habits/RoutineList.tsx`・`components/labels/LabelsDialog.tsx`（ラベルの目安の説明） |
| 控えめな文字（定数） | `META_TEXT` と同じ class（text-xs・zinc-500、ダーク zinc-400）を定数を使わずに直書き | `components/QuickAddDetails.tsx`・`components/ListKindPicker.tsx`・`components/DayInsights.tsx`・`components/RecordPanel.tsx`・`components/SleepStatsCard.tsx`・`components/SleepTimesField.tsx`・`components/ui/MemoPreview.tsx`・`components/settings/NotionSettings.tsx`・`components/calendar/TimetableDialog.tsx`・`components/today/PlannerTaskRow.tsx`・`components/habits/HabitWeekTable.tsx`・`components/detail/TaskRecurrenceField.tsx`・`components/labels/ColorLabelSelect.tsx` |
| カードの題 | `CARD_TITLE_CLASS` と同じ class を直書き | `components/habits/RoutineList.tsx`・`components/habits/HabitTrend.tsx`・`components/CalendarDayPanel.tsx`（日パネルの日付） |
