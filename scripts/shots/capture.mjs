/**
 * 画面を撮る（原則 9「自分で画面を見て確かめる」を 1 コマンドにする）。
 *
 *   npm run shots              # 全画面 × デスクトップ/スマホ × ライト/ダーク
 *   npm run shots -- --only=planner,stats
 *   npm run shots -- --dark-only
 *   npm run shots -- --out=/tmp/shots
 *   npm run shots -- --at=19:30         # 時刻を変える（既定 13:00。--at=now で実時刻）
 *
 * 保存先の既定は `.shots/`（git 管理外）。
 * 毎回この作業ツリーをビルドし、空いているポートで自分のサーバーを起こして最後に止める。
 * （既に開いている 5173 を使い回すと、別の worktree や別の作業の画面を撮ってしまう）
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { addInsightHistory, buildSeedState, PERSIST_KEY } from './seed.mjs'

/** ここから順に空いているポートを探す（5173 は普段の dev サーバー用に空けておく） */
const FIRST_PORT = 5180

/**
 * 撮影するブラウザのタイムゾーン。種データの日付もこれで組み立てる
 * （ホストの時刻で作ると、日付が 1 日ずれて予定・記録がタイムラインから消える）
 */
const TIMEZONE = 'Asia/Tokyo'

/** `iosSafari` の画面で名乗る iPhone の Safari */
const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

/** `at` を決めていない画面を撮る時刻（TIMEZONE の今日） */
const DEFAULT_AT = '13:00'

/** スマホで題名の左の ≡（リストのドロワーを開く） */
const OPEN_LISTS = 'button[aria-label="リストを開く"] >> visible=true'
/** ナビの色ラベル「就活」（種データの #F6BF26） */
const LABEL_JOBHUNT = 'button:has-text("就活") >> visible=true'
/** 見出しの並び順のボタン（種データはどこも手動） */
const SORT_BUTTON = 'button[aria-haspopup="menu"]:has-text("手動") >> visible=true'
/** To-Do 一覧の絞り込み（じょうご）のボタン */
const TODO_FILTER = 'button[aria-label="絞り込む"] >> visible=true'
/** 今日やる候補の並び順のボタンと、絞り込み（じょうご）のボタン */
const CANDIDATE_BUTTON = 'button[aria-label="候補の並び順"] >> visible=true'
const CANDIDATE_FILTER = 'button[aria-label="候補を絞り込む"] >> visible=true'
/** 月表示の見出しの「よく入れる予定」と、撮るときに登録しておくもの（#311） */
const TEMPLATES_BUTTON = 'button:has-text("よく入れる予定") >> visible=true'
const SEED_TEMPLATES = [
  { id: 'tpl-early', title: 'バイト 早番', startTime: '09:00', endTime: '15:00', color: '#7986CB' },
  { id: 'tpl-late', title: 'バイト 遅番', startTime: '17:00', endTime: '22:00', color: '#7986CB' },
  { id: 'tpl-class', title: 'ゼミ', startTime: '13:00', endTime: '14:30', color: null },
]
/** 週表示の見出しの「時間割」（#279）。マスを押して授業名を書いて保存する手順 */
const TIMETABLE_BUTTON = 'button:has-text("時間割") >> visible=true'
const addClass = (cell, title) => [
  { click: `[data-timetable-cell="${cell}"]` },
  { fill: { selector: '[role=dialog] input[placeholder="例: 経済学入門"]', text: title } },
  { click: '[role=dialog] button:has-text("保存")' },
]
const SEED_CLASSES = [
  ...addClass('1:0', '経済学入門'),
  ...addClass('3:1', '英語コミュニケーション'),
  ...addClass('4:0', '情報科学概論'),
  ...addClass('5:2', '統計学'),
]
/** ラベルの週の目安（分、#291）。種データのラベル名 */
const SEED_TARGETS = { 授業: 600, 課題: 480, 就活: 180 }
/** ふりかえりのラベル別の時間の行（スマホでも行が見えるところまで送る） */
const TARGET_ROWS = 'ul[aria-labelledby="review-by-label"]'
/** 今日やる候補を開く見出し */
const OPEN_CANDIDATES = 'button[aria-expanded]:has-text("締切が近い") >> visible=true'

/** 撮る画面。`view` は store の selectedView、`click` は撮る前に押すもの（配列なら順に。`mobileClick` はスマホ幅だけその前に押す）、`hover` は撮る前にマウスを乗せるもの（PC 幅だけ）、`swipeRight` は画面の中ほどを右へ払う（スマホ幅だけ）、`mobileOnly` / `desktopOnly` はその幅だけ撮る、`at` は時刻を固定する（'HH:MM'、TIMEZONE の今日）、`iosSafari` は iPhone の Safari（ホーム画面に未追加・通知なし）として開く、`doneNow` はその ID の To-Do を撮る瞬間に完了にする、`state` は種データに上書きする store の値、`timer` は動いているタイマー（題名・ラベル・何分前に始めたか・何分後に終わるか）、`steps` は最後に順に行う操作（PC の click / rightClick と、スマホで代わりにする longPress / mobileClick。キーを押す press、欄に書く fill） */
const SCREENS = [
  // 初めて開いた人が見る画面（種データなし。`fresh` は保存データを入れずに開く）
  { name: 'first-run', fresh: true },
  { name: 'first-run-todo', fresh: true, view: 'all' },
  { name: 'first-run-calendar', fresh: true, view: 'calendar' },
  { name: 'first-run-habits', fresh: true, view: 'habits' },
  // 習慣がまだないときに追加フォームを開いた状態（空の案内は出さない）
  { name: 'first-run-habits-add', fresh: true, view: 'habits', click: 'button:has-text("習慣を追加") >> visible=true' },
  { name: 'first-run-stats', fresh: true, view: 'stats' },
  { name: 'first-run-settings', fresh: true, view: 'settings' },
  // ログインの欄（一文・説明・ボタン）。Supabase の設定（.env）があるビルドでだけ出る
  { name: 'first-run-signin', fresh: true, view: 'settings', click: 'button:has-text("ログイン") >> visible=true' },
  { name: 'planner', view: 'planner' },
  // 浮いているタイマーの「あと何分」（#290）: 残り時間・長さを選ぶ並び・時間を過ぎた（`timer` は撮る瞬間からの分で動いているタイマーを置く）
  { name: 'timer-remaining', view: 'planner', timer: { title: 'レポート', tags: ['課題'], startedAgo: 12.4, endsIn: 12.6 } },
  {
    name: 'timer-length-menu',
    view: 'planner',
    timer: { title: 'レポート', tags: ['課題'], startedAgo: 3 },
    click: 'button:has-text("あと何分") >> visible=true',
  },
  { name: 'timer-time-up', view: 'planner', timer: { title: 'レポート', tags: ['課題'], startedAgo: 52, endsIn: -2 } },
  // 見出しの「予定 / 空き」で、置いた To-Do が空きを超える日（目安を 2 時間にして今日を超えさせる。「（超過）」を締切の色で）
  { name: 'planner-free-over', view: 'planner', state: { dailyCapacityMinutes: 120 } },
  // 下の「習慣」（週に◯回で今週の回数を満たした習慣は「今週は達成」と薄く出す）
  { name: 'planner-habits', view: 'planner', scrollToBottom: true },
  // アイコンだけのボタンに乗せたときのヒント（aria-label を出す。スマホは出ない）
  {
    name: 'planner-tip',
    view: 'planner',
    click: 'button[aria-expanded]:has-text("やり残し")',
    hover: 'button[aria-label$="完了にする"] >> nth=0',
  },
  // 追加欄に書いている間の詳細のチップ（日付・時間・見積もり・締切・リスト・ラベル）と、見積もりを開いたところ
  {
    name: 'planner-add-details',
    view: 'planner',
    typeInto: { selector: 'input[data-quickadd] >> visible=true', text: '金曜まで ES 1時間' },
  },
  {
    name: 'todo-add-details-estimate',
    view: 'all',
    typeInto: { selector: 'input[data-quickadd] >> visible=true', text: '明日 レポート' },
    thenClick: ['button[aria-expanded][aria-label="見積もり"] >> visible=true'],
  },
  {
    name: 'todo-add-details-time',
    view: 'all',
    typeInto: { selector: 'input[data-quickadd] >> visible=true', text: '明日 レポート' },
    thenClick: ['button[aria-expanded][aria-label="時間"] >> visible=true'],
  },
  // 追加欄を押した状態（書き方のヒントは浮かせて出し、下の行を動かさない）
  { name: 'planner-add-hint', view: 'planner', click: 'input[data-quickadd]' },
  // タイムラインの予定の ✓ を押したとき（記録は足さず完了だけ）
  { name: 'planner-timeline-check', view: 'planner', click: 'button[aria-label="タスクを完了にする"] >> visible=true >> nth=-1' },
  // やり残しを開いた状態（行ごとの「今日やる」アイコン）
  // 指で行を押したときの短いシート（題名の下にメモ）
  { name: 'planner-row-sheet', view: 'planner', mobileOnly: true, click: 'button:has-text("ES 書く（第一志望）") >> visible=true' },
  // シートの「締切 › 日時を指定…」（日付と時刻を一度に選ぶ）
  {
    name: 'planner-due-datetime',
    view: 'planner',
    mobileOnly: true,
    click: [
      'button:has-text("ES 書く（第一志望）") >> visible=true',
      '[role=menuitem]:has-text("締切")',
      '[role=menuitem]:has-text("日時を指定")',
    ],
  },
  { name: 'planner-left-over', view: 'planner', click: 'button[aria-expanded]:has-text("やり残し")' },
  // 今日やる候補の並び順・絞り込み（To-Do 一覧と同じボタン）と、見積もり順＋優先度で絞ったところ
  { name: 'planner-candidates-menu', view: 'planner', click: [OPEN_CANDIDATES, CANDIDATE_BUTTON] },
  { name: 'planner-candidates-filter-menu', view: 'planner', click: [OPEN_CANDIDATES, CANDIDATE_FILTER] },
  {
    name: 'planner-candidates-sorted',
    view: 'planner',
    click: [
      OPEN_CANDIDATES,
      CANDIDATE_BUTTON,
      '[role=menu] >> text=見積もりが短い順 >> visible=true',
      CANDIDATE_FILTER,
      '[role=menu] >> text=優先度で絞る >> visible=true',
      '[role=menu] >> text=中以上 >> visible=true',
    ],
  },
  // 夕方以降だけ出る「1 日を締める」行（残り・ラベルなしの記録・ふりかえる）
  { name: 'planner-evening', view: 'planner', at: '19:30', scrollToBottom: true },
  // 全部終わった日の締め（おつかれさまでした）
  { name: 'planner-evening-clear', view: 'planner', at: '19:30', scrollToBottom: true, allDone: true },
  // 夜中に開いたとき（日付が変わった直後のタイムライン）
  { name: 'planner-midnight', view: 'planner', at: '00:30' },
  // 1 日の気分（#324）: 締めの所で記号を押して一言を書いたところ・前の日の見出しの記号を押して一言を開いたところ
  {
    name: 'planner-mood',
    view: 'planner',
    at: '21:30',
    steps: [
      { click: 'button[aria-label="良い"] >> visible=true' },
      { fill: { selector: 'input[aria-label="ひとこと"]', text: 'ES が 1 本書けた' } },
    ],
    scrollToBottom: true,
  },
  {
    name: 'planner-mood-past',
    view: 'planner',
    click: ['button[aria-label="前の日"] >> visible=true', 'button[aria-label="気分: 良い"] >> visible=true'],
  },
  // 見出しの期間を押したときの月のカレンダー（期限のカレンダーと同じ DatePickerBody）
  { name: 'calendar-date-jump', view: 'calendar', click: 'button[aria-label="日付を選択"]' },
  // タイムラインの予定を押したときのカード（右上の丸いアイコンボタン）
  { name: 'calendar-event-card', view: 'calendar', click: '[data-block-id="s6"] >> visible=true' },
  // 時刻を押したところ（カードのままで分単位に直せる。候補は 15 分刻み）
  {
    name: 'calendar-event-card-time',
    view: 'calendar',
    click: ['[data-block-id="s6"] >> visible=true', '[role="dialog"] input[role="combobox"] >> nth=0'],
  },
  { name: 'todo', view: 'all' },
  // スマホで題名の左の ≡ を押した状態・画面を右へ払った状態（どちらもリストのドロワーが出る）
  { name: 'todo-mobile-open-lists', view: 'all', mobileOnly: true, click: 'button[aria-label="リストを開く"] >> visible=true' },
  { name: 'todo-mobile-swipe', view: 'all', mobileOnly: true, swipeRight: true },
  // ナビから色ラベルを開いた状態（「すべて」を色で絞る）。開いている色ラベルは保存しない値なので、種データではなくナビのラベルを押して開く
  { name: 'todo-label', view: 'all', mobileClick: OPEN_LISTS, click: LABEL_JOBHUNT },
  // 見出しの並び順のメニュー（スマホは下から出すシート）。色ラベル・いつかでも同じメニュー
  { name: 'todo-sort-menu', view: 'all', click: SORT_BUTTON },
  // To-Do 一覧の絞り込み（じょうご）と、優先度で絞ったところ（チップ・件数）
  { name: 'todo-filter-menu', view: 'all', click: [TODO_FILTER, '[role=menu] >> text=優先度で絞る >> visible=true'] },
  {
    name: 'todo-filtered',
    view: 'all',
    click: [TODO_FILTER, '[role=menu] >> text=優先度で絞る >> visible=true', '[role=menu] >> text=高のみ >> visible=true'],
  },
  { name: 'todo-label-sort-menu', view: 'all', mobileClick: OPEN_LISTS, click: [LABEL_JOBHUNT, SORT_BUTTON] },
  { name: 'someday-sort-menu', list: 'seed-someday', click: SORT_BUTTON },
  // 手動以外に変えたあと（つまみの幅を空けたまま、行の文字の位置が手動と同じ）
  { name: 'todo-sorted-due', view: 'all', click: [SORT_BUTTON, '[role=menu] >> text=締切日 >> visible=true'] },
  // ナビの色ラベルの丸を押したカード（名前・24 色・削除）。スマホはドロワーを開いてから押す
  {
    name: 'todo-label-card',
    view: 'all',
    mobileClick: 'button[aria-label="リストを開く"] >> visible=true',
    click: 'button[aria-label="ラベルの名前と色"] >> visible=true >> nth=0',
  },
  { name: 'calendar', view: 'calendar' },
  // 見出しの空き時間で、置いた To-Do が空きを超える日（目安を 2 時間にして今日を超えさせる。「空き 2h / 3h45」を締切の色で）
  { name: 'calendar-free-over', view: 'calendar', state: { dailyCapacityMinutes: 120 } },
  // 締切が先（あさって）の To-Do を今日終えたところ（完了した日＝今日の列に出る）
  { name: 'calendar-early-done', view: 'calendar', doneNow: ['s4'] },
  // 月表示（To-Do は時刻の有無で見た目を変えない。Google の終日予定だけ塗りの帯）
  { name: 'calendar-month', view: 'calendar', calendarMode: 'month' },
  // よく入れる予定（#311）: 見出しのボタンを押したところ・登録の画面・選んで日を続けて押しているところ
  {
    name: 'calendar-month-templates',
    view: 'calendar',
    calendarMode: 'month',
    state: { eventTemplates: SEED_TEMPLATES },
    click: TEMPLATES_BUTTON,
  },
  {
    name: 'calendar-month-templates-edit',
    view: 'calendar',
    calendarMode: 'month',
    state: { eventTemplates: SEED_TEMPLATES },
    click: [TEMPLATES_BUTTON, '[role=menuitem]:has-text("登録・編集") >> visible=true'],
  },
  {
    name: 'calendar-month-templates-stamp',
    view: 'calendar',
    calendarMode: 'month',
    state: { eventTemplates: SEED_TEMPLATES },
    click: [TEMPLATES_BUTTON, '[role=menuitem]:has-text("バイト 遅番") >> visible=true'],
    steps: [
      { click: 'div[aria-pressed="false"] >> nth=16' },
      { click: 'div[aria-pressed="false"] >> nth=18' },
      { click: 'div[aria-pressed="false"] >> nth=20' },
      { click: 'div[aria-pressed="false"] >> nth=22' },
      { click: 'div[aria-pressed="false"] >> nth=24' },
    ],
  },
  // 時間割（#279）: 授業を入れたマス・空きのマスを押して授業名を入れるところ・入れた授業が毎週の予定として出る次の週（スマホは翌日）
  { name: 'calendar-timetable', view: 'calendar', click: TIMETABLE_BUTTON, steps: SEED_CLASSES },
  {
    name: 'calendar-timetable-cell',
    view: 'calendar',
    click: TIMETABLE_BUTTON,
    steps: [
      ...SEED_CLASSES,
      { click: '[data-timetable-cell="2:1"]' },
      { fill: { selector: '[role=dialog] input[placeholder="例: 経済学入門"]', text: 'ミクロ経済学' } },
    ],
  },
  {
    name: 'calendar-week-classes',
    view: 'calendar',
    click: TIMETABLE_BUTTON,
    steps: [
      ...SEED_CLASSES,
      { click: '[role=dialog] button:has-text("閉じる")' },
      // 次の週へ（スマホ幅は 1 日ずつなので翌日）
      { press: 'n' },
    ],
  },
  // 時刻の無い To-Do が多い日（終日の欄は 3 行までにたたみ「他 N 件」。▾ で全件）
  { name: 'calendar-allday-many', view: 'calendar', manyAllDay: true },
  {
    name: 'calendar-allday-many-open',
    view: 'calendar',
    manyAllDay: true,
    click: 'button[aria-expanded][aria-label="すべて表示"] >> visible=true',
  },
  // スマホ幅の 3 日表示（予定の列だけ。PC 幅では週になる）
  { name: 'calendar-3day', view: 'calendar', calendarMode: 'threeDay', mobileOnly: true },
  // スケジュール（予定の一覧）
  { name: 'calendar-schedule', view: 'calendar', calendarMode: 'schedule' },
  // 祝日の名前（灰色の文字だけ。週・1 日は終日の行、月は日付の横、スケジュールは日の行）。
  // 撮る日（2026/10）の次の週の 10/12 スポーツの日。スマホは月のマスの祝日を押してその日の 1 日表示へ
  { name: 'calendar-holiday', view: 'calendar', desktopOnly: true, click: 'button[aria-label="次の週"] >> visible=true' },
  { name: 'calendar-holiday-day', view: 'calendar', mobileOnly: true, calendarMode: 'month', click: '[data-holiday] >> visible=true' },
  { name: 'calendar-holiday-month', view: 'calendar', calendarMode: 'month' },
  { name: 'calendar-holiday-schedule', view: 'calendar', calendarMode: 'schedule' },
  // 週の開始日を日曜にした週・月表示・ミニ月（`weekStartsOn` は設定の値。既定は月曜）
  { name: 'calendar-week-sunday', view: 'calendar', weekStartsOn: 0 },
  { name: 'calendar-month-sunday', view: 'calendar', calendarMode: 'month', weekStartsOn: 0 },
  {
    name: 'calendar-mobile-month-picker-sunday',
    view: 'calendar',
    mobileOnly: true,
    weekStartsOn: 0,
    click: 'button[aria-expanded][aria-label="日付を選択"] >> visible=true',
  },
  // スマホの見出しの「10月 ▾」でミニ月を開いた状態・表示の切り替えメニュー（PC 幅には無いボタン）
  {
    name: 'calendar-mobile-month-picker',
    view: 'calendar',
    mobileOnly: true,
    click: 'button[aria-expanded][aria-label="日付を選択"] >> visible=true',
  },
  {
    name: 'calendar-mobile-mode-menu',
    view: 'calendar',
    mobileOnly: true,
    click: 'button[aria-haspopup="menu"][aria-label] >> visible=true',
  },
  // 終わった日（前の週）の予定と記録
  // スマホ幅は ‹ › が無い（スワイプで動く）
  { name: 'calendar-past', view: 'calendar', desktopOnly: true, click: 'button[aria-label="前の週"] >> visible=true' },
  // 開いた状態でしか見えないもの: click のセレクタを押してから撮る
  { name: 'calendar-dock', view: 'calendar', click: 'button[aria-pressed]' },
  // タスク詳細（締切・時刻・タイムゾーン・繰り返し・リストの並び）
  // タイトルを押すと編集になるので、行の左の余白を押して開く
  { name: 'task-detail', view: 'all', click: 'div.group.cursor-pointer:has-text("ES 書く（第一志望）")', clickAt: { x: 4, y: 12 } },
  // 曜日つきの毎週（繰り返しの下に曜日のピル）
  // メモを押して編集に入った状態（中身に合わせて欄が伸びる）
  {
    name: 'task-detail-memo-edit',
    view: 'all',
    // スマホは行を押すと短いシートが開く（詳細はそこから）
    desktopOnly: true,
    click: ['div.group.cursor-pointer:has-text("ES 書く（第一志望）")', 'div.cursor-text:has-text("志望動機")'],
    clickAt: { x: 4, y: 12 },
  },
  { name: 'task-detail-repeat', view: 'all', click: 'div.group.cursor-pointer:has-text("バイトのシフト提出")', clickAt: { x: 4, y: 12 } },
  {
    name: 'task-detail-scheduled',
    view: 'all',
    click: 'div.group.cursor-pointer:has-text("ゼミ"):not(:has-text("研究室"))',
    clickAt: { x: 4, y: 12 },
  },
  { name: 'habits', view: 'habits' },
  // 習慣の追加欄（色選びはラベル付きの色選び）
  { name: 'habits-add', view: 'habits', click: 'button:has-text("習慣を追加")' },
  // 習慣を追加するフォームで「曜日を指定」を選んだ状態（曜日のピル）
  {
    name: 'habits-new-weekly',
    view: 'habits',
    click: ['button:has-text("習慣を追加") >> visible=true', 'label:has-text("曜日を指定")'],
    scrollToBottom: true,
  },
  // 「回数を指定」（週に◯回）を選んだ状態（回数のピル）
  {
    name: 'habits-new-times',
    view: 'habits',
    click: ['button:has-text("習慣を追加") >> visible=true', 'label:has-text("回数を指定")'],
    scrollToBottom: true,
  },
  // 習慣の名前を押した詳細（連続・最長・達成率・月のカレンダー）と、そこから編集
  { name: 'habits-detail', view: 'habits', click: 'li[data-habit-row]:has-text("朝に 10 分ストレッチ") button >> nth=0' },
  {
    name: 'habits-detail-edit',
    view: 'habits',
    click: ['li[data-habit-row]:has-text("ジム") button >> nth=0', 'div[role="dialog"] button:has-text("編集")'],
  },
  // 習慣の行を右クリックしたメニュー（編集・今日の記録・アーカイブ・削除）
  { name: 'habits-menu', view: 'habits', rightClick: 'li[data-habit-row]:has-text("朝に 10 分ストレッチ")' },
  // 下の「アーカイブ」を開いた状態（戻すボタン）と、その行の右クリック（戻す・削除）
  { name: 'habits-archived', view: 'habits', click: 'button[aria-expanded]:has-text("アーカイブ")', scrollToBottom: true },
  {
    name: 'habits-archived-menu',
    view: 'habits',
    click: 'button[aria-expanded]:has-text("アーカイブ")',
    scrollToBottom: true,
    rightClick: 'li:has-text("日記を書く")',
  },
  { name: 'stats', view: 'stats' },
  // ふりかえりを画像にして共有する前の見本（#283。画像は共有先で読みやすいライトで作る）
  { name: 'stats-share', view: 'stats', click: 'button[aria-label="画像にして共有"] >> visible=true' },
  {
    name: 'stats-share-month',
    view: 'stats',
    click: ['[aria-label="ふりかえりの期間"] button:has-text("月") >> visible=true', 'button[aria-label="画像にして共有"] >> visible=true'],
  },
  // 統計のふりかえりを「月」に切り替えたところ（日のマスの濃さ・ラベル別の前の月との差。#304）
  { name: 'stats-month', view: 'stats', click: '[aria-label="ふりかえりの期間"] button:has-text("月") >> visible=true' },
  // ラベルの週の目安（#291）: ふりかえりのラベル別の行に「記録 / 目安」と細い線（月は週の目安を月の日数に合わせる）
  { name: 'stats-targets', view: 'stats', state: { logLabelTargets: SEED_TARGETS }, scrollTo: TARGET_ROWS },
  {
    name: 'stats-month-targets',
    view: 'stats',
    state: { logLabelTargets: SEED_TARGETS },
    click: '[aria-label="ふりかえりの期間"] button:has-text("月") >> visible=true',
    scrollTo: TARGET_ROWS,
  },
  // 「ラベルを編集」で週の目安を書く欄（名前の右）
  {
    name: 'labels-targets',
    view: 'settings',
    state: { logLabelTargets: SEED_TARGETS },
    click: 'button:has-text("ラベルを編集") >> visible=true',
  },
  // 統計の睡眠: 記録の無い夜（点線の枠）を押して、図の下の入力欄で埋めるところ
  {
    name: 'stats-sleep-edit',
    view: 'stats',
    click: 'button[aria-label$="の睡眠を入れる"] >> nth=-1',
    scrollTo: 'figure:has(button[aria-expanded="true"])',
  },
  // 統計の睡眠の下の段「日の違い」（#326）: 過去 2 週間の睡眠・記録・気分を足して、睡眠の長さ・寝た時刻・気分で分けた差
  { name: 'stats-day-insights', view: 'stats', insightHistory: true, scrollTo: 'section[aria-labelledby="day-insights-title"]' },
  { name: 'settings', view: 'settings' },
  // 設定「計画」（1 日に計画する時間・既定の予定の長さ）
  { name: 'settings-planning', view: 'settings', scrollTo: '#settings-planning' },
  // iPhone の Safari（ホーム画面に未追加）の「通知」（通知は追加すると使える。手順の行へ飛ぶ 1 行）
  { name: 'settings-ios-notifications', view: 'settings', mobileOnly: true, iosSafari: true, scrollTo: '#settings-rhythm' },
  // はじめの 3 ステップのあとの誘い（ログインしていない人）。Supabase の設定（.env）があるビルドでだけ出る
  { name: 'planner-signin-nudge', view: 'planner', state: { onboardingCompleted: true }, scrollTo: 'section[aria-label^="いまの To-Do"]' },
  // iPhone の Safari ではホーム画面への追加の誘いにログインのことを添える
  {
    name: 'planner-ios-install-nudge',
    view: 'planner',
    mobileOnly: true,
    iosSafari: true,
    state: { onboardingCompleted: true },
    scrollTo: 'section[aria-label^="ホーム画面に追加"]',
  },
  // 設定の下の方（データ・アプリ・規約）
  { name: 'settings-bottom', view: 'settings', scrollToBottom: true },
  // 「データ」の記録の書き出し（期間・予定も入れるスイッチ・件数と CSV / ICS、#281）
  { name: 'settings-data', view: 'settings', scrollTo: '#settings-data' },
  // 他のタイムゾーン: 名前を付けた行・付けていない行（設定）と、時間バーの見出し（長い名前は切ってヒントに全体）
  { name: 'settings-time-zones', view: 'settings', extraTimeZones: true, scrollTo: '#settings-time-zone' },
  // 「日付と時刻」の週の開始日（日曜を選んだところ）
  { name: 'settings-week-start', view: 'settings', weekStartsOn: 0, scrollTo: '#settings-time-zone' },
  { name: 'calendar-time-zones', view: 'calendar', extraTimeZones: true, hover: '[data-tip^="ロンドンの友達"]' },
  { name: 'someday', list: 'seed-someday' },
  { name: 'checklist', list: 'seed-shopping' },
  // 行に乗せたとき（PC だけ）。いつかは締切の代わりに「予定する」
  { name: 'todo-hover', view: 'all', hover: 'div.group.cursor-pointer:has-text("ES 書く（第一志望）")' },
  { name: 'checklist-hover', list: 'seed-shopping', hover: '[data-task-row="s24"]' },
  { name: 'someday-hover', list: 'seed-someday', hover: '[data-task-row="s21"]' },
  // 行を右クリックしたときのメニュー（PC だけ。いつか・買い物はリストに合わせた短いメニュー）
  { name: 'someday-menu', list: 'seed-someday', rightClick: '[data-task-row="s21"]' },
  { name: 'checklist-menu', list: 'seed-shopping', rightClick: '[data-task-row="s24"]' },
  { name: 'checklist-menu-checked', list: 'seed-shopping', rightClick: '[data-task-row="s25"]' },
  // ゴミ箱・アーカイブの行の右クリック（deleted・archived の ID を撮るときだけ消した・しまった状態にする）
  { name: 'trash-menu', view: 'deleted', deleted: ['s20'], rightClick: 'div.group:has-text("就活サイトのプロフィール更新")' },
  { name: 'archive-menu', view: 'archived', archived: ['s20'], rightClick: 'div.group:has-text("就活サイトのプロフィール更新")' },
  // アーカイブ・ゴミ箱で行を押して複数選んだところ（下の選択中のバー）と、選んだ行の右クリック（PC）・「操作」のシート（スマホ）
  {
    name: 'archive-select',
    view: 'archived',
    archived: ['s19', 's20', 's5'],
    steps: [{ click: '[role=option]:has-text("就活サイトのプロフィール更新")' }, { click: '[role=option]:has-text("参考文献を集める")' }],
  },
  {
    name: 'trash-select-menu',
    view: 'deleted',
    deleted: ['s19', 's20', 's5'],
    steps: [
      { click: '[role=option]:has-text("就活サイトのプロフィール更新")' },
      { click: '[role=option]:has-text("参考文献を集める")' },
      { rightClick: '[role=option]:has-text("参考文献を集める")', mobileClick: 'button:has-text("操作") >> visible=true' },
    ],
  },
  // ⌘K の検索パレット（今日の計画の上に出し、画面は替えない。選んだ結果の操作を下の段に）
  {
    name: 'palette',
    view: 'planner',
    desktopOnly: true,
    steps: [{ press: 'ControlOrMeta+k' }, { fill: { selector: '[role=dialog] input[role=combobox]', text: 'ゼミ' } }],
  },
  // 選んだ複数の To-Do の右クリック（PC）・「操作」のシート（スマホ）で「ラベル ›」を開いたところ
  {
    name: 'todo-menu-label',
    view: 'all',
    steps: [
      { click: '[data-task-row="s4"] button[role=checkbox]', longPress: '[data-task-row="s4"]' },
      { click: '[data-task-row="s5"] button[role=checkbox]' },
      { rightClick: '[data-task-row="s5"]', mobileClick: 'button:has-text("操作") >> visible=true' },
      { click: '[role=menu] [role=menuitem]:has-text("ラベル") >> visible=true' },
    ],
  },
  // 完了した To-Do を全リスト分集めた画面（完了した日ごと）
  { name: 'completed', view: 'completed' },
  // 完了済みの絞り込み（リスト・ラベル・期間）と、期間で絞ったところ
  { name: 'completed-filter-menu', view: 'completed', click: TODO_FILTER },
  {
    name: 'completed-filtered',
    view: 'completed',
    click: [TODO_FILTER, '[role=menu] >> text=期間で絞る >> visible=true', '[role=menu] >> text=過去 7 日 >> visible=true'],
  },
]

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
]

/**
 * そのタイムゾーンでの「いま」を、ローカル時刻として読める Date にする。
 * 種データは `getFullYear()` などローカル時刻の API で日付を作るので、
 * ブラウザ側と同じ暦日にそろえないと予定・記録が別の日に置かれる。
 */
function nowInTimeZone(timeZone, instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant)
  const get = (t) => Number(parts.find((p) => p.type === t).value)
  return new Date(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
}

/** TIMEZONE で今日の `at`（'HH:MM'）にあたる実時刻 */
function instantAt(at, timeZone) {
  const now = new Date()
  const local = nowInTimeZone(timeZone, now)
  const [h, m] = at.split(':').map(Number)
  const target = new Date(local)
  target.setHours(h, m, 0, 0)
  return new Date(now.getTime() + (target.getTime() - local.getTime()))
}

function parseArgs(argv) {
  // 時刻を決めないと、撮るたびに「過ぎた予定」「現在線」が動いて見比べられない。既定は昼
  const out = { only: null, themes: ['light', 'dark'], outDir: '.shots', at: DEFAULT_AT }
  for (const a of argv) {
    if (a.startsWith('--only='))
      out.only = a
        .slice(7)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    else if (a === '--dark-only') out.themes = ['dark']
    else if (a === '--light-only') out.themes = ['light']
    else if (a.startsWith('--out=')) out.outDir = a.slice(6)
    else if (a.startsWith('--at=')) out.at = a.slice(5) === 'now' ? null : a.slice(5)
  }
  return out
}

function portFreeOn(port, host) {
  return new Promise((resolve) => {
    const s = createServer()
    s.once('error', () => resolve(false))
    s.once('listening', () => s.close(() => resolve(true)))
    s.listen(port, host)
  })
}

/** IPv4・IPv6 のどちらでも空いているポート（Vite は localhost＝::1 で待ち受けることがある） */
async function findFreePort() {
  for (let port = FIRST_PORT; port < FIRST_PORT + 50; port++) {
    if ((await portFreeOn(port, '127.0.0.1')) && (await portFreeOn(port, '::1'))) return port
  }
  throw new Error(`${FIRST_PORT} 以降に空いているポートがありません`)
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      /* まだ起きていない */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { cwd: process.cwd(), stdio: 'ignore' })
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} が失敗しました`))))
    c.on('error', reject)
  })
}

/**
 * 本番ビルドを配信して撮る。dev サーバーだと `import.meta.env.DEV` の
 * 開発者向け表示（Google OAuth の設定手順など）が写り込み、
 * 利用者が見る画面と違ってしまう。
 */
async function startServer() {
  console.log('→ ビルドします')
  await run('npm', ['run', 'build'])
  const port = await findFreePort()
  const baseUrl = `http://localhost:${port}`
  console.log(`→ プレビューサーバーを起動します（${baseUrl}）`)
  const child = spawn('npm', ['run', 'preview', '--', '--port', String(port), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: false,
  })
  if (!(await waitForServer(baseUrl))) {
    child.kill('SIGTERM')
    throw new Error('プレビューサーバーが起動しませんでした')
  }
  return { child, baseUrl }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const screens = args.only ? SCREENS.filter((s) => args.only.includes(s.name)) : SCREENS
  if (screens.length === 0) {
    throw new Error(`--only に一致する画面がありません。使えるのは: ${SCREENS.map((s) => s.name).join(', ')}`)
  }

  const outDir = path.resolve(process.cwd(), args.outDir)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const server = await startServer()
  const browser = await chromium.launch()
  let shot = 0
  const failures = []

  try {
    for (const theme of args.themes) {
      for (const vp of VIEWPORTS) {
        for (const screen of screens) {
          if (screen.mobileOnly && !vp.hasTouch) continue
          if (screen.desktopOnly && vp.hasTouch) continue
          // 画面ごとに context を作り直す。addInitScript は context に積み上がるので、
          // 使い回すと前の画面の種データが後から上書きしてしまう
          const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            isMobile: vp.isMobile ?? false,
            hasTouch: vp.hasTouch ?? false,
            // 2x は文字が読みやすい反面、固定サイドバーの左端に描画の切れ端が
            // 残ることがある（アプリ側の不具合ではない）。気になるときは 1 にする
            deviceScaleFactor: 2,
            colorScheme: theme,
            locale: 'ja-JP',
            timezoneId: TIMEZONE,
            // 時刻で構図が動く画面（タイムラインの現在線）を落ち着かせる
            reducedMotion: 'reduce',
            ...(screen.iosSafari ? { userAgent: IOS_SAFARI_UA } : {}),
          })
          // iPhone の Safari はホーム画面に追加するまで Notification が無い
          if (screen.iosSafari) await context.addInitScript(() => delete window.Notification)

          const at = screen.at ?? args.at
          const instant = at ? instantAt(at, TIMEZONE) : new Date()
          // 朝 4 時までは前の日の種を置く（夜中の画面で、前の日の続きをしている様子を撮るため。アプリの「今日」は 0:00 で変わる）
          const seedNow = nowInTimeZone(TIMEZONE, instant)
          // 完了・作成・更新の時刻は撮る瞬間で付ける（seedNow は壁時計なので ISO にするとホストとのずれの分だけ先になる）
          const seedInstant = new Date(instant)
          if (seedNow.getHours() < 4) {
            seedNow.setDate(seedNow.getDate() - 1)
            seedInstant.setTime(seedInstant.getTime() - 24 * 60 * 60 * 1000)
          }
          const seed = buildSeedState({ theme, now: seedNow, instant: seedInstant })
          // selectView と同じく、ビューを開くときはリストの選択を外す
          if (screen.view) {
            seed.state.selectedView = screen.view
            seed.state.selectedListId = null
          }
          if (screen.allDone) {
            for (const x of seed.state.tasks) if (!['seed-someday', 'seed-shopping'].includes(x.listId)) x.completed = true
          }
          if (screen.extraTimeZones) {
            seed.state.extraTimeZones = [
              { tz: 'Europe/London', label: 'ロンドンの友達（大学）' },
              { tz: 'America/New_York', label: '' },
            ]
          }
          if (screen.calendarMode) seed.state.calendarMode = screen.calendarMode
          if (screen.weekStartsOn !== undefined) seed.state.weekStartsOn = screen.weekStartsOn
          if (screen.state) Object.assign(seed.state, screen.state)
          if (screen.timer) {
            const ms = instant.getTime()
            const { title, tags = [], startedAgo, endsIn } = screen.timer
            seed.state.activeTimer = {
              taskTitle: title,
              startedAt: new Date(ms - startedAgo * 60_000).toISOString(),
              tags,
              taskId: null,
              color: null,
              ...(endsIn != null ? { endsAt: new Date(ms + endsIn * 60_000).toISOString() } : {}),
            }
          }
          if (screen.insightHistory) addInsightHistory(seed.state, { now: seedNow, instant: seedInstant })
          if (screen.manyAllDay) {
            const base = seed.state.tasks.find((x) => x.id === 's7')
            const titles = ['ES を出す', '履歴書の写真', 'Week 2 課題', '出席フォーム', 'OB 訪問のお礼', '教科書を買う', 'シフト提出']
            titles.forEach((title, i) =>
              seed.state.tasks.push({ ...base, id: `many-${i}`, title, startTime: null, endTime: null, completed: i < 2, order: 100 + i }),
            )
          }
          for (const x of seed.state.tasks) {
            if (screen.deleted?.includes(x.id)) x.deletedAt = seedInstant.toISOString()
            if (screen.archived?.includes(x.id)) x.archivedAt = seedInstant.toISOString()
            if (screen.doneNow?.includes(x.id)) {
              x.completed = true
              x.completedAt = seedInstant.toISOString()
            }
          }
          if (screen.list) {
            seed.state.selectedView = null
            seed.state.selectedListId = screen.list
          }
          // アプリが動き出す前に仕込む。goto してから書くと、起動した store が
          // 作りたての state を先に保存してしまい、種データが上書きされる
          await context.addInitScript(
            ([key, value]) => {
              try {
                if (value) window.localStorage.setItem(key, value)
                window.localStorage.setItem('chronograma-lang', 'ja')
              } catch {
                /* 読めない環境ではそのまま進む */
              }
            },
            // fresh: データは入れず、開く画面だけ決める（はじめの案内などは新しい人と同じに出る）
            [
              PERSIST_KEY,
              screen.fresh
                ? screen.view
                  ? JSON.stringify({ state: { selectedView: screen.view, selectedListId: null }, version: seed.version })
                  : null
                : JSON.stringify(seed),
            ],
          )

          const page = await context.newPage()
          if (at) await page.clock.setFixedTime(instant)
          const consoleErrors = []
          page.on('console', (m) => {
            if (m.type() === 'error') consoleErrors.push(m.text())
          })
          page.on('pageerror', (e) => consoleErrors.push(String(e.message ?? e)))

          try {
            await page.goto(server.baseUrl, { waitUntil: 'networkidle' })
            // Zustand の復元とフォントの反映を待つ
            await page.waitForTimeout(600)
            if (screen.mobileClick && vp.hasTouch) {
              // スマホ幅だけ先に押すもの（ナビのドロワーを開く、など）
              await page.click(screen.mobileClick)
              await page.waitForTimeout(300)
            }
            if (screen.click) {
              // 配列なら順に押す（フォームを開いてから中の選択肢を押す、など）。clickAt は最初の 1 つだけ
              const clicks = Array.isArray(screen.click) ? screen.click : [screen.click]
              for (const [i, sel] of clicks.entries()) {
                await page.click(sel, i === 0 && screen.clickAt ? { position: screen.clickAt } : undefined)
                await page.waitForTimeout(300)
              }
            }
            if (screen.typeInto) {
              // 欄に書く（`text`）。そのあと `thenClick` を順に押す（書いてから出るチップを開く、など）
              await page.locator(screen.typeInto.selector).first().fill(screen.typeInto.text)
              await page.waitForTimeout(300)
              for (const sel of screen.thenClick ?? []) {
                await page.click(sel)
                await page.waitForTimeout(300)
              }
            }
            if (screen.swipeRight && vp.hasTouch) {
              // 画面の中ほど（y = 高さの半分）を指で右へ払う。左端は OS の「戻る」なので、内側から始める
              const cdp = await page.context().newCDPSession(page)
              const y = vp.height / 2
              const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
              await touch('touchStart', 80)
              for (let x = 100; x <= 260; x += 20) await touch('touchMove', x)
              await touch('touchEnd', 260)
              await page.waitForTimeout(400)
            }
            if (screen.hover && !vp.hasTouch) {
              // マウスを乗せたときのヒント（TooltipHost は 0.5 秒後に出す）
              await page.hover(screen.hover)
              await page.waitForTimeout(800)
            }

            if (screen.rightClick && !vp.hasTouch) {
              await page.click(screen.rightClick, { button: 'right' })
              await page.waitForTimeout(300)
            }

            // 順に行う操作（`steps`）。1 つの手に PC 用（click / rightClick）と、スマホで代わりにする操作（longPress / mobileClick）を書ける
            for (const step of screen.steps ?? []) {
              if (vp.hasTouch && step.longPress) {
                // 指で長押し（行を浮かせて選択に入れる）
                const box = await page.locator(step.longPress).first().boundingBox()
                const cdp = await page.context().newCDPSession(page)
                const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
                await page.waitForTimeout(700)
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
              } else if (vp.hasTouch && step.mobileClick) {
                await page.click(step.mobileClick)
              } else if (step.rightClick && !vp.hasTouch) {
                await page.click(step.rightClick, { button: 'right' })
              } else if (step.click) {
                await page.click(step.click)
              } else if (step.press) {
                // キーを押す（⌘K など。'ControlOrMeta+k'）
                await page.keyboard.press(step.press)
              } else if (step.fill) {
                await page.locator(step.fill.selector).first().fill(step.fill.text)
              }
              await page.waitForTimeout(300)
            }

            if (screen.scrollTo) {
              await page.locator(screen.scrollTo).scrollIntoViewIfNeeded()
              await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'start' }), screen.scrollTo)
              await page.waitForTimeout(200)
            }

            if (screen.scrollToBottom) {
              // 内側のペインがスクロールするので、スクロールできる要素をすべて下まで送る
              await page.evaluate(() => {
                for (const el of document.querySelectorAll('*')) {
                  if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = el.scrollHeight
                }
              })
              await page.waitForTimeout(200)
            }

            const file = path.join(outDir, `${screen.name}-${vp.name}-${theme}.png`)
            // アプリは body が overflow:hidden で、スクロールするのは内側のペイン。
            // fullPage を使うと固定サイドバーが縦に継ぎ足されて見た目が壊れるので使わない
            await page.screenshot({ path: file })
            shot++
            const errs = consoleErrors.filter(
              // Supabase 未設定・SW 未登録はローカル撮影では当然出るので無視
              (e) => !/supabase|service ?worker|manifest|favicon|VAPID/i.test(e),
            )
            const mark = errs.length > 0 ? ` ⚠ console: ${errs[0].slice(0, 80)}` : ''
            if (errs.length > 0) failures.push(`${screen.name}/${vp.name}/${theme}: ${errs[0]}`)
            console.log(`  ✓ ${path.basename(file)}${mark}`)
          } catch (err) {
            failures.push(`${screen.name}/${vp.name}/${theme}: ${err.message}`)
            console.log(`  ✗ ${screen.name}-${vp.name}-${theme}: ${err.message}`)
          } finally {
            await page.close()
            await context.close()
          }
        }
      }
    }
  } finally {
    await browser.close()
    server.child.kill('SIGTERM')
    console.log('→ サーバーを止めました')
  }

  console.log(`\n${shot} 枚を ${path.relative(process.cwd(), outDir)}/ に保存しました`)
  if (failures.length > 0) {
    console.log(`\n気になった点 (${failures.length}):`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
