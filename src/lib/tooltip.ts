/**
 * マウスを乗せたときに出すヒント（説明＋ショートカットのキー）。要素に広げて付ける:
 *   <button {...tip(t('shortcuts.today'), 'T')}>今日</button>
 * 文字の無いボタン（アイコンだけ）は付けなくても `aria-label` を出す。付けるのは、キーを添えるときや aria-label と違う説明を出すとき
 * 表示は `TooltipHost`（components/ui/Tooltip）が 1 か所でまとめて行う（見た目・出るまでの間を全画面で同じにする）
 */
export function tip(label: string | undefined, key?: string) {
  if (!label) return {}
  return {
    'data-tip': label,
    ...(key ? { 'data-tip-key': key } : {}),
  }
}
