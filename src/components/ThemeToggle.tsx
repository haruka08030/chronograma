import { useTaskStore } from '../store/taskStore'
import { useTranslation } from 'react-i18next'
import { MoonIcon, SunBrightIcon } from './icons'

export function ThemeToggle() {
  const { t } = useTranslation()
  const theme = useTaskStore((s) => s.theme)
  const toggleTheme = useTaskStore((s) => s.toggleTheme)

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      aria-label={t('theme.toggleAria')}
    >
      {theme === 'light' ? <MoonIcon className="w-5 h-5 text-zinc-500" /> : <SunBrightIcon className="w-5 h-5 text-zinc-400" />}
    </button>
  )
}
