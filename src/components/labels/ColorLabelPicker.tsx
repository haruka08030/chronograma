import { useTaskColor } from '../../hooks/useTaskColor'
import type { Task } from '../../types/task'
import { ColorLabelSelect } from './ColorLabelSelect'

/**
 * 記録の色＝ラベル（Google カレンダーの予定の色選択と同じ）。
 * 押すと ✎（ラベルを編集）・24 色＋自分で作った色・「分類なし」が開く。
 * 名前の付いた色を選ぶとその分類に、名前の無い色は色だけ付く（名前を付ければ後からまとめて分類になる）。
 *
 * 予定（`plan`）は色だけを付ける。ToDo のタグは分類とは別物なので書き換えない。
 * 「既定」はどちらも「ラベルなし」。リストの色はラベルではないので使わない。
 */
export function ColorLabelPicker({
  task,
  compact,
  plan,
  label: rowLabel,
}: {
  task: Task
  compact?: boolean
  plan?: boolean
  /** 行の頭に出す見出し（カードの中で、上のリスト名と続いて見えないように） */
  label?: string
}) {
  const color = useTaskColor(task, plan)
  return (
    <ColorLabelSelect
      current={color.current}
      currentText={color.currentText}
      onChoose={color.choose}
      defaultLabel={color.defaultLabel}
      defaultHex={color.defaultHex}
      compact={compact}
      label={rowLabel}
    />
  )
}
