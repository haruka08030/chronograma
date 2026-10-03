import type { ReactNode } from 'react'
import { sectionLabelClass, type SectionLabelLevel } from './sectionLabelClass'

/** 小見出し。見た目と使い分けは `sectionLabelClass`。既定は h2・section */
export function SectionLabel({
  as: Tag = 'h2',
  level = 'section',
  className = '',
  children,
}: {
  as?: 'h2' | 'h3' | 'p' | 'div' | 'span' | 'figcaption'
  level?: SectionLabelLevel
  className?: string
  children: ReactNode
}) {
  return <Tag className={sectionLabelClass(level, className)}>{children}</Tag>
}
