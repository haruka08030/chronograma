import { createRoot } from 'react-dom/client'
import { SeriesScopeDialog } from '../components/ui/SeriesScopeDialog'
import { useTaskStore } from '../store/taskStore'
import { hasOtherOccurrences, type SeriesScope } from './eventSeries'

/**
 * 毎週の予定を消す範囲を聞く（取消なら null）。`askConfirm` と同じく、呼ぶたびに body に置いて答えたら片付ける
 */
export function askSeriesScope(title: string): Promise<SeriesScope | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const done = (scope: SeriesScope | null) => {
      root.unmount()
      host.remove()
      resolve(scope)
    }
    root.render(<SeriesScopeDialog title={title} onResult={done} />)
  })
}

/**
 * 予定・To-Do をゴミ箱へ。ほかにも回がある毎週の予定なら、先に範囲（この予定のみ / 以降すべて / すべて）を聞く。
 * 消したら true（取消したら false）
 */
export async function deleteTaskAsking(taskId: string): Promise<boolean> {
  const { tasks, deleteTask } = useTaskStore.getState()
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return false
  if (!hasOtherOccurrences(tasks, task)) {
    deleteTask(taskId)
    return true
  }
  const scope = await askSeriesScope(task.title)
  if (!scope) return false
  return useTaskStore.getState().deleteEventSeries(taskId, scope) > 0
}
