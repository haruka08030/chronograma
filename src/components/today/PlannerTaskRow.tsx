import { RowColorLine } from '../ui/RowColorLine'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { startTaskDrag } from '../../lib/taskDrag'
import { startNativeTaskDragGhost } from '../../lib/nativeTaskDragGhost'
import { openTaskMenu } from '../../lib/overlays'
import { tip } from '../../lib/tooltip'
import { CARRY_SHOW_DAYS, carriedDaysOn } from '../../lib/carryDays'
import type { RowSwipeAction } from '../../hooks/useRowSwipe'
import type { useTaskListSelection } from '../../hooks/useTaskListSelection'
import type { useDeferredComplete } from '../../hooks/useDeferredComplete'
import { CalendarArrowIcon, CheckIcon, PostponeIcon } from '../icons'
import { GestureRow } from '../ui/GestureRow'
import { CompletionCircle } from '../ui/CompletionCircle'
import { HIDE_ON_ROW_HOVER } from '../ui/revealClass'
import { ROW_CURSOR_CLASS, ROW_PRESS_CLASS, ROW_SELECTED_CLASS } from '../ui/rowStateClass'
import { chipClass } from '../ui/chipClass'
import { META_TONE_CLASS, rowMeta, type DueMode, type PlannerDay } from './plannerRowMeta'

type Selection = ReturnType<typeof useTaskListSelection>

/** 今日の計画の行が共通で使うもの（見ている日・選択・完了の遅延・行を開く） */
export type PlannerRowEnv = {
  day: PlannerDay
  viewingToday: boolean
  /** キー操作・選択の対象の行 */
  rowIds: readonly string[]
  selectedCount: number
  makeSelection: Selection['makeSelection']
  makeRowClick: Selection['makeRowClick']
  openDetail: (id: string) => void
  deferredComplete: ReturnType<typeof useDeferredComplete>
  isCoarse: boolean
}

/**
 * 今日の計画の 1 行（完了の丸・題名・タグ・時刻と締切・右端の操作）。
 * `hoverActions`: 右端の操作が乗せたときだけ出る行（今日やる・期限切れ）。乗せている間は時刻・締切と入れ替える
 */
export function PlannerTaskRow({
  task,
  env,
  action,
  dueMode = 'all',
  hoverActions = false,
  lead,
  dueOverHint,
}: {
  task: Task
  env: PlannerRowEnv
  action?: ReactNode
  dueMode?: DueMode
  hoverActions?: boolean
  /** 題名の前に置く短い語（スマホの「今」「次」） */
  lead?: ReactNode
  /** 締切までの見積もりが空きに入りきらない（#332）ときの数字。締切の文字を締切の赤にして、数字はツールチップ */
  dueOverHint?: string
}) {
  const { t } = useTranslation()
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  const { day, viewingToday, rowIds, selectedCount, makeSelection, makeRowClick, openDetail, deferredComplete, isCoarse } = env
  const metaHide = hoverActions ? HIDE_ON_ROW_HOVER : ''
  const meta = rowMeta(task, dueMode, day)
  // サブタスク（企業の下の ES 締切など）は親の名前を題名の下に小さく添える
  const parentTitle = useTaskStore((s) => (task.parentId ? (s.tasks.find((x) => x.id === task.parentId)?.title ?? null) : null))
  const hasRowExtras = !task.completed && (task.tags.length > 0 || !!parentTitle)
  // 続けて持ち越した日数（今日を見ているときの、やり残し・今日やる行だけ）。2 日以上で「3日目」。
  // 締切が過ぎた行は「2日遅れ」が出ているので重ねない
  const carried = viewingToday && (dueMode === 'all' || dueMode === 'urgent') ? carriedDaysOn(task, day.dateKey) : 0
  const showCarry = carried >= CARRY_SHOW_DAYS && meta.due?.tone !== 'overdue'
  const sel = rowIds.includes(task.id) ? makeSelection(task.id) : null
  // 選べる行は listbox の option（名前は題名、選んでいるかは aria-selected）
  const optionId = sel?.optionId
  // スマホ: 右へ払うと完了、左へ払うと今日やる行は明日へ・それ以外は今日（この日）へ。長押しで浮かせて選択に入れる
  const committed = dueMode === 'urgent'
  const swipeLeft: RowSwipeAction = committed
    ? {
        label: viewingToday ? t('taskMenu.toTomorrow') : t('taskMenu.toNextDay'),
        icon: <PostponeIcon className="h-4 w-4" />,
        tone: 'date',
        run: () => rescheduleTasks([task.id], day.tomorrowKey),
      }
    : {
        label: viewingToday ? t('planner.doToday') : t('planner.doThisDay'),
        icon: <CalendarArrowIcon className="h-4 w-4" />,
        tone: 'date',
        run: () => rescheduleTasks([task.id], day.dateKey),
      }
  return (
    <GestureRow
      enabled={isCoarse && !task.completed && selectedCount === 0}
      right={{
        label: t('taskList.selectionComplete'),
        icon: <CheckIcon className="h-4 w-4" strokeWidth={2.5} />,
        tone: 'done',
        run: () => deferredComplete.toggle(task.id, false),
      }}
      left={swipeLeft}
      liftId={sel ? task.id : undefined}
      outerClassName={deferredComplete.isLeaving(task.id) ? 'animate-row-collapse overflow-hidden' : ''}
      className={`group/row relative flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${ROW_PRESS_CLASS}
        ${sel?.selected ? ROW_SELECTED_CLASS : ''} ${sel?.cursor ? ROW_CURSOR_CLASS : ''}`}
      itemRole={optionId ? 'none' : undefined}
      rowProps={{
        'data-task-row': task.id,
        ...(optionId
          ? { id: optionId, role: 'option', 'aria-selected': Boolean(sel?.selected), 'aria-labelledby': `${optionId}-title` }
          : {}),
        draggable: !task.completed,
        onDragStart: (e) => {
          startTaskDrag(e, task.id)
          startNativeTaskDragGhost(e, task.title)
        },
        // To-Do 一覧と同じタスクのメニュー（選んでいる行なら選んでいる全部に）
        onContextMenu: (e) => {
          e.preventDefault()
          if (sel?.onContextMenu) sel.onContextMenu(e)
          else openTaskMenu({ kind: 'task', x: e.clientX, y: e.clientY, taskIds: [task.id] })
        },
      }}
    >
      {/* ラベルの色は左の細い線（To-Do の一覧と同じ。丸は状態だけ、#511）。済んだ行には出さない */}
      {task.color && !task.completed && <RowColorLine hex={task.color} />}
      <CompletionCircle
        completed={task.completed || deferredComplete.isPending(task.id)}
        justCompleted={deferredComplete.isPending(task.id)}
        priority={task.priority}
        inert={selectedCount > 0}
        onClick={() => deferredComplete.toggle(task.id, task.completed)}
        label={t('taskItem.completeItem', { title: task.title })}
      />
      {lead && <span className="shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400">{lead}</span>}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          id={optionId ? `${optionId}-title` : undefined}
          // ⌘・Shift で選ぶ、選んでいる間は押すと選ぶ・外す、ふだんは詳細（To-Do 一覧と同じ）
          onClick={(e) => (sel ? makeRowClick(task.id)(e) : openDetail(task.id))}
          className={`block w-full truncate text-left text-[15px] transition-colors ${hasRowExtras ? 'pt-2' : 'py-2.5'} ${
            task.completed || deferredComplete.isPending(task.id)
              ? 'text-zinc-400 line-through dark:text-zinc-500'
              : 'text-zinc-800 dark:text-zinc-100'
          }`}
        >
          {task.title}
        </button>
        {/* タイトルの下にタグ。リンクの「開く」は幅が狭いので出さない（タイムラインのカード・詳細から開く） */}
        {hasRowExtras && (
          <div className="flex flex-wrap items-center gap-1 pb-2 pt-0.5">
            {parentTitle && (
              <span data-parent-title className="max-w-full truncate text-xs text-zinc-500 dark:text-zinc-400">
                {parentTitle}
              </span>
            )}
            {task.tags.map((tag) => (
              <span key={tag} className={chipClass({ variant: 'fill' })}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      {showCarry && (
        <span
          data-carry-days={carried}
          {...tip(t('planner.carryDaysHint', { count: carried }))}
          className={`shrink-0 text-xs tabular-nums ${META_TONE_CLASS.muted} ${metaHide}`}
        >
          {t('planner.carryDay', { count: carried + 1 })}
          <span className="sr-only"> {t('planner.carryDaysHint', { count: carried })}</span>
        </span>
      )}
      {meta.due && !task.completed && (
        <span
          data-due-fit={dueOverHint ? 'over' : undefined}
          {...tip(dueOverHint)}
          className={`shrink-0 text-xs tabular-nums ${dueOverHint ? META_TONE_CLASS.overdue : META_TONE_CLASS[meta.due.tone]} ${metaHide}`}
        >
          {meta.due.text}
          {dueOverHint && <span className="sr-only"> {dueOverHint}</span>}
        </span>
      )}
      {meta.time && !task.completed && (
        <span className={`shrink-0 text-xs tabular-nums ${meta.timeOver ? META_TONE_CLASS.passed : META_TONE_CLASS.muted} ${metaHide}`}>
          {meta.time}
        </span>
      )}
      {action}
    </GestureRow>
  )
}
