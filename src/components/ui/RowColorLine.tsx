import { colorVars } from '../../lib/logCategoryColors'

/**
 * 行の左の細い線（ラベル・習慣の色）。To-Do の一覧・カレンダーの日パネル・今日の画面の行で同じ見た目（#511）。
 * 丸の中と同じ薄い色で、ベタ塗りにしない（ここだけポップに浮く）。親の行は `relative`
 */
export function RowColorLine({ hex }: { hex: string }) {
  return <span aria-hidden className="gc-line absolute left-0.5 top-2 bottom-2 w-[3px] rounded-full" style={colorVars(hex)} />
}
