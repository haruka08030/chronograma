import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { StatsIcon } from '../icons'
import { Segmented } from '../ui/Segmented'

export type PlannerPane = 'list' | 'timeline'

/** スマホだけ: やること / タイムラインの切り替えと、統計の入口（記録の延長。PC 幅は左のサイドバーにある） */
export function PlannerMobileBar({ pane, onPaneChange }: { pane: PlannerPane; onPaneChange: (pane: PlannerPane) => void }) {
  const { t } = useTranslation()
  const selectView = useTaskStore((s) => s.selectView)
  return (
    <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] md:hidden">
      <div className="min-w-0 flex-1">
        <Segmented
          role="tab"
          size="md"
          fullWidth
          ariaLabel={t('planner.paneTabsAria')}
          value={pane}
          onChange={onPaneChange}
          options={[
            { value: 'list', label: t('planner.paneList') },
            { value: 'timeline', label: t('planner.paneTimeline') },
          ]}
        />
      </div>
      <button
        type="button"
        onClick={() => selectView('stats')}
        aria-label={t('sidebar.views.stats')}
        className="shrink-0 rounded-full p-2 text-zinc-500 touch-manipulation active:bg-zinc-100 dark:text-zinc-400 dark:active:bg-zinc-800"
      >
        <StatsIcon className="h-5 w-5" strokeWidth={1.75} />
      </button>
    </div>
  )
}
