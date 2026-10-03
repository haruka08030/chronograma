/**
 * 本文より控えめな灰色の文字（アプリ全体で 3 種類）。大きさと色の組み合わせは役割で選び、画面ごとに作らない。
 * - HINT_TEXT: 説明・手助け（欄の下の説明、設定の説明、連携の手順、「こうなります」の一言）
 * - META_TEXT: 静かな事実（件数「9 件の未完了タスク」・日時・題の横の長さ・行の題の下の 2 行目）。HINT より一段薄い
 * - SUBTLE_TEXT: 本文の大きさの添え書き（今日の計画の題の下の日付、本文の大きさの短い一言）
 *
 * 余白・truncate・tabular-nums などは組み合わせて足す（`mt-1 ${META_TEXT}`）。
 * 次は別の役割なので使わない: 10px のデータのラベル（グラフの軸・時刻の目盛り・月のマスのチップ・終日の行）、
 * 統計のタイルの数字のラベル、チップ・ボタン・メニュー・リンク・入力欄の中の文字、`EmptyState`、
 * 小見出し（`SectionLabel`）と見出し、欄の名前、色で状態を伝える文字（赤・オレンジ・藍）、To-Do 行の締切などの 1 行（`DUE_TONE_CLASS`）。
 */
export const HINT_TEXT = 'text-xs text-zinc-500 dark:text-zinc-400'

export const META_TEXT = 'text-xs text-zinc-400 dark:text-zinc-500'

export const SUBTLE_TEXT = 'text-sm text-zinc-500 dark:text-zinc-400'

/** 連携の設定などの「1. 2. 3.」の手順。文字は HINT_TEXT */
export const STEPS_LIST_CLASS = `list-decimal space-y-1 pl-5 ${HINT_TEXT}`
