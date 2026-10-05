import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore, type SmartView } from '../store/taskStore'
import { isTodoNavView } from '../lib/todoSurfaceView'
import { CalendarIcon, CheckCircleIcon, HabitIcon, SettingsIcon, SunIcon } from './icons'

type TabId = 'planner' | 'todo' | 'calendar' | 'habits' | 'settings'

/** 1 日の計画アプリなので先頭は「今日」。記録と習慣の日々のチェックも「今日」にある */
const TAB_VIEWS: Record<Exclude<TabId, 'todo'>, SmartView> = {
  planner: 'planner',
  calendar: 'calendar',
  habits: 'habits',
  settings: 'settings',
}

export function MobileBottomNav({
  onNavigate,
}: {
  /** タブでビューを切り替えたとき（開いているドロワーを閉じる） */
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const selectedView = useTaskStore((s) => s.selectedView)
  const selectView = useTaskStore((s) => s.selectView)
  const selectList = useTaskStore((s) => s.selectList)
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery)
  const selectedListId = useTaskStore((s) => s.selectedListId)

  const active: TabId = (() => {
    if (selectedView === 'calendar') return 'calendar'
    // 統計は「今日」の見出しから開く（記録の延長）
    if (selectedView === 'planner' || selectedView === 'stats') return 'planner'
    if (selectedView === 'habits') return 'habits'
    if (isTodoNavView(selectedView)) return 'todo'
    return 'settings'
  })()

  const go = (tab: TabId) => {
    setSearchQuery('')
    onNavigate?.()
    if (tab === 'todo') {
      if (selectedListId) selectList(selectedListId)
      else selectView('today')
      return
    }
    selectView(TAB_VIEWS[tab])
  }

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    {
      id: 'planner',
      label: t('nav.planner'),
      icon: <SunIcon className="h-5 w-5" strokeWidth={1.75} />,
    },
    {
      id: 'todo',
      label: t('nav.todo'),
      icon: <CheckCircleIcon className="h-5 w-5" strokeWidth={1.75} />,
    },
    {
      id: 'calendar',
      label: t('nav.calendar'),
      icon: <CalendarIcon className="h-5 w-5" strokeWidth={1.75} />,
    },
    {
      id: 'habits',
      label: t('nav.habits'),
      icon: <HabitIcon className="h-5 w-5" strokeWidth={1.75} />,
    },
    {
      id: 'settings',
      label: t('nav.settings'),
      icon: <SettingsIcon className="h-5 w-5" strokeWidth={1.75} />,
    },
  ]

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[45] border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95 md:hidden"
      aria-label={t('nav.aria')}
    >
      <div className="flex h-14 items-stretch">
        {tabs.map((tab) => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => go(tab.id)}
              className={`group flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 touch-manipulation transition-colors
                ${
                  isActive
                    ? 'text-accent-600 dark:text-accent-400'
                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Google のアプリと同じく、選んでいるタブはアイコンの後ろに薄いピル。押している間も同じ形で薄く出す */}
              <span
                className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${
                  isActive ? 'bg-accent-100' : 'group-active:bg-zinc-100 dark:group-active:bg-zinc-800'
                }`}
              >
                {tab.icon}
              </span>
              <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
