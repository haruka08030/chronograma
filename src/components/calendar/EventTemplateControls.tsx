import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { templateTimeLabel, type EventTemplate } from '../../lib/eventTemplates'
import { colorVars } from '../../lib/logCategoryColors'
import { planHex } from '../../lib/planVisual'
import { useEscapeLayer } from '../../hooks/useHotkey'
import { ActionMenu, type ActionEntry } from '../ui/ActionMenu'
import { buttonClass } from '../ui/buttonClass'
import { HINT_TEXT } from '../ui/textClass'
import { CaretDownIcon, PencilIcon } from '../icons'
import { EventTemplatesDialog } from './EventTemplatesDialog'

/** 予定の色の丸（月のマスの「● 17:00 バイト」と同じ） */
function TemplateDot({ color }: { color: string | null }) {
  return <span aria-hidden className="gc-dot h-2 w-2 shrink-0 rounded-full" style={colorVars(planHex({ color }))} />
}

/**
 * 月表示の見出しの「よく入れる予定 ▾」（#311）。押すと登録したものの一覧（PC は小さなメニュー、スマホは下から出るシート）、
 * 選ぶと日を押して入れる間になる。まだ 1 つも無ければ登録の画面を開く
 */
export function EventTemplateButton({
  activeId,
  onPick,
  className = '',
}: {
  activeId: string | null
  onPick: (templateId: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  const templates = useTaskStore((s) => s.eventTemplates)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const sep = t('common.timeRangeSeparator')

  const entries: ActionEntry[] = [
    ...templates.map((tpl): ActionEntry => ({
      kind: 'leaf',
      id: tpl.id,
      label: tpl.title,
      icon: <TemplateDot color={tpl.color} />,
      hint: templateTimeLabel(tpl, sep),
      checked: tpl.id === activeId,
      run: () => onPick(tpl.id),
    })),
    {
      kind: 'leaf',
      id: 'manage',
      label: t('eventTemplates.manage'),
      icon: <PencilIcon className="h-4 w-4" strokeWidth={1.75} />,
      divider: true,
      run: () => setEditing(true),
    },
  ]

  return (
    <>
      <button
        type="button"
        aria-haspopup={templates.length > 0 ? 'menu' : 'dialog'}
        aria-expanded={menu ? true : undefined}
        onClick={(e) => {
          if (templates.length === 0) {
            setEditing(true)
            return
          }
          const r = e.currentTarget.getBoundingClientRect()
          setMenu({ x: r.left, y: r.bottom + 4 })
        }}
        className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
          activeId
            ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
        } ${className}`}
      >
        {t('eventTemplates.button')}
        <CaretDownIcon className="h-2.5 w-2.5 text-zinc-500" />
      </button>
      {menu && (
        <ActionMenu
          x={menu.x}
          y={menu.y}
          header={t('eventTemplates.menuHint')}
          entries={entries}
          onClose={() => setMenu(null)}
          searchable={false}
        />
      )}
      {editing && (
        <EventTemplatesDialog
          onClose={() => setEditing(false)}
          // 初めて登録したら、そのまま日を押して入れられるようにする
          onSaved={(saved) => {
            if (templates.length === 0 && saved.length === 1) onPick(saved[0]!.id)
          }}
        />
      )}
    </>
  )
}

/**
 * 日を押して入れている間の帯（月の格子の上）。何を入れているかと押し方、「完了」で抜ける（Esc でも）
 */
export function EventTemplateStampBar({ template, onDone }: { template: EventTemplate; onDone: () => void }) {
  const { t } = useTranslation()
  useEscapeLayer(onDone)
  return (
    <div
      role="status"
      className="flex flex-shrink-0 flex-col gap-1 border-b border-accent-200 bg-accent-50/70 px-4 py-2 dark:border-accent-500/30 dark:bg-accent-500/10 md:flex-row md:items-center md:gap-3"
    >
      <div className="flex min-w-0 items-center gap-1.5 text-sm text-zinc-800 dark:text-zinc-100 md:contents">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 md:flex-initial">
          <TemplateDot color={template.color} />
          <span className="truncate font-medium">{template.title}</span>
          <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
            {templateTimeLabel(template, t('common.timeRangeSeparator'))}
          </span>
        </span>
        <span className={`hidden min-w-0 flex-1 md:block ${HINT_TEXT}`}>{t('eventTemplates.stampHint')}</span>
        <button type="button" onClick={onDone} className={buttonClass({ variant: 'primary', size: 'sm' }, 'shrink-0')}>
          {t('eventTemplates.done')}
        </button>
      </div>
      {/* スマホ幅は押し方の説明を下の行に（横に並べると 3 行に折れる） */}
      <p className={`md:hidden ${HINT_TEXT}`}>{t('eventTemplates.stampHint')}</p>
    </div>
  )
}
