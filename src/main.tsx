import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n/config'
import './index.css'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { consumeLaunch, setupPwa, type LaunchHandlers } from './lib/pwa'
import { useTaskStore } from './store/taskStore'
import { requestQuickStart } from './lib/quickStart'
import { setupUrlHistory } from './lib/urlHistory'
import { installGlobalErrorReporting } from './lib/errorReport'
import { reloadForStaleChunk } from './lib/chunkLoad'
import { openTaskFromNotification, openWrapUpFromNotification, stopTimerFromNotification } from './lib/notificationLaunch'
import { closeTaskNotifications, installNotificationCleanup } from './lib/notificationCleanup'

const launch: LaunchHandlers = {
  openView: (view) => useTaskStore.getState().selectView(view),
  // 通知の「予定どおり」はそのまま記録にし、「記録する」は時刻を直せる画面を開く
  record: ({ taskId, asPlanned }) => {
    const s = useTaskStore.getState()
    s.selectView('planner')
    if (asPlanned) {
      s.logPlanAsPlanned(taskId)
      // 予定（完了の無いもの）は記録しても完了にならないので、同じ件の開始前の通知もここで閉じる
      void closeTaskNotifications(taskId)
    } else s.openRecordPrompt(taskId)
  },
  // 開始前・締切の通知はその To-Do・予定の詳細を開く
  openTask: ({ taskId, date }) => openTaskFromNotification(taskId, date),
  // 止め忘れの「止める」はそのタイマーを止めて、記録の終わりを直せる詳細を開く
  stopTimer: ({ startedAt }) => stopTimerFromNotification(startedAt),
  // 夜の締めは今日の計画の「1 日を締める」の所を見せる
  wrapUp: () => openWrapUpFromNotification(),
  add: () => useTaskStore.getState().requestQuickAdd(),
  // データ（ログイン中は最初の同期）がそろってから `useQuickStartLaunch` が始める
  start: (request) => requestQuickStart(request),
}
// デプロイ後に古いタブで別画面を開くと、古いファイル名がもう無くて読み込みに失敗する。
// 1 回だけ読み込み直して新しい版にする（失敗し続けるときに再読み込みを繰り返さないよう、1 分は空ける。
// オフラインでは読み込み直さない）。読み込み直さないときは `lazyNamed` が次に開くときに取り直す
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForStaleChunk()) event.preventDefault()
})

// iOS Safari は user-scalable=no を無視してピンチで拡大するので、ジェスチャーごと止める
for (const type of ['gesturestart', 'gesturechange'] as const) {
  document.addEventListener(type, (event) => event.preventDefault(), { passive: false })
}

// 拾われなかったエラーを記録する（ログイン中だけ送る。`client_errors`）
installGlobalErrorReporting()
// 済んだ件（完了・記録・削除、別の端末の完了も）の通知を通知センターから閉じる
installNotificationCleanup()
setupPwa(launch)
consumeLaunch(launch)
// 開いている画面を URL と履歴に載せる（起動 URL の `?view=` / `?list=` もここで開く）
setupUrlHistory()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary scope="app">
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
