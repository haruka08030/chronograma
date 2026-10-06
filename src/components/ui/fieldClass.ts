/**
 * フォームの入力欄の見た目（アプリ全体で 1 種類）。地なし・細い枠・角丸の四角（ボタンと同じ形）・
 * フォーカスで藍のリング。`<input>`・`<select>`・`<textarea>` と、欄のふりをするボタン（`DateField`・期限の欄・
 * 時間帯の選択）に使う。
 * - md: 詳細・ダイアログ・設定の連携など、ふつうの欄
 * - sm: 詰めて並べるところ（習慣の時刻・タイマーの終了時刻・設定の行の選択・カレンダーの横のリスト選択）
 *
 * 状態は欄の属性で決まる。`disabled` で薄く、`aria-invalid` で赤い枠。ポップオーバーを開いている欄は
 * `active` でリングを出したままにする。
 * リングは `focus-visible` で出す（文字の欄はクリックでも出る。ボタンの欄はキーボードのときだけ）。
 *
 * 次は別の役割なので使わない: その場で名前を書き換える欄（To-Do 行・詳細の題・リスト名・セクション名）、
 * 追加の欄（`InlineAddInput`）、チップ・メニューの形の選択、検索の欄。
 */
export type FieldSize = 'md' | 'sm'

/** 入力欄のフォーカスの藍のリング。枠の形が違う欄（睡眠の行の時刻など）もフォーカスはこれで見せる */
export const FIELD_FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-accent-500/40'

const BASE =
  'rounded-lg border border-zinc-200 bg-transparent text-zinc-900 outline-none transition-[border-color,box-shadow] ' +
  `placeholder:text-zinc-400 enabled:hover:border-zinc-300 ${FIELD_FOCUS_RING} ` +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-invalid:border-red-400 aria-invalid:focus-visible:ring-red-500/30 ' +
  'dark:border-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:enabled:hover:border-zinc-600 dark:aria-invalid:border-red-500/60 ' +
  // 地なしの select の候補が、ダークで白地に白い文字にならないように（Windows などの候補は地を引き継がない）
  'dark:[&_option]:bg-zinc-800'

const SIZE: Record<FieldSize, string> = {
  md: 'px-3 py-2 text-sm',
  sm: 'px-2 py-1.5 text-sm',
}

const ACTIVE = 'ring-2 ring-accent-500/40'

export function fieldClass({ size = 'md', active = false }: { size?: FieldSize; active?: boolean } = {}, extra = ''): string {
  return `${BASE} ${SIZE[size]}${active ? ` ${ACTIVE}` : ''}${extra ? ` ${extra}` : ''}`
}
