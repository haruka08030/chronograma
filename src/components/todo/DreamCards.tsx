import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDroppable } from '@dnd-kit/core'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { dreamSteps, stepDateKey, TIER_DROP_PREFIX } from '../../lib/somedayTier'
import { formatShortDateWeekday } from '../../lib/dateFormat'
import { openTaskDetail, openTaskMenu } from '../../lib/overlays'
import { useLongPress } from '../../hooks/useLongPress'
import { useDeferredComplete } from '../../hooks/useDeferredComplete'
import { CompletionCircle } from '../ui/CompletionCircle'
import { GROUP_HEADING_TEXT } from '../ListSectionHeading'

/** 夢の 1 枚。押すと詳細（一歩の追加・並べ替えはそこで）、右クリック・長押しで行と同じメニュー、☆ でかなえる */
function DreamCard({ task, className }: { task: Task; className: string }) {
  const { t, i18n } = useTranslation()
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deferredComplete = useDeferredComplete(toggleTask)
  const justCompleted = deferredComplete.isPending(task.id)
  // 描き直しを抑えるため文字 1 つで受け取る（次の一歩・その日付・進み具合）
  const stepKey = useTaskStore((s) => {
    const steps = dreamSteps(s.tasks, task.id)
    return steps ? [steps.next?.title ?? '', stepDateKey(steps.next) ?? '', `${steps.done}/${steps.total}`].join('\u0000') : ''
  })
  const [nextTitle, nextDate, progress] = stepKey ? stepKey.split('\u0000') : ['', '', '']
  const openMenu = (x: number, y: number) => openTaskMenu({ kind: 'task', x, y, taskIds: [task.id] })
  const longPress = useLongPress((e) => openMenu(e.clientX, e.clientY))
  return (
    <div
      data-task-row={task.id}
      {...longPress.pointerHandlers}
      onClickCapture={longPress.onClickCapture}
      onContextMenu={(e) => {
        e.preventDefault()
        // 長押しで出る OS のメニューは抑え、長押しのほうで開く
        if (longPress.isPressing()) return
        openMenu(e.clientX, e.clientY)
      }}
      style={{ WebkitTouchCallout: 'none' }}
      className={`${className} relative flex min-w-0 select-none flex-col gap-1 rounded-xl border border-zinc-200 px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="relative z-10 -ml-0.5 shrink-0">
          <CompletionCircle
            completed={task.completed || justCompleted}
            justCompleted={justCompleted}
            priority={task.priority}
            shape="star"
            onClick={(e) => {
              e.stopPropagation()
              deferredComplete.toggle(task.id, task.completed)
            }}
            label={t('someday.fulfillItem', { title: task.title })}
          />
        </span>
        {/* カード全体を押せるよう、題名のボタンを枠いっぱいに広げる */}
        <button
          type="button"
          onClick={() => openTaskDetail(task.id)}
          className="min-w-0 flex-1 text-left text-sm text-zinc-800 outline-none line-clamp-2 after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-accent-400/50 dark:text-zinc-200"
        >
          {task.title}
        </button>
      </div>
      {stepKey ? (
        <div className="flex min-w-0 items-baseline gap-2 pl-7 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="min-w-0 flex-1 truncate">{nextTitle ? t('someday.nextStep', { title: nextTitle }) : null}</span>
          {nextTitle ? (
            <span className="shrink-0 tabular-nums">
              {nextDate ? formatShortDateWeekday(nextDate, i18n.resolvedLanguage) : t('someday.stepUndated')}
            </span>
          ) : null}
          <span className="shrink-0 tabular-nums" aria-label={t('someday.stepProgressAria', { progress })}>
            {progress}
          </span>
        </div>
      ) : null}
    </div>
  )
}

/** 横の 1 列がはみ出しているか（カードの数・画面の幅が変わったら測り直す） */
function useOverflowX(ref: React.RefObject<HTMLElement | null>, deps: unknown) {
  const [overflow, setOverflow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setOverflow(el.scrollWidth > el.clientWidth + 1)
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [ref, deps])
  return overflow
}

/**
 * いつかの夢（#429・#433）。一覧の上に、横にスクロールする 1 列で並べる（次のカードの端が見えて続きがあると分かる）。
 * 入りきらないときだけ見出しの右に「すべて見る」（折り返して全部並べる。もう一度押すと 1 列に戻す）。
 * 場所全体がドラッグの落とし先で、やりたいの行を落とすと夢へ移す。夢が無ければドラッグ中だけ出す
 */
export function DreamCards({ dreams, dragging }: { dreams: Task[]; dragging: boolean }) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: `${TIER_DROP_PREFIX}dream` })
  const [expanded, setExpanded] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const overflow = useOverflowX(rowRef, `${dreams.length}:${expanded}`)
  if (dreams.length === 0 && !dragging) return null
  const title = t('someday.tierDream')
  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      data-someday-tier="dream"
      className={`mb-2 rounded-xl pb-1 transition-colors ${isOver ? 'bg-accent-500/15 ring-1 ring-accent-400/40' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1">
        <h2 className={`py-0.5 ${GROUP_HEADING_TEXT}`}>{title}</h2>
        {overflow || expanded ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="-mr-2 rounded-lg px-2 py-0.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {expanded ? t('someday.collapseDreams') : t('someday.seeAllDreams')}
          </button>
        ) : null}
      </div>
      {dreams.length > 0 ? (
        <div
          ref={rowRef}
          className={
            expanded
              ? 'grid grid-cols-1 gap-2 px-1 sm:grid-cols-2 xl:grid-cols-3'
              : 'flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          }
        >
          {dreams.map((d) => (
            <DreamCard key={d.id} task={d} className={expanded ? '' : 'w-[min(18rem,82%)] shrink-0 snap-start'} />
          ))}
        </div>
      ) : (
        <div className="mx-2 min-h-12 rounded-md border border-dashed border-zinc-300 dark:border-zinc-600" aria-hidden />
      )}
    </section>
  )
}
