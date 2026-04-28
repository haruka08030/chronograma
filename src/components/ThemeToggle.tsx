import { useTaskStore } from '../store/taskStore'
import { useTranslation } from 'react-i18next'

export function ThemeToggle() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTaskStore()

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      aria-label={t('theme.toggleAria')}
    >
      {theme === 'light' ? (
        <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0112.003 21c-5.385 0-9.75-4.365-9.75-9.75 0-4.128 2.566-7.654 6.19-9.075a.75.75 0 01.964.942 8.25 8.25 0 0011.399 11.399.75.75 0 01.946.486z" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5M18.364 5.636l-1.06 1.06M21 12h-1.5M18.364 18.364l-1.06-1.06M12 19.5V21M5.636 18.364l1.06-1.06M3 12h1.5M5.636 5.636l1.06 1.06M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
        </svg>
      )}
    </button>
  )
}
