import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { ADDON_IDS, isAddonOn, type AddonId } from '../../lib/addons'
import { ADDON_CATALOG } from './addonCatalog'
import { Switch } from '../settings/SettingsPrimitives'
import { SettingsSubPage } from '../settings/SettingsSubPage'
import { PathIcon } from '../PathIcon'
import { ChevronRightIcon, InfoIcon } from '../icons'
import { Modal, ModalTitle } from '../ui/Modal'
import { buttonClass } from '../ui/buttonClass'
import { iconButtonClass } from '../ui/iconButtonClass'
import { PAGE_TITLE_CLASS } from '../ui/headingClass'
import { PAGE_SCROLL_CLASS } from '../ui/layoutClass'
import { HINT_TEXT } from '../ui/textClass'

/**
 * 追加機能の画面（#453・#617）。生活まわりの機能をカードで並べ、使うものだけオンにする（オン・オフはこの画面だけ）。
 * カードは名前・説明のボタン（ⓘ、説明のポップアップ）・スイッチ。オンのカードは押すとその機能のページへ進む
 */
export function AddonsView() {
  const { t } = useTranslation()
  const [page, setPage] = useState<AddonId | null>(null)
  if (page) {
    const { Body } = ADDON_CATALOG[page]
    return (
      <SettingsSubPage title={t(`addons.${page}.name`)} backLabel={t('addons.title')} onBack={() => setPage(null)}>
        <Body />
      </SettingsSubPage>
    )
  }
  return (
    <div className={PAGE_SCROLL_CLASS}>
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:px-6 md:pt-8">
        <h1 className={PAGE_TITLE_CLASS}>{t('addons.title')}</h1>
        <p className={`mt-1 ${HINT_TEXT}`}>{t('addons.intro')}</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {ADDON_IDS.map((id) => (
            <AddonCard key={id} id={id} onOpen={() => setPage(id)} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function AddonCard({ id, onOpen }: { id: AddonId; onOpen: () => void }) {
  const { t } = useTranslation()
  const on = useTaskStore((s) => isAddonOn(s.addons, id, s.tasks))
  const setAddonOn = useTaskStore((s) => s.setAddonOn)
  const [infoOpen, setInfoOpen] = useState(false)
  const { icon } = ADDON_CATALOG[id]
  const name = t(`addons.${id}.name`)
  const head = (
    <>
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          on
            ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
        }`}
      >
        <PathIcon d={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{name}</span>
    </>
  )
  return (
    <li
      data-addon={id}
      className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* オンのときだけ中身のページへ進める（› で分かる） */}
      {on ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
        >
          {head}
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 p-2">{head}</div>
      )}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={t('addons.infoAria', { name })}
        onClick={() => setInfoOpen(true)}
        className={iconButtonClass('shrink-0 p-2')}
      >
        <InfoIcon className="h-[18px] w-[18px]" />
      </button>
      <span className="shrink-0 px-2">
        <Switch checked={on} onChange={(v) => setAddonOn(id, v)} label={t('addons.switchAria', { name })} />
      </span>
      {infoOpen && (
        <Modal onClose={() => setInfoOpen(false)} labelledBy={`addon-info-${id}`} width="sm" className="p-5">
          <ModalTitle id={`addon-info-${id}`}>{name}</ModalTitle>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{t(`addons.${id}.description`)}</p>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => setInfoOpen(false)} className={buttonClass({ variant: 'primary', size: 'md' })}>
              {t('common.close')}
            </button>
          </div>
        </Modal>
      )}
    </li>
  )
}
