import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { isEventTask, isLogTask, type Task } from '../types/task'
import { ColorLabelPicker } from './labels/ColorLabelPicker'
import { useEscapeLayer } from '../hooks/useHotkey'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { ChevronLeftIcon } from './icons'
import { buttonClass } from './ui/buttonClass'
import { TaskTitleField } from './detail/TaskTitleField'
import { TaskMemoField } from './detail/TaskMemoField'
import { TaskLocationField } from './detail/TaskLocationField'
import { TaskPlanFields } from './detail/TaskPlanFields'
import { LogTimeFields } from './detail/LogTimeFields'
import { TaskTagsField } from './detail/TaskTagsField'
import { TaskListFields } from './detail/TaskListFields'
import { SubtasksField } from './detail/SubtasksField'

/**
 * 詳細は常に右からのオーバーレイシート（行のタップで開き、外側タップ / ✕ で閉じる）。
 * 上から 題名 → メモ → 場所 → 予定の欄（`TaskPlanFields`、予定を立てるタスクだけ）か記録の時刻（`LogTimeFields`）→
 * タグ（記録は色＝ラベル）→ リスト・色・セクション → サブタスク → 削除
 */
export function TaskDetail({
  task,
  closing = false,
  onClose,
}: {
  task: Task
  /** 閉じる動きの最中（押せないようにして右へ引っ込める） */
  closing?: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  // Esc で閉じる（上に日付ピッカーなどが開いていればそちらが先）
  useEscapeLayer(onClose)
  // Tab は詳細の中だけを巡回し、閉じたら開いた行（の題名）へフォーカスを戻す
  const panelRef = useRef<HTMLDivElement>(null)
  const trapTab = useFocusTrap(panelRef, {
    active: !closing,
    returnFocus: () =>
      Array.from(document.querySelectorAll<HTMLElement>(`[data-task-row="${CSS.escape(task.id)}"] [data-task-title]`)).find(
        (el) => el.getClientRects().length > 0,
      ),
  })
  const isLog = isLogTask(task)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const lists = useTaskStore((s) => s.lists)
  // いつか・チェックリストには締切や予定を付けない（付けると期限のビューに戻ってきてしまう）
  const listKind = lists.find((l) => l.id === task.listId)?.kind ?? 'tasks'
  const plannable = listKind === 'tasks'

  // ゴミ箱行き + ⌘Z で戻せるので、一覧の削除と同じく確認は出さない（記録も同じ）
  const handleDelete = () => {
    deleteTask(task.id)
    onClose()
  }

  const detailBody = (
    <div className="p-6 space-y-6">
      <TaskTitleField task={task} onClose={onClose} />
      <TaskMemoField task={task} isLog={isLog} />
      <TaskLocationField task={task} />
      {!isLog && plannable && <TaskPlanFields task={task} />}
      {isLog && <LogTimeFields task={task} />}

      {isLog ? (
        // 見出しは付けない（ボタンに色とラベル名が出るので重ねない）
        <ColorLabelPicker task={task} />
      ) : (
        <TaskTagsField task={task} />
      )}

      {!isLog && (
        <>
          <TaskListFields task={task} />
          {/* 予定にはサブタスクを付けない */}
          {!isEventTask(task) && <SubtasksField task={task} />}
        </>
      )}

      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <button type="button" onClick={handleDelete} className={buttonClass({ variant: 'danger', size: 'md' }, 'w-full')}>
          {t(isLog ? 'taskDetail.deleteLog' : 'taskDetail.deleteTask')}
        </button>
      </div>
    </div>
  )

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- 背景を押して閉じるのはマウス・指の近道（キーは Esc）。onKeyDown は Tab を中に留めるため
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose} onKeyDown={trapTab} inert={closing}>
      <div className={`absolute inset-0 bg-black/20 dark:bg-black/40 ${closing ? 'animate-fade-out' : 'animate-fade-in'}`} />
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- 外へクリックを伝えないだけ（押して何かする部品ではない） */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
        tabIndex={-1}
        className={`relative w-full outline-none max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-700 dark:shadow-[-8px_0_24px_rgba(0,0,0,0.5)]
                   h-full overflow-y-auto overscroll-contain shadow-xl ${closing ? 'animate-slide-out' : 'animate-slide-in'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* スマホだけ: 上に固定した戻る（Google Tasks と同じ）。下までスクロールしても閉じられる */}
        <div className="sticky top-0 z-10 flex items-center border-b border-zinc-100 bg-white/95 px-1 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 md:hidden">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-600 touch-manipulation active:bg-zinc-100 dark:text-zinc-300 dark:active:bg-zinc-800"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
        </div>
        {detailBody}
      </div>
    </div>
  )
}
