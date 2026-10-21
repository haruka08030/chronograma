import { useMemo } from 'react'
import { useTaskStore } from '../store/taskStore'
import { frequentLogs } from '../lib/logCategory'
import { categoryHex, colorVars } from '../lib/logCategoryColors'
import { chipClass } from './ui/chipClass'

/** 出すチップの数 */
const RECENT_CHIPS = 3

type RecentLog = ReturnType<typeof frequentLogs>[number]

/**
 * よく記録するものを色の丸つきのチップで並べ、押すとその名前とラベルで記録する（タイムラインの「＋ 記録なし」のカード）。
 * 書く前に 1 タップで埋められるように
 */
export function RecentLogChips({
  onPick,
  ariaLabel,
  className = '',
}: {
  onPick: (log: RecentLog) => void
  /** チップの読み上げ名（「授業 として 07:00–10:00 を記録」など） */
  ariaLabel: (title: string) => string
  className?: string
}) {
  const tasks = useTaskStore((s) => s.tasks)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const recent = useMemo(() => frequentLogs(tasks, RECENT_CHIPS), [tasks])
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
