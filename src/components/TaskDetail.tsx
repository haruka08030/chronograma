import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { isEventTask, isLogTask, type Task } from '../types/task'
import { ColorLabelPicker } from './labels/ColorLabelPicker'
import { SideSheet } from './ui/SideSheet'
import { TrashIcon } from './icons'
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
import { openTaskDetail } from '../lib/overlays'
import { rowIdOfTarget } from '../lib/touchLift'

/**
 * 詳細は常に右からのオーバーレイシート（行のタップで開き、外側タップ / ✕ で閉じる）。
 * 上から 題名 → 予定の欄（`TaskPlanFields`、予定を立てるタスクだけ）か記録の時刻（`LogTimeFields`）→ 場所 → メモ →
 * タグ（記録は色＝ラベル）→ 色・セクション → サブタスク。削除は右上の 🗑（スマホは上の帯の右）
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

  const detailBody = (
    <div className="p-6 space-y-6">
      {/* 毎週の予定: ここで選んだ範囲（この予定のみ / 以降すべて / すべて）に、下の欄の変更を当てる */}
      <SeriesScopeField task={task} />
      <TaskTitleField task={task} onClose={onClose} onDelete={handleDelete} deleteLabel={deleteLabel} />
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
        <button
          type="button"
          onClick={handleDelete}
          aria-label={deleteLabel}
          className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 touch-manipulation active:bg-zinc-100 dark:text-zinc-400 dark:active:bg-zinc-800"
        >
          <TrashIcon className="h-5 w-5" strokeWidth={1.75} />
        </button>
      }
      returnFocus={() =>
        Array.from(document.querySelectorAll<HTMLElement>(`[data-task-row="${CSS.escape(task.id)}"] [data-task-title]`)).find(
          (el) => el.getClientRects().length > 0,
        )
      }
      onBackdropPress={(e, root) => {
        // 幕の下の別の行を押したら、閉じずにその行の詳細へ替える（PC で 1 件ずつ見ていくとき。下のボタンは押さない）
        const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => !root?.contains(el))
        const id = rowIdOfTarget(under ?? null)
        if (!id || id === task.id) return false
        openTaskDetail(id)
        return true
      }}
    >
      {detailBody}
    </SideSheet>
  )
}
