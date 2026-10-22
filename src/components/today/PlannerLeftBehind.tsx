import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LeftBehind } from '../../lib/dayPlan'
import { DisclosureButton } from '../ui/Disclosure'
import { PlannerTaskRow, type PlannerRowEnv } from './PlannerTaskRow'
import { META_TONE_CLASS } from './plannerRowMeta'

/**
 * 過ぎた日の「後日に回した N 件」（#522）。その日に置いて、その日には終えなかったもののうち一覧から消えたもの。
 * 後日に終えたものは完了の行に「10/23 に完了」、移してまだのものは「→10/25」。ふりかえりに見る欄なので開いておく
 */
export function PlannerLeftBehind({ items, env }: { items: LeftBehind[]; env: PlannerRowEnv }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const { shortDate } = env.day
  const heading = t('planner.leftBehindHeading', { count: items.length })
  return (
    <div className="mt-3 px-3">
      <DisclosureButton tone="muted" open={open} onToggle={() => setOpen((v) => !v)}>
        {heading}
      </DisclosureButton>
      {open && (
        <ul role="group" aria-label={heading}>
          {items.map(({ task, doneOn, movedTo }) => (
            <PlannerTaskRow
              key={task.id}
              task={task}
              env={env}
              dueMode="none"
              action={
                <span data-left-behind={doneOn ? 'done' : 'moved'} className={`shrink-0 text-xs tabular-nums ${META_TONE_CLASS.muted}`}>
                  {doneOn
                    ? t('planner.doneOnDate', { date: shortDate(doneOn) })
                    : movedTo
                      ? t('planner.movedToDate', { date: shortDate(movedTo) })
                      : t('planner.movedUndated')}
                </span>
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}
