import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task } from '../../types/task'
import type { ListSection } from '../../types/section'
import type { SomedayTier } from '../../lib/somedayTier'
import { colorVars } from '../../lib/logCategoryColors'
import { openTaskDetail } from '../../lib/overlays'
import { tip } from '../../lib/tooltip'
import { useScheduleWish } from '../../hooks/useScheduleWish'
import { DueDatePopover } from '../DueDatePopover'
import { RefreshIcon } from '../icons'
import { Segmented } from '../ui/Segmented'
import { buttonClass } from '../ui/buttonClass'
import { chipClass } from '../ui/chipClass'

/**
 * いつかの上の切り替え（夢 n | やりたい n）と、セクションの絞り込み（# 海外 …、#439）。
 * 絞り込み中は夢とやりたいを上下に並べるので、切り替えは出さない。夢が 1 件も無いあいだも出さない（`showTabs`、#517）
 */
export function SomedayBar({
  tab,
  onTab,
  showTabs,
  dreamCount,
  wishCount,
  sections,
  colorOfSection,
  filterSectionId,
  onFilter,
}: {
  tab: SomedayTier
  onTab: (tab: SomedayTier) => void
  showTabs: boolean
  dreamCount: number
  wishCount: number
  sections: ListSection[]
  colorOfSection: (sectionId: string) => string
  filterSectionId: string | null
  onFilter: (sectionId: string | null) => void
}) {
  const { t } = useTranslation()
  if (!(showTabs && !filterSectionId) && sections.length === 0) return null
  return (
    <div className="mb-3 flex flex-col gap-2.5">
      {showTabs && !filterSectionId && (
        <Segmented
          value={tab}
          onChange={onTab}
          role="tab"
          size="md"
          fullWidth
          className="sm:max-w-xs"
          ariaLabel={t('someday.tabsAria')}
          options={[
            { value: 'dream', label: `${t('someday.tierDream')}  ${dreamCount}` },
            { value: 'wish', label: `${t('someday.tierWish')}  ${wishCount}` },
          ]}
        />
      )}
      {sections.length > 0 && (
        <div
          role="group"
          aria-label={t('someday.filterAria')}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sections.map((s) => {
            const on = filterSectionId === s.id
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => onFilter(on ? null : s.id)}
                style={on ? colorVars(colorOfSection(s.id)) : undefined}
                className={chipClass(
                  { variant: 'outline', size: 'md', selected: on },
                  'shrink-0 whitespace-nowrap px-3 py-1.5 text-[13px]',
                )}
              >
                {`# ${s.name}`}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * やりたいの棚の上の「今週これどう？」（#439）。やりたいからランダムに 1 件、↻ で替える。
 * 予定するは行のボタンと同じ（日付を選ぶと未分類へ移ってその日の予定になる）
 */
export function WishPick({ wishes }: { wishes: Task[] }) {
  const { t } = useTranslation()
  const scheduleWish = useScheduleWish()
  // 開くたびに違うものから（↻ で次へ）
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000))
  if (wishes.length < 2) return null
  const pick = wishes[seed % wishes.length]!
  return (
    <div style={colorVars('#4285F4')} className="gc-plan mb-2 flex items-center gap-1 rounded-xl py-2 pl-3.5 pr-2">
      <button
        type="button"
        onClick={() => openTaskDetail(pick.id)}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left outline-none"
      >
        <span className="text-[11px] font-medium">{t('someday.pickHeading')}</span>
        <span className="w-full truncate text-[15px] font-medium text-zinc-800 dark:text-zinc-100">{pick.title}</span>
      </button>
      <button
        type="button"
        onClick={() => setSeed((n) => n + 1)}
        aria-label={t('someday.pickAnother')}
        {...tip(t('someday.pickAnother'))}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
      >
        <RefreshIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </button>
      <DueDatePopover
        value={null}
        onChange={(v) => scheduleWish([pick.id], v)}
        kind="scheduled"
        align="right"
        wrapperClassName="relative shrink-0"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            aria-label={t('someday.scheduleItem', { title: pick.title })}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={toggle}
            className={buttonClass({ variant: 'primary', size: 'sm' })}
          >
            {t('someday.schedule')}
          </button>
        )}
      />
    </div>
  )
}
