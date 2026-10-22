import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { openTaskDetail } from '../lib/overlays'
import { isActiveTask } from '../lib/taskLifecycle'
import { useDateFormat } from '../hooks/useDateFormat'
import { useShowMore } from '../hooks/useShowMore'
import { TimeLogTagField } from './TimeLogTagField'
import { ShowMoreButton } from './ui/ShowMoreButton'
import { META_TEXT } from './ui/textClass'
import { MENU_ROW_HOVER } from './ui/surface'

/**
 * ラベルなしの記録を 1 行ずつ並べ、行のチップでその場でラベルを付ける（記録の帯の凡例・設定のラベル）。
 * 行は開いたときの記録で固定する（付けたチップが見えたまま残り、押し間違いを直せる）。題名を押すと詳細
 */
export function UntaggedLogList({ ids, showDate = false }: { ids: readonly string[]; showDate?: boolean }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const tasks = useTaskStore((s) => s.tasks)
  const updateTask = useTaskStore((s) => s.updateTask)
  const { limit, remaining, showMore } = useShowMore(ids.length, '')
  const byId = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks])
  const rows = ids.slice(0, limit).flatMap((id) => {
    const task = byId.get(id)
    return task && isActiveTask(task) ? [task] : []
  })

  return (
    <>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800" data-untagged-logs>
        {rows.map((log) => (
          <li key={log.id} className="space-y-1.5 py-2">
            <button
              type="button"
              onClick={() => openTaskDetail(log.id)}
              className={`-mx-2 flex w-[calc(100%+1rem)] items-baseline gap-3 rounded-lg px-2 py-0.5 text-left ${MENU_ROW_HOVER}`}
            >
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">{log.title || ' '}</span>
              <span className={`shrink-0 tabular-nums ${META_TEXT}`}>
                {[
                  showDate && log.dueDate ? df.shortDateWeekday(log.dueDate) : null,
                  log.startTime && log.endTime ? `${log.startTime}${t('common.timeRangeSeparator')}${log.endTime}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
            <TimeLogTagField
              value={log.category ?? ''}
              color={log.color}
              onChange={(v) => updateTask(log.id, { category: v.tags[0] ?? null, color: v.color })}
              compact
            />
          </li>
        ))}
      </ul>
      {showMore && <ShowMoreButton onClick={showMore} remaining={remaining} />}
    </>
  )
}
