import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { buttonClass } from './buttonClass'
import { chipClass } from './chipClass'
import { CloseIcon } from '../icons'
import { colorVars } from '../../lib/logCategoryColors'

/** 選んでいる絞り込み 1 つ（× で外す） */
export type FilterChip = { key: string; label: string; icon?: ReactNode; onRemove: () => void }

/** 色ラベルの丸（絞り込みのメニュー・チップ） */
export function ColorDot({ hex }: { hex: string }) {
  return <span className="gc-dot h-3 w-3 rounded-full" style={colorVars(hex)} aria-hidden />
}

/** 選んでいる絞り込みのチップ（今日やる候補・To-Do 一覧・完了済みで共通）。押すとその絞り込みを外す */
export function FilterChips({ chips, className = '' }: { chips: FilterChip[]; className?: string }) {
  const { t } = useTranslation()
  if (chips.length === 0) return null
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          aria-label={t('filter.remove', { name: chip.label })}
          className={chipClass({ variant: 'fill', hover: true })}
        >
          {chip.icon}
          {chip.label}
          <CloseIcon className="w-3 h-3" strokeWidth={2.5} />
        </button>
      ))}
    </div>
  )
}

/** 絞り込みに合うものがないとき: 「条件に合う…はありません」と、外すリンク */
export function FilterNoMatch({ text, onClear, className = '' }: { text: string; onClear: () => void; className?: string }) {
  const { t } = useTranslation()
  return (
    <p className={`text-xs text-zinc-400 dark:text-zinc-500 ${className}`}>
      {text}{' '}
      <button type="button" onClick={onClear} className={buttonClass({ variant: 'link', size: 'xs' })}>
        {t('filter.clear')}
      </button>
    </p>
  )
}
