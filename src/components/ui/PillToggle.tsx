/**
 * 小さなピルを並べて選ぶもの（予定カードの「予定 / タスク」・繰り返し予定の「この予定 / すべて」・習慣の曜日）。
 * 形はピル、選んでいるものは墨の塗り（`buttonClass` の primary と同じ）、選んでいないものは細い枠（`chipClass` の outline と同じ）。
 * 灰色の溝で切り替える `Segmented` は画面の表示・設定値の切り替えに使い、こちらはカードやフォームの中の小さな選択に使う。
 * - `value` + `onChange`: 1 つだけ選ぶ（radiogroup / radio）
 * - `values` + `onToggle`: いくつでも選ぶ（曜日。各ボタンが aria-pressed）
 */
type PillOption<T> = { value: T; label: string }

type PillToggleProps<T> = {
  options: PillOption<T>[]
  ariaLabel: string
  className?: string
} & ({ value: T; onChange: (v: T) => void } | { values: T[]; onToggle: (v: T) => void })

const PILL = 'rounded-full border px-3 py-1 text-xs transition-colors touch-manipulation'
const SELECTED = 'border-transparent bg-accent-600 font-medium text-on-accent hover:bg-accent-700'
const UNSELECTED = 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'

export function PillToggle<T extends string | number>(props: PillToggleProps<T>) {
  const { options, ariaLabel, className = '' } = props
  const multiple = 'values' in props
  return (
    <div role={multiple ? 'group' : 'radiogroup'} aria-label={ariaLabel} className={`flex flex-wrap gap-1.5 ${className}`}>
      {options.map((o) => {
        const selected = multiple ? props.values.includes(o.value) : props.value === o.value
        return (
          <button
            key={o.value}
            type="button"
            {...(multiple ? { 'aria-pressed': selected } : { role: 'radio', 'aria-checked': selected })}
            onClick={() => (multiple ? props.onToggle(o.value) : props.onChange(o.value))}
            className={`${PILL} ${selected ? SELECTED : UNSELECTED}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
