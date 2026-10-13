import type { ReactNode } from 'react'
import { sectionLabelClass, type SectionLabelLevel } from './sectionLabelClass'

/** 小見出し。見た目と使い分けは `sectionLabelClass`。既定は h2・section。`id` はまとまりの aria-labelledby 用 */
export function SectionLabel({
  as: Tag = 'h2',
  level = 'section',
  id,
  className = '',
  children,
}: {
  as?: 'h2' | 'h3' | 'p' | 'div' | 'span' | 'figcaption'
  level?: SectionLabelLevel
  id?: string
  className?: string
  children: ReactNode
}) {
  return (
    <Tag id={id} className={sectionLabelClass(level, className)}>
      {children}
    </Tag>
  )
}
