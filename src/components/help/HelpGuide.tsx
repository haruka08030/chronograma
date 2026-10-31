import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { HelpAnchor } from '../../lib/overlays'
import { Modal, ModalTitle } from '../ui/Modal'
import { buttonClass } from '../ui/buttonClass'
import { chipClass } from '../ui/chipClass'
import { CARD_TITLE_CLASS, SECTION_HEADING_CLASS } from '../ui/headingClass'

type HelpGroup = { title?: string; items: string[] }
type HelpSection = { title: string; groups: Record<string, HelpGroup> }

function scrollToAnchor(root: HTMLElement | null, id: HelpAnchor) {
  root?.querySelector<HTMLElement>(`[data-help-anchor="${id}"]`)?.scrollIntoView({ block: 'start' })
}

/**
 * 「使い方」（#670・#673）。画面に常には出さない決まり（勝手に決めていること・見えない操作・数え方）を、画面の並びの順に節でまとめる。
 * 中身は文言の `help.sections`（節 → 小見出し → 行。小見出しの `main` は見出しなし）。上の目次で節へ移る。
 * 開くのは `openHelp`（設定・追加機能の ⓘ・学校のページの下・その場の 1 行の「詳しく」）。開いている画面の上に出し、位置を渡すとそこから見せる
 */
export function HelpGuide({ anchor, onClose }: { anchor: HelpAnchor | null; onClose: () => void }) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const sections = t('help.sections', { returnObjects: true }) as Record<string, HelpSection>

  const scrollTo = (id: HelpAnchor) => scrollToAnchor(bodyRef.current, id)
  useEffect(() => {
    if (anchor) scrollToAnchor(bodyRef.current, anchor)
  }, [anchor])

  return (
    <Modal onClose={onClose} labelledBy="help-title" width="lg" className="flex max-h-[min(90vh,860px)] flex-col overflow-hidden">
      <div className="border-b border-zinc-200 pt-5 dark:border-zinc-700">
        <div className="px-5">
          <ModalTitle id="help-title">{t('help.title')}</ModalTitle>
        </div>
        <nav aria-label={t('help.tocAria')} className="mt-3 overflow-x-auto px-5 pb-3">
          <ul className="flex w-max gap-1.5">
            {Object.entries(sections).map(([id, s]) => (
              <li key={id}>
                <button type="button" onClick={() => scrollTo(id)} className={chipClass({ variant: 'outline', size: 'md' })}>
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-4">
        {Object.entries(sections).map(([id, s]) => (
          <section key={id} data-help-anchor={id} aria-labelledby={`help-${id}`} className="scroll-mt-4">
            <h3 id={`help-${id}`} className={SECTION_HEADING_CLASS}>
              {s.title}
            </h3>
            <div className="mt-2 space-y-3">
              {Object.entries(s.groups).map(([gid, g]) => (
                <div key={gid} data-help-anchor={`${id}.${gid}`} className="scroll-mt-4">
                  {g.title && <h4 className={CARD_TITLE_CLASS}>{g.title}</h4>}
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                    {g.items.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
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
