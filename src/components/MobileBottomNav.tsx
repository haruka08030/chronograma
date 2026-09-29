import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore, type SmartView } from '../store/taskStore'
import { isTodoSurfaceView } from '../lib/todoSurfaceView'

type TabId = 'planner' | 'todo' | 'calendar' | 'log' | 'more'

/** 1 日の計画アプリなので先頭は「今日」。習慣の日々のチェックは「今日」にあり、一覧は「その他」から */
const TAB_VIEWS: Record<Exclude<TabId, 'todo' | 'more'>, SmartView> = {
  planner: 'planner',
  calendar: 'calendar',
  log: 'activity-log',
}

export function MobileBottomNav({
  onOpenMore,
  onNavigate,
}: {
  onOpenMore: () => void
  /** タブでビューを切り替えたとき（開いているサイドバードロワーを閉じる） */
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const selectedView = useTaskStore((s) => s.selectedView)
  const selectView = useTaskStore((s) => s.selectView)
  const selectList = useTaskStore((s) => s.selectList)
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery)
  const selectedListId = useTaskStore((s) => s.selectedListId)

  const active: TabId = (() => {
    if (selectedView === 'calendar' || selectedView === 'plan-vs-actual') return 'calendar'
    if (selectedView === 'activity-log') return 'log'
    if (selectedView === 'planner') return 'planner'
    if (isTodoSurfaceView(selectedView)) return 'todo'
    return 'more'
  })()

  const go = (tab: TabId) => {
    setSearchQuery('')
    if (tab === 'more') {
      onOpenMore()
      return
    }
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
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      ),
    },
    {
      id: 'todo',
      label: t('nav.todo'),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'calendar',
      label: t('nav.calendar'),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      ),
    },
    {
      id: 'log',
      label: t('nav.log'),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'more',
      label: t('nav.more'),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      ),
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
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 touch-manipulation transition-colors
                ${isActive
                  ? 'text-accent-600 dark:text-accent-400'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.icon}
              <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
