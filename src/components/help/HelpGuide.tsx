import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HelpAnchor } from '../../lib/overlays'
import { Modal, ModalTitle } from '../ui/Modal'
import { buttonClass } from '../ui/buttonClass'
import { fieldClass } from '../ui/fieldClass'
import { CARD_TITLE_CLASS, SECTION_HEADING_CLASS } from '../ui/headingClass'
import { HINT_TEXT, META_TEXT } from '../ui/textClass'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../icons'

type HelpArticle = { title: string; intro: string; steps?: string[]; points?: string[]; tip?: string }
type HelpSection = { title: string; articles: Record<string, HelpArticle> }
type Entry = { section: string; sectionTitle: string; id: string; article: HelpArticle }

const fold = (s: string) => s.normalize('NFKC').toLowerCase()

/**
 * 「使い方」（#670・#673・#675）。ヘルプセンターの形: 上に検索、節（画面の並びの順）ごとの記事の一覧、押すと記事。
 * 記事は やることの題・何ができるかの 1 文・番号つきの手順・決まりの箇条書き・ヒント。中身は文言の `help.sections`。
 * 開くのは `openHelp`。位置が節（`school`）なら一覧のその節から、記事（`school.absences`）ならその記事を開く
 */
export function HelpGuide({ anchor, onClose }: { anchor: HelpAnchor | null; onClose: () => void }) {
  const { t } = useTranslation()
  const sections = t('help.sections', { returnObjects: true }) as Record<string, HelpSection>
  const entries = useMemo<Entry[]>(
    () =>
      Object.entries(sections).flatMap(([section, s]) =>
        Object.entries(s.articles).map(([id, article]) => ({ section, sectionTitle: s.title, id, article })),
      ),
    [sections],
  )
  const [open, setOpen] = useState<string | null>(() => (anchor?.includes('.') ? anchor : null))
  const [query, setQuery] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const current = open ? entries.find((e) => `${e.section}.${e.id}` === open) : undefined

  // 節から開いたときはその節の見出しへ。記事を開いた・戻ったときは上から
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    if (!open && anchor && !anchor.includes('.')) {
      body.querySelector<HTMLElement>(`[data-help-section="${anchor}"]`)?.scrollIntoView({ block: 'start' })
    } else body.scrollTop = 0
  }, [open, anchor])

  const q = fold(query.trim())
  const hits = q
    ? entries.filter(({ article: a }) =>
        fold([a.title, a.intro, ...(a.steps ?? []), ...(a.points ?? []), a.tip ?? ''].join('\n')).includes(q),
      )
    : []

  const row = (e: Entry, withSection: boolean) => (
    <li key={`${e.section}.${e.id}`}>
      <button
        type="button"
        onClick={() => setOpen(`${e.section}.${e.id}`)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-zinc-800 dark:text-zinc-100">{e.article.title}</span>
          {withSection && <span className={`block ${META_TEXT}`}>{e.sectionTitle}</span>}
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
    </li>
  )

  return (
    <Modal onClose={onClose} labelledBy="help-title" width="lg" className="flex h-[min(90vh,860px)] flex-col overflow-hidden">
      <div className="border-b border-zinc-200 px-5 pb-3 pt-5 dark:border-zinc-700">
        <ModalTitle id="help-title">{t('help.title')}</ModalTitle>
        {!current && (
          <label className="relative mt-3 block">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('help.search')}
              aria-label={t('help.search')}
              className={fieldClass({}, 'w-full pl-8')}
            />
          </label>
        )}
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {current ? (
          <article aria-labelledby="help-article-title">
            <button type="button" onClick={() => setOpen(null)} className={buttonClass({ variant: 'ghost', size: 'sm' }, '-ml-2')}>
              <ChevronLeftIcon className="h-4 w-4" />
              {t('help.back')}
            </button>
            <p className={`mt-3 ${META_TEXT}`}>{current.sectionTitle}</p>
            <h3 id="help-article-title" className={`mt-0.5 ${SECTION_HEADING_CLASS}`}>
              {current.article.title}
            </h3>
            <div className="mt-2 space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              <p>{current.article.intro}</p>
              {current.article.steps && (
                <ol className="list-decimal space-y-1 pl-5">
                  {current.article.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              )}
              {current.article.points && (
                <ul className="list-disc space-y-1 pl-5">
                  {current.article.points.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
              {current.article.tip && (
                <p className={HINT_TEXT}>
                  <span className="font-semibold">{t('help.tip')}</span> {current.article.tip}
                </p>
              )}
            </div>
          </article>
        ) : q ? (
          hits.length === 0 ? (
            <p className={HINT_TEXT}>{t('help.noResults', { query: query.trim() })}</p>
          ) : (
            <ul className="-mx-2">{hits.map((e) => row(e, true))}</ul>
          )
        ) : (
          <div className="space-y-5">
            {Object.entries(sections).map(([id, s]) => (
              <section key={id} data-help-section={id} aria-labelledby={`help-${id}`} className="scroll-mt-4">
                <h3 id={`help-${id}`} className={CARD_TITLE_CLASS}>
                  {s.title}
                </h3>
                <ul className="-mx-2 mt-1">{entries.filter((e) => e.section === id).map((e) => row(e, false))}</ul>
              </section>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
        <button type="button" onClick={onClose} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {t('common.close')}
        </button>
      </div>
    </Modal>
  )
}
