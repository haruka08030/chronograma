import type { ActiveTimerIo } from '../lib/timerSync'
import { asIncomingChange } from '../lib/changeOrigin'
import { useTaskStore } from '../store/taskStore'
import { timerLogTask } from '../store/slices/timeLogs'

/** 動いているタイマーの同期（`timerSync.ts`）がストアを読み書きする口 */
export const storeActiveTimerIo: ActiveTimerIo = {
  read: () => {
    const s = useTaskStore.getState()
    return { timer: s.activeTimer, updatedAt: s.activeTimerUpdatedAt }
  },
  apply: (timer, updatedAt) => asIncomingChange(() => useTaskStore.setState({ activeTimer: timer, activeTimerUpdatedAt: updatedAt })),
  setUpdatedAt: (at) => asIncomingChange(() => useTaskStore.setState({ activeTimerUpdatedAt: at })),
  // 別の端末で知らずに動いていたほうを記録にして、▶ の切り替えと同じく知らせる。記録はこの端末の変更として送る
  record: ({ timer, endedAt }) => {
    const s = useTaskStore.getState()
    const log = timerLogTask(timer, endedAt, s.tasks)
    if (log) useTaskStore.setState({ tasks: [...s.tasks, log] })
    // 1 分未満は記録に残らない（`timerLogTask` が null）ので「保存して」とは言わない
    s.showMoveBanner({ key: log ? 'quickLog.switched' : 'quickLog.switchedUnsaved', params: { title: timer.taskTitle } })
  },
}
