import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { SchoolGuideSection } from '../../lib/overlays'
import { Modal, ModalTitle } from '../ui/Modal'
import { buttonClass } from '../ui/buttonClass'
import { CARD_TITLE_CLASS } from '../ui/headingClass'

const SECTIONS: SchoolGuideSection[] = ['terms', 'timetable', 'courses', 'absences', 'assignments']

/**
 * 「学校の使い方」（#670）。画面に出さない学校の決まり（学期・時間割・一覧に入るもの・欠席・課題と科目のつながり）を節ごとにまとめる。
 * 開くのは `openSchoolGuide`（追加機能のカードの ⓘ・学校のページの下・その場の 1 行の「詳しく」）。節を渡すとそこから見せる
 */
export function SchoolGuide({ section, onClose }: { section: SchoolGuideSection | null; onClose: () => void }) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!section) return
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-guide-section="${section}"]`)
    el?.scrollIntoView({ block: 'start' })
  }, [section])

  return (
    <Modal onClose={onClose} labelledBy="school-guide-title" width="md" className="flex max-h-[min(90vh,820px)] flex-col overflow-hidden">
      <div className="border-b border-zinc-200 px-5 pb-3 pt-5 dark:border-zinc-700">
        <ModalTitle id="school-guide-title">{t('schoolGuide.title')}</ModalTitle>
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {SECTIONS.map((id) => (
          <section key={id} data-guide-section={id} aria-labelledby={`school-guide-${id}`} className="scroll-mt-4">
            <h3 id={`school-guide-${id}`} className={CARD_TITLE_CLASS}>
              {t(`schoolGuide.${id}.title`)}
            </h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              {(t(`schoolGuide.${id}.items`, { returnObjects: true }) as string[]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex justify-end border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
        <button type="button" onClick={onClose} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {t('common.close')}
        </button>
      </div>
    </Modal>
  )
}
