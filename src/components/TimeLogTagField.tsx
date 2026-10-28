import { useLogLabelChoice } from '../hooks/useLogLabelChoice'
import { NEUTRAL_HEX } from '../lib/googleColors'
import type { LogLabel } from '../lib/logCategoryColors'
import { ColorLabelSelect } from './labels/ColorLabelSelect'

/**
 * 記録のラベル（色＝ラベル）。予定・記録の詳細と同じ色のドロップダウンで選ぶ（候補は設定のラベルだけ）。
 * 名前の付いた色を選ぶとその分類に、名前の無い色は色だけ付く。「ラベルなし」で外す。色の一覧の下の「なんとなく」（#657）も選べる。
 * 選ばずに記録しても、同じタイトルの前回の分類がストア側で補われる（`inferLogCategory`）。
 */
export function TimeLogTagField({
  value,
  color = null,
  vague = false,
  onChange,
  compact,
}: {
  /** 分類（ラベル名）。無ければ '' */
  value: string
  /** 名前の無い色（分類が無いときだけ使う） */
  color?: string | null
  /** 「なんとなく」（#657）か */
  vague?: boolean
  onChange: (v: LogLabel) => void
  compact?: boolean
}) {
  const label = useLogLabelChoice(value, color, onChange, vague)
  return (
    <ColorLabelSelect
      current={label.current}
      currentText={label.text}
      onChoose={label.choose}
      defaultLabel={label.defaultLabel}
      defaultHex={NEUTRAL_HEX}
      compact={compact}
      vague={{ selected: label.vague, onChoose: label.chooseVague }}
    />
  )
}
