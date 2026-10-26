import { useMemo } from 'react'
import { useTaskStore } from '../store/taskStore'
import { emptyLogSuggestions, type LogSuggestion, type LogWindow } from '../lib/logSuggestions'
import { categoryHex, colorVars } from '../lib/logCategoryColors'
import { chipClass } from './ui/chipClass'

/** 出すチップの数 */
const RECENT_CHIPS = 3

/**
 * その時間帯にいつもやっていること → 最近よく記録するものを色の丸つきのチップで並べ、押すとその名前とラベルで記録する
 * （タイムラインの記録の作成カード）。書く前に 1 タップで埋められるように。予定はチェックで記録できるので出さない
 */
export function RecentLogChips({
  when,
  onPick,
  ariaLabel,
  className = '',
}: {
  /** 何時から何時の記録か（いつもやっていることを引く） */
  when: LogWindow
  onPick: (log: LogSuggestion) => void
  /** チップの読み上げ名（「授業 として 07:00–10:00 を記録」など） */
  ariaLabel: (title: string) => string
  className?: string
}) {
  const tasks = useTaskStore((s) => s.tasks)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const { dateKey, start, end } = when
  const recent = useMemo(() => emptyLogSuggestions(tasks, { dateKey, start, end }, RECENT_CHIPS), [tasks, dateKey, start, end])
  if (recent.length === 0) return null
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} data-recent-log-chips>
      {recent.map((r) => (
        <button
          key={r.title}
          type="button"
          onClick={() => onPick(r)}
          aria-label={ariaLabel(r.title)}
          className={chipClass({ variant: 'outline', size: 'md' }, 'min-h-9 max-w-[10rem] gap-1.5 md:min-h-7')}
        >
          <span
            aria-hidden
            className="gc-dot h-2 w-2 shrink-0 rounded-full"
            style={colorVars(categoryHex(r.category, logCategoryColors))}
          />
          <span className="truncate">{r.title}</span>
        </button>
      ))}
    </div>
  )
}
