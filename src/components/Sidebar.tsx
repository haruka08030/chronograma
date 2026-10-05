import { useRef } from 'react'
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
import { useFocusTrap } from '../hooks/useFocusTrap'

const STATS_SMART_VIEW: { id: SmartView; icon: string } = {
  id: 'stats',
  icon: ICON_PATHS.stats,
}

const PLANNER_VIEW: { id: SmartView; icon: string } = {
  id: 'planner',
  icon: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z',
}

const OTHER_VIEWS: { id: SmartView; icon: string }[] = [
  { id: 'calendar', icon: ICON_PATHS.calendar },
  { id: 'habits', icon: ICON_PATHS.habit },
]

const TODO_OPENER_ICON = ICON_PATHS.check


/**
 * md 以上は常設のサイドバー。md 未満は To-Do の ≡・右スワイプで出すドロワーで、中身は To-Do のナビだけ
 * （ほかの画面は下のタブ、統計・設定は「その他」タブにある）
 */
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
  // ドロワーもダイアログと同じく、開いたら中へフォーカスし、Tab を中に閉じ込め、閉じたら開いたボタン（≡）へ戻す
  const drawerRef = useRef<HTMLDivElement>(null)
  const trapDrawerTab = useFocusTrap(drawerRef, { active: Boolean(drawer.shown) && !drawer.closing })

  const handleNav = (cb: () => void) => {
    cb()
    onClose?.()
  }


  // md〜lg 未満は `TodoNavPanel` を置く横幅がないので、サブナビをサイドバーに畳み込む。
  // リスト行は DnD id を持つため、常に「表示されている一枚」にだけ描画する。
  const renderSidebarContent = (withTodoNav: boolean) => (
    <aside className="w-60 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50
                       flex flex-col h-full">
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
          icon={ICON_PATHS.settings}
          isSelected={selectedView === 'settings'}
          onSelect={() => handleNav(() => selectView('settings'))}
        />
      </div>

      <div className="pb-3" />
    </aside>
  )

  // スマホのドロワー: 絞り込み・リスト・ラベルだけ。下端は `MobileBottomNav` に隠れるので、その分の余白を空ける
  const renderTodoNavDrawer = () => (
    <aside className="w-[min(20rem,85vw)] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50
                       flex flex-col h-full pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
      <div className="px-5 pt-5 pb-3 flex items-center gap-2 min-w-0">
        <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight truncate min-w-0">
          {t('sidebar.todo')}
        </span>
        <SyncIndicator />
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-0.5">
        <TodoNavContent onNavigate={onClose} />
      </nav>
    </aside>
  )

  const inlineTodoNavInFixed = isDesktop && !isLargeScreen && onTodoView

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
      <div className="fixed inset-0 z-40 flex" onClick={onClose} onKeyDown={trapDrawerTab} inert={drawer.closing}>
        <div className={`absolute inset-0 bg-black/30 ${drawer.closing ? 'animate-fade-out' : 'animate-fade-in'}`} />
        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label={t('taskList.openLists')}
          tabIndex={-1}
          className={`relative bg-white outline-none dark:bg-zinc-900 ${drawer.closing ? 'animate-slide-out-left' : 'animate-slide-in-left'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {renderTodoNavDrawer()}
        </div>
      </div>
    )
  }

  return renderSidebarContent(inlineTodoNavInFixed)
}
