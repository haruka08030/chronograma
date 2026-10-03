import type { IconProps } from './icons'

/**
 * 画面ごとに切り替わる path（ナビの各画面・ゴミ箱の空状態など）の線のアイコン。`icons.tsx` と同じ見た目。
 * 決まった形は `icons.tsx` の名前付きの部品を使う
 */
export function PathIcon({ d, className, style, strokeWidth = 2, label }: IconProps & { d: string }) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}
