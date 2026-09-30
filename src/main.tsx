import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n/config'
import './index.css'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { consumeLaunchView, setupPwa } from './lib/pwa'
import { useTaskStore } from './store/taskStore'

setupPwa((view) => useTaskStore.getState().selectView(view))
const launchView = consumeLaunchView()
if (launchView) useTaskStore.getState().selectView(launchView)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
