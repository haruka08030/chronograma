import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { ADDON_IDS, isAddonOn, type AddonId } from '../../lib/addons'
import { ADDON_CATALOG } from './addonCatalog'
import { Switch } from '../settings/SettingsPrimitives'
import { PathIcon } from '../PathIcon'
import { buttonClass } from '../ui/buttonClass'
import { PAGE_TITLE_CLASS } from '../ui/headingClass'
import { PAGE_SCROLL_CLASS } from '../ui/layoutClass'
import { HINT_TEXT } from '../ui/textClass'

/**
 * 追加機能の画面（#453）。生活まわりの機能をカードで並べ、使うものだけオンにする（設定の「追加機能」と同じオン・オフ）。
 * オンのカードは「開く」でその機能の画面（時間割など）を開く
 */
export function AddonsView() {
  const { t } = useTranslation()
  return (
    <div className={PAGE_SCROLL_CLASS}>
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:px-6 md:pt-8">
        <h1 className={PAGE_TITLE_CLASS}>{t('addons.title')}</h1>
        <p className={`mt-1 ${HINT_TEXT}`}>{t('addons.intro')}</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {ADDON_IDS.map((id) => (
            <AddonCard key={id} id={id} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function AddonCard({ id }: { id: AddonId }) {
  const { t } = useTranslation()
  const on = useTaskStore((s) => isAddonOn(s.addons, id, s.tasks))
  const setAddonOn = useTaskStore((s) => s.setAddonOn)
  const [open, setOpen] = useState(false)
  const { icon, Dialog } = ADDON_CATALOG[id]
  const name = t(`addons.${id}.name`)
  return (
    <li data-addon={id} className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start gap-3">
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
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{name}</h2>
          <p className={`mt-0.5 ${HINT_TEXT}`}>{t(`addons.${id}.description`)}</p>
        </div>
        <Switch checked={on} onChange={(v) => setAddonOn(id, v)} label={t('addons.switchAria', { name })} />
      </div>
      {on && (
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            {t('addons.open')}
          </button>
        </div>
      )}
      {open && <Dialog onClose={() => setOpen(false)} />}
    </li>
  )
}
