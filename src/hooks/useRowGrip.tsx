import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { useIsCoarsePointer } from './useMediaQuery'

/**
 * 並べ替えられる行のつかみ方（To-Do の行・サブタスクの行で共通）。`useSortable` の attributes / listeners を渡す。
 * - PC（細かいポインタ）: 左のつまみ ⠿ からドラッグ（`dragHandle` を TaskItem に渡す）
 * - スマホ・タブレット（タッチ主体）: つまみを出さず、行の長押しで浮かせてそのまま運ぶ（`liftListeners` を TaskItem に渡す。`AppTouchSensor`）
 * つまみは attributes / listeners が変わったときだけ作り直す（TaskItem の memo を効かせる）
 */
export function useRowGrip(
  attributes: DraggableAttributes,
  listeners: DraggableSyntheticListeners,
): { dragHandle?: ReactNode; liftListeners?: DraggableSyntheticListeners } {
  const { t } = useTranslation()
  const coarse = useIsCoarsePointer()
  const handle = useMemo(
    () =>
      coarse ? undefined : (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('common.dragToReorder')}
          className="cursor-grab touch-none p-1.5 opacity-100 active:cursor-grabbing md:p-0.5 md:opacity-70 md:group-hover:opacity-100"
          tabIndex={-1}
        >
          <svg className="w-4 h-4 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
      ),
    [coarse, attributes, listeners, t],
  )
  return coarse ? { liftListeners: listeners } : { dragHandle: handle }
}
