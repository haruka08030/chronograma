import { useTranslation } from 'react-i18next'
import { useTaskStore, type SmartView } from '../store/taskStore'
import { useIsDesktop, useIsLargeScreen } from '../hooks/useMediaQuery'
import { useEscapeLayer } from '../hooks/useHotkey'
import { isTodoNavView } from '../lib/todoSurfaceView'
import { TodoNavContent } from './TodoNavPanel'
import { SmartViewRow } from './SmartViewRow'
import { SyncIndicator } from './SyncIndicator'
import { ICON_PATHS } from '../lib/iconPaths'
import { PathIcon } from './PathIcon'
import { usePresence } from '../hooks/usePresence'

const STATS_SMART_VIEW: { id: SmartView; icon: string } = {
  id: 'stats',
  icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
}

const PLANNER_VIEW: { id: SmartView; icon: string } = {
  id: 'planner',
  icon: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z',
}

const OTHER_VIEWS: { id: SmartView; icon: string }[] = [
  { id: 'calendar', icon: ICON_PATHS.calendar },
  { id: 'habits', icon: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z' },
]

const TODO_OPENER_ICON = ICON_PATHS.check

const SETTINGS_ICON =
  'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z'

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const { t } = useTranslation()
  const selectedView = useTaskStore((s) => s.selectedView)
  const selectView = useTaskStore((s) => s.selectView)
  const isDesktop = useIsDesktop()
  const isLargeScreen = useIsLargeScreen()
  const onTodoView = isTodoNavView(selectedView)
  // スマホのドロワーも、ほかのドロワー・ダイアログと同じく Esc で閉じる
  useEscapeLayer(() => onClose?.(), Boolean(open) && !isDesktop)
  // ドロワーは閉じたあとも、左へ引っ込む動きのあいだは残す
  const drawer = usePresence(open && !isDesktop ? true : null)

  const handleNav = (cb: () => void) => {
    cb()
    onClose?.()
  }


  // lg 未満は `TodoNavPanel` を置く横幅がないので、サブナビをサイドバーに畳み込む。
  // リスト行は DnD id を持つため、常に「表示されている一枚」にだけ描画する。
  // md 未満はドロワーの下端が `MobileBottomNav` に隠れるので、その分の余白を空ける。
  const renderSidebarContent = (withTodoNav: boolean) => (
    <aside className="w-[min(20rem,85vw)] md:w-60 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50
                       flex flex-col h-full pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <div className="px-5 pt-5 pb-3 flex items-center gap-2 min-w-0">
        <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight truncate min-w-0">
          {t('sidebar.brand')}
        </span>
        <SyncIndicator />
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-1 space-y-0.5">
        <SmartViewRow
          view={PLANNER_VIEW.id}
          icon={PLANNER_VIEW.icon}
          isSelected={selectedView === PLANNER_VIEW.id}
          onSelect={() => handleNav(() => selectView(PLANNER_VIEW.id))}
        />
        <button
          type="button"
          onClick={() => {
            if (!onTodoView) selectView('all')
          }}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors
            ${onTodoView
              ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300 font-medium'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
        >
          <PathIcon d={TODO_OPENER_ICON} className="w-4 h-4 flex-shrink-0" />
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
        <SmartViewRow
          view="settings"
          icon={SETTINGS_ICON}
          isSelected={selectedView === 'settings'}
          onSelect={() => handleNav(() => selectView('settings'))}
        />
      </div>

      <div className="pb-3" />
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
    if (!drawer.shown) return null
    return (
      <div className="fixed inset-0 z-40 flex" onClick={onClose} inert={drawer.closing}>
        <div className={`absolute inset-0 bg-black/30 ${drawer.closing ? 'animate-fade-out' : 'animate-fade-in'}`} />
        <div
          className={`relative bg-white dark:bg-zinc-900 ${drawer.closing ? 'animate-slide-out-left' : 'animate-slide-in-left'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {renderSidebarContent(inlineTodoNavInDrawer)}
        </div>
      </div>
    )
  }

  return renderSidebarContent(inlineTodoNavInDrawer || inlineTodoNavInFixed)
}
