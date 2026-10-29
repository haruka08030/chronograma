import { CalendarArrowIcon, PostponeIcon } from '../icons'

/**
 * 実行日を付け替える操作の印。見ている日へ移す（今日やる・この日にやる）はカレンダーに矢印、
 * 先の日へ回す（明日へ回す・翌日へ）は ↪。同じ所で入れ替わる（今日やる ⇄ 明日へ）ので形で見分ける
 */
export function DayMoveIcon({ later, className }: { later: boolean; className?: string }) {
  return later ? <PostponeIcon className={className} /> : <CalendarArrowIcon className={className} />
}
