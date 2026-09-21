import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore, type SmartView } from '../store/taskStore'
import { getAppInstallUrl } from '../lib/appInstallUrl'
import { useIsDesktop, useIsLargeScreen } from '../hooks/useMediaQuery'
import { isTodoNavView } from '../lib/todoSurfaceView'
import { TodoNavContent } from './TodoNavPanel'
import { SmartViewRow } from './SmartViewRow'

const STATS_SMART_VIEW: { id: SmartView; icon: string } = {
  id: 'stats',
  icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
}

const OTHER_VIEWS: { id: SmartView; icon: string }[] = [
  { id: 'calendar', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
  { id: 'plan-vs-actual', icon: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5' },
  { id: 'activity-log', icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'habits', icon: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z' },
]

const TODO_OPENER_ICON = 'M4.5 12.75l6 6 9-13.5'

const MENU_ICON_SETTINGS =
  'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z'
const MENU_ICON_USER =
  'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z'
const MENU_ICON_DOWNLOAD =
  'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3'

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const { t } = useTranslation()
  const selectedView = useTaskStore((s) => s.selectedView)
  const selectView = useTaskStore((s) => s.selectView)
  const openSettingsWithScroll = useTaskStore((s) => s.openSettingsWithScroll)
  const notificationsEnabled = useTaskStore((s) => s.notificationsEnabled)
  const toggleNotifications = useTaskStore((s) => s.toggleNotifications)
  const isDesktop = useIsDesktop()
  const isLargeScreen = useIsLargeScreen()
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRootRef = useRef<HTMLDivElement>(null)
  const accountMenuFirstItemRef = useRef<HTMLButtonElement>(null)

  const onTodoView = isTodoNavView(selectedView)

  const handleNav = (cb: () => void) => {
    cb()
    onClose?.()
  }

  const installUrl = getAppInstallUrl()

  useEffect(() => {
    if (!accountMenuOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      const root = accountMenuRootRef.current
      if (root && !root.contains(e.target as Node)) setAccountMenuOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [accountMenuOpen])

  useEffect(() => {
    if (accountMenuOpen) accountMenuFirstItemRef.current?.focus()
  }, [accountMenuOpen])

  // lg 未満は `TodoNavPanel` を置く横幅がないので、サブナビをサイドバーに畳み込む。
  // リスト行は DnD id を持つため、常に「表示されている一枚」にだけ描画する。
  // md 未満はドロワーの下端が `MobileBottomNav` に隠れるので、その分の余白を空ける。
  const renderSidebarContent = (withTodoNav: boolean) => (
    <aside className="w-60 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50
                       flex flex-col h-full pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <div className="px-4 pt-5 pb-3 flex items-center gap-2 min-w-0">
        <div className="relative shrink-0" ref={accountMenuRootRef}>
          <button
            type="button"
            onClick={() => setAccountMenuOpen((o) => !o)}
            aria-label={t('sidebar.accountMenu')}
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            title={t('sidebar.accountMenu')}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors
              ${selectedView === 'settings' || accountMenuOpen
                ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={MENU_ICON_USER} />
            </svg>
          </button>
          {accountMenuOpen ? (
            <div
              role="menu"
              aria-label={t('sidebar.accountMenuAria')}
              className="absolute left-0 top-full z-[100] mt-1.5 min-w-[12rem] rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
            >
              <button
                ref={accountMenuFirstItemRef}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700/80"
                onClick={() => {
                  handleNav(() => openSettingsWithScroll('appearance'))
                  setAccountMenuOpen(false)
                }}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={MENU_ICON_SETTINGS} />
                </svg>
                {t('sidebar.settings')}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700/80"
                onClick={() => {
                  handleNav(() => openSettingsWithScroll('account'))
                  setAccountMenuOpen(false)
                }}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={MENU_ICON_USER} />
                </svg>
                {t('sidebar.account')}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!installUrl}
                title={
                  installUrl
                    ? t('sidebar.getAppTitleOn')
                    : t('sidebar.getAppTitleOff')
                }
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45 dark:text-zinc-200 dark:hover:bg-zinc-700/80 dark:disabled:hover:bg-transparent"
                onClick={() => {
                  if (!installUrl) return
                  window.open(installUrl, '_blank', 'noopener,noreferrer')
                  handleNav(() => {})
                  setAccountMenuOpen(false)
                }}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={MENU_ICON_DOWNLOAD} />
                </svg>
                {t('sidebar.getApp')}
              </button>
            </div>
          ) : null}
        </div>
        <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight truncate min-w-0">
          {t('sidebar.brand')}
        </span>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-1 space-y-0.5">
        <button
          type="button"
          onClick={() => {
            setAccountMenuOpen(false)
            if (!onTodoView) selectView('all')
          }}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors
            ${onTodoView
              ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300 font-medium'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={TODO_OPENER_ICON} />
          </svg>
          <span className="flex-1">{t('sidebar.todo')}</span>
        </button>

        {withTodoNav ? (
          <div className="ml-3 space-y-0.5 border-l border-zinc-200 pl-1 dark:border-zinc-800">
            <TodoNavContent onNavigate={onClose} />
          </div>
        ) : null}

        {OTHER_VIEWS.map((v) => (
          <SmartViewRow
            key={v.id}
            view={v.id}
            icon={v.icon}
            isSelected={selectedView === v.id}
            onSelect={() => handleNav(() => selectView(v.id))}
          />
        ))}
      </nav>

      {/* サブナビ展開時はナビがスクロールするので、固定行との境界を線で示す */}
      <div className="shrink-0 border-t border-zinc-200 px-2 pb-1 pt-1 dark:border-zinc-800">
        <SmartViewRow
          view={STATS_SMART_VIEW.id}
          icon={STATS_SMART_VIEW.icon}
          isSelected={selectedView === STATS_SMART_VIEW.id}
          onSelect={() => handleNav(() => selectView(STATS_SMART_VIEW.id))}
        />
      </div>

      <div className="mx-4 mb-2 border-t border-zinc-200 dark:border-zinc-800 shrink-0" />

      <div className="px-2 pb-4 space-y-0.5">
        <button
          onClick={toggleNotifications}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 dark:text-zinc-500
                     hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800
                     rounded-lg transition-colors"
        >
          <svg className={`w-4 h-4 ${notificationsEnabled ? 'text-accent-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          {notificationsEnabled ? t('sidebar.notificationsOn') : t('sidebar.notificationsOff')}
        </button>
      </div>
    </aside>
  )

  // md〜lg 未満は常設サイドバー側、md 未満はドロワー側に出す（同時に描画しない）
  const inlineTodoNavInFixed = isDesktop && !isLargeScreen && onTodoView
  const inlineTodoNavInDrawer = !isDesktop && onTodoView

  if (open !== undefined) {
    // 常設とドロワーは CSS で出し分けず片方だけマウントする（state / ref の共有を避ける）
    if (isDesktop) {
      return (
        <div className="flex h-full min-h-0 shrink-0 self-stretch">
          {renderSidebarContent(inlineTodoNavInFixed)}
        </div>
      )
    }
    if (!open) return null
    return (
      <div className="fixed inset-0 z-40 flex" onClick={onClose}>
        <div className="absolute inset-0 bg-black/30" />
        <div
          className="relative animate-slide-in-left bg-white dark:bg-zinc-900"
          onClick={(e) => e.stopPropagation()}
        >
          {renderSidebarContent(inlineTodoNavInDrawer)}
        </div>
      </div>
    )
  }

  return renderSidebarContent(inlineTodoNavInDrawer || inlineTodoNavInFixed)
}
