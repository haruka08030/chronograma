import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { isEventTask, isLogTask, type Task } from '../types/task'
import { ColorLabelPicker } from './labels/ColorLabelPicker'
import { SideSheet } from './ui/SideSheet'
import { EllipsisIcon, TrashIcon } from './icons'
import { openTaskMenu } from '../lib/overlays'
import { TaskTitleField } from './detail/TaskTitleField'
import { TaskMemoField } from './detail/TaskMemoField'
import { TaskLocationField } from './detail/TaskLocationField'
import { TaskPlanFields } from './detail/TaskPlanFields'
import { LogTimeFields } from './detail/LogTimeFields'
import { TaskTagsField } from './detail/TaskTagsField'
import { TaskColorSectionFields } from './detail/TaskColorSectionFields'
import { SubtasksField } from './detail/SubtasksField'
import { SeriesScopeField } from './detail/SeriesScopeField'
import { deleteTaskAsking } from '../lib/seriesScope'

/**
 * 詳細は常に右からのオーバーレイシート（行のタップで開き、外側タップ / ✕ で閉じる）。
 * 上から 題名 → 予定の欄（`TaskPlanFields`、予定を立てるタスクだけ）か記録の時刻（`LogTimeFields`）→ 場所 → メモ →
 * タグ（記録は色＝ラベル）→ 色・セクション → サブタスク。削除は右上の 🗑（スマホは上の帯の右）。
 * その左の … は行の右クリックと同じタスクのメニュー（記録には出さない）。PC の行は右クリック・ホバーでしか出ない操作
 * （複製・明日へ回す・記録を始める・リストへ移す、夢のかなえた・移す）も、ここから見えるボタンでできる
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
  const isLog = isLogTask(task)
  const lists = useTaskStore((s) => s.lists)
  // いつか・チェックリストには締切や予定を付けない（付けると期限のビューに戻ってきてしまう）
  const listKind = lists.find((l) => l.id === task.listId)?.kind ?? 'tasks'
  const plannable = listKind === 'tasks'

  // ゴミ箱行き + ⌘Z で戻せるので、一覧の削除と同じく確認は出さない（記録も同じ）。毎週の予定だけは範囲を聞く
  const handleDelete = () => {
    void deleteTaskAsking(task.id).then((ok) => ok && onClose())
  }

  const deleteLabel = t(isLog ? 'taskDetail.deleteLog' : 'taskDetail.deleteTask')

  // … のメニュー。消した・アーカイブしたら詳細も閉じる（詳細の 🗑 と同じ）
  const openMore = isLog
    ? undefined
    : (anchor: HTMLElement) => {
        const r = anchor.getBoundingClientRect()
        openTaskMenu({
          kind: 'task',
          x: r.left,
          y: r.bottom + 4,
          taskIds: [task.id],
          inDetail: true,
          onDone: () => {
            const cur = useTaskStore.getState().tasks.find((x) => x.id === task.id)
            if (!cur || cur.deletedAt || cur.archivedAt) onClose()
          },
        })
      }

  const detailBody = (
    <div className="p-6 space-y-6">
      {/* 毎週の予定: ここで選んだ範囲（この予定のみ / 以降すべて / すべて）に、下の欄の変更を当てる */}
      <SeriesScopeField task={task} />
      <TaskTitleField task={task} onClose={onClose} onDelete={handleDelete} deleteLabel={deleteLabel} onMore={openMore} />
      {/* 日時は題名のすぐ下（Google カレンダー・右クリックのメニュー・追加欄のチップと同じ順） */}
      {!isLog && plannable && <TaskPlanFields task={task} />}
      {isLog && <LogTimeFields task={task} />}
      <TaskLocationField task={task} />
      <TaskMemoField task={task} isLog={isLog} />

      {isLog ? (
        // 見出しは付けない（ボタンに色とラベル名が出るので重ねない）
        <ColorLabelPicker task={task} />
      ) : (
        <TaskTagsField task={task} />
      )}

      {!isLog && (
        <>
          <TaskColorSectionFields task={task} />
          {/* 予定にはサブタスクを付けない */}
          {!isEventTask(task) && <SubtasksField task={task} />}
        </>
      )}
    </div>
  )

  return (
    <SideSheet
      label={task.title}
      closing={closing}
      onClose={onClose}
      mobileActions={
        <>
          {openMore && (
            <button
              type="button"
              onClick={(e) => openMore(e.currentTarget)}
              aria-haspopup="menu"
              aria-label={t('taskItem.moreMenuAria')}
              className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 touch-manipulation active:bg-zinc-100 dark:text-zinc-400 dark:active:bg-zinc-800"
            >
              <EllipsisIcon className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            aria-label={deleteLabel}
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 touch-manipulation active:bg-zinc-100 dark:text-zinc-400 dark:active:bg-zinc-800"
          >
            <TrashIcon className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </>
      }
      returnFocus={() =>
        Array.from(document.querySelectorAll<HTMLElement>(`[data-task-row="${CSS.escape(task.id)}"] [data-task-title]`)).find(
          (el) => el.getClientRects().length > 0,
        )
      }
    >
      {detailBody}
    </SideSheet>
  )
}
