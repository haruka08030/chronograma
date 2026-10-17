import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { ADDON_IDS, isAddonOn, type AddonId } from '../../lib/addons'
import { ADDON_CATALOG } from './addonCatalog'
import { SettingsGroup, SettingsLinkRow, SettingsRow, Switch } from '../settings/SettingsPrimitives'
import { buttonClass } from '../ui/buttonClass'

/**
 * 設定の「追加機能」（#453）。追加機能の画面と同じオン・オフを 1 行ずつ。オンの機能は「開く」で中身を開ける。
 * 最後の行から追加機能の画面へ（スマホは下のタブに無いので、ここが入口）
 */
export function AddonsSettingsGroup() {
  const { t } = useTranslation()
  const selectView = useTaskStore((s) => s.selectView)
  return (
    <SettingsGroup id="settings-addons" title={t('addons.title')}>
      {ADDON_IDS.map((id) => (
        <AddonSettingsRow key={id} id={id} />
      ))}
      <SettingsLinkRow label={t('addons.openView')} onClick={() => selectView('addons')} />
    </SettingsGroup>
  )
}

function AddonSettingsRow({ id }: { id: AddonId }) {
  const { t } = useTranslation()
  const on = useTaskStore((s) => isAddonOn(s.addons, id, s.tasks))
  const setAddonOn = useTaskStore((s) => s.setAddonOn)
  const [open, setOpen] = useState(false)
  const { Dialog } = ADDON_CATALOG[id]
  const name = t(`addons.${id}.name`)
  return (
    <SettingsRow label={name}>
      {on && (
        <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          {t('addons.open')}
        </button>
      )}
      <Switch checked={on} onChange={(v) => setAddonOn(id, v)} label={t('addons.switchAria', { name })} />
      {open && <Dialog onClose={() => setOpen(false)} />}
    </SettingsRow>
  )
}
