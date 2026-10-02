import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n/config'
import './index.css'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { consumeLaunch, setupPwa, type LaunchHandlers } from './lib/pwa'
import { useTaskStore } from './store/taskStore'

const launch: LaunchHandlers = {
  openView: (view) => useTaskStore.getState().selectView(view),
  // 通知の「予定どおり」はそのまま記録にし、「記録する」は時刻を直せる画面を開く
  record: ({ taskId, asPlanned }) => {
    const s = useTaskStore.getState()
    s.selectView('planner')
    if (asPlanned) s.logPlanAsPlanned(taskId)
    else s.openRecordPrompt(taskId)
  },
}
setupPwa(launch)
consumeLaunch(launch)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary scope="app">
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
