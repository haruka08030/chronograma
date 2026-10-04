import { SHORTCUTS, type ShortcutId } from './shortcuts'
import { IS_MAC, modKeyLabel } from './keyboard'

/** `tip()` の 2 つ目の引数（キーだけなら文字列で渡せる） */
export interface TipOptions {
  /** ヒントに添えるキー */
  key?: string
  /** 同じ文字を `aria-label` にも付ける（アイコンだけのボタンの読み上げ名。aria-label と tip に同じ文字を 2 回書かない） */
  name?: boolean
}

/**
 * マウスを乗せたときに出すヒント（説明＋ショートカットのキー）。要素に広げて付ける:
 *   <button {...tip(t('shortcuts.today'), 'T')}>今日</button>
 *   <button {...tip(t('common.delete'), { name: true })}><CloseIcon /></button>   // アイコンだけ: 読み上げ名も付ける
 * 文字の無いボタン（アイコンだけ）は `aria-label` があればヒントにも出す。キーを添えるとき・aria-label と違う説明を出すときに付ける
 * 表示は `TooltipHost`（components/ui/Tooltip）が 1 か所でまとめて行う（見た目・出るまでの間を全画面で同じにする）
 */
export function tip(label: string | undefined, keyOrOptions?: string | TipOptions) {
  if (!label) return {}
  const { key, name } = typeof keyOrOptions === 'string' ? { key: keyOrOptions, name: false } : (keyOrOptions ?? {})
  return {
    'data-tip': label,
    ...(key ? { 'data-tip-key': key } : {}),
    ...(name ? { 'aria-label': label } : {}),
  }
}

/**
 * ショートカットのあるボタンのヒント。キーは表（`SHORTCUTS`）から取る（書き写さない）。
 *   <button {...shortcutTip(t('shortcuts.today'), 'today')}>今日</button>
 */
export function shortcutTip(label: string, id: ShortcutId | undefined) {
  if (!id) return tip(label)
  // ヒントには最初の組み合わせだけ（J / N なら J）
  const combo = SHORTCUTS[id].display[0].map((k) => (k === 'mod' ? modKeyLabel() : k))
  return tip(label, combo.join(IS_MAC ? '' : '+'))
}
