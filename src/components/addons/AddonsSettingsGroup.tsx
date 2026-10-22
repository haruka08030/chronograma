import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { SettingsGroup, SettingsLinkRow } from '../settings/SettingsPrimitives'

/**
 * 設定から追加機能の画面へ進む 1 行（#540）。オン・オフは追加機能の画面だけでする。
 * スマホだけ（下のタブに追加機能が無いので、ここが入口）。PC はサイドバーにあるので出さない
 */
export function AddonsSettingsGroup() {
  const { t } = useTranslation()
  const selectView = useTaskStore((s) => s.selectView)
  return (
    <div className="md:hidden">
      <SettingsGroup id="settings-addons">
        <SettingsLinkRow label={t('addons.title')} onClick={() => selectView('addons')} />
      </SettingsGroup>
    </div>
  )
}
