import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { addDays, format, nextMonday } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { useDismiss } from '../hooks/useDismiss'
import { appToday } from '../lib/timeZone'
import { displayListName } from '../lib/displayListName'
import { PRIORITY_RING_CLASS } from '../lib/priorityColor'
import type { Priority } from '../types/task'
import { POPOVER_PANEL } from './ui/surface'

const PRIORITIES: Priority[] = ['high', 'medium', 'low', 'none']

/** 画面の端からはみ出さないための余白 */
const EDGE = 8

const ITEM_BASE = 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700'
const ITEM = `${ITEM_BASE} text-zinc-700 dark:text-zinc-200`
const CHIP = 'rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700'
const HEADING = 'px-3 pb-1 pt-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400'

/**
 * タスク行の右クリックメニュー（Google カレンダーの予定の右クリックと同じく、押した所に小さく出る）。
 * 選択中の行を右クリックしたときは選択中のタスクすべてに効く
 */
export function TaskContextMenu({
  x,
  y,
  taskIds,
  onClose,
  onOpenDetail,
}: {
  x: number
  y: number
  taskIds: string[]
  onClose: () => void
  onOpenDetail: (taskId: string) => void
}) {
  const { t } = useTranslation()
  const lists = useTaskStore((s) => s.lists)
  const bulkUpdateTasks = useTaskStore((s) => s.bulkUpdateTasks)
  const archiveTasks = useTaskStore((s) => s.archiveTasks)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const [showLists, setShowLists] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useDismiss({ open: true, onClose, inside: [ref] })

  // 押した所に出し、右・下にはみ出すなら内側へ寄せる（リストを開いて背が伸びたときも）
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // 出るときの拡大アニメーション中でも本来の大きさで測る（getBoundingClientRect は縮んだ大きさになる）
    const width = el.offsetWidth
    const height = el.offsetHeight
    setPos({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE)),
    })
  }, [x, y, showLists])

  const sortedLists = useMemo(() => [...lists].sort((a, b) => a.order - b.order), [lists])
  const today = appToday()
  const dueOptions = [
    { label: t('dueDatePicker.today'), value: format(today, 'yyyy-MM-dd') },
    { label: t('dueDatePicker.tomorrow'), value: format(addDays(today, 1), 'yyyy-MM-dd') },
    { label: t('taskMenu.nextWeek'), value: format(nextMonday(today), 'yyyy-MM-dd') },
    { label: t('dueDatePicker.clear'), value: null },
  ]
  const run = (fn: () => void) => {
    fn()
    onClose()
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-popover-keep
      className={`fixed z-[70] w-64 py-1 animate-pop-in ${POPOVER_PANEL}`}
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
    >
      {taskIds.length > 1 && (
        <div className="px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {t('taskList.selectedCount', { count: taskIds.length })}
        </div>
      )}
      {showLists ? (
        <>
          <button type="button" className={`${ITEM_BASE} text-zinc-500 dark:text-zinc-400`} onClick={() => setShowLists(false)}>
            ‹ {t('taskMenu.moveTo')}
          </button>
          <div className="max-h-64 overflow-y-auto">
            {sortedLists.map((l) => (
              <button
                key={l.id}
                type="button"
                role="menuitem"
                className={ITEM}
                onClick={() => run(() => bulkUpdateTasks(taskIds, { listId: l.id }))}
              >
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="truncate">{displayListName(l.id, l.name)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className={HEADING}>{t('common.due')}</div>
          <div className="flex flex-wrap gap-1 px-3 pb-2">
            {dueOptions.map((o) => (
              <button
                key={o.label}
                type="button"
                role="menuitem"
                className={CHIP}
                onClick={() => run(() => bulkUpdateTasks(taskIds, { dueDate: o.value }))}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className={HEADING}>{t('common.priority')}</div>
          <div className="flex gap-1 px-3 pb-2">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                role="menuitem"
                className={`${CHIP} inline-flex items-center gap-1`}
                onClick={() => run(() => bulkUpdateTasks(taskIds, { priority: p }))}
              >
                {p !== 'none' && <span className={`h-2 w-2 rounded-full bg-current ${PRIORITY_RING_CLASS[p]}`} />}
                {t(`common.${p}`)}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-zinc-100 dark:border-zinc-700" />
          <button type="button" role="menuitem" className={`${ITEM} justify-between`} onClick={() => setShowLists(true)}>
            {t('taskMenu.moveTo')}
            <span className="text-zinc-400">›</span>
          </button>
          {taskIds.length === 1 && (
            <button type="button" role="menuitem" className={ITEM} onClick={() => run(() => onOpenDetail(taskIds[0]))}>
              {t('taskMenu.open')}
            </button>
          )}
          <button type="button" role="menuitem" className={ITEM} onClick={() => run(() => archiveTasks(taskIds))}>
            {t('taskItem.archive')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${ITEM_BASE} text-red-600 dark:text-red-400`}
            onClick={() => run(() => deleteTasks(taskIds))}
          >
            {t('taskItem.deleteAria')}
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
