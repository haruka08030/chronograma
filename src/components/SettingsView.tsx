import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { LIST_COLOR_PALETTES } from '../lib/listColorPalettes'
import { isSupabaseConfigured } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { AccountMenu } from './AccountMenu'
import { DailyRhythmSettings } from './DailyRhythmSettings'
import { InstallAppSection } from './InstallAppSection'
import { CategoryManager } from './settings/CategoryManager'
import { Segmented, SettingsGroup, SettingsRow, settingsButton } from './settings/SettingsPrimitives'

/**
 * 設定。よく触るもの（表示・通知とリズム・記録の分類）を上に、アカウントやデータの入出力を下に。
 * どのまとまりも「見出し + 1 枚の枠に行を並べる」形に揃える。
 */
export function SettingsView() {
  const { t } = useTranslation()
  const { user, loading: authLoading } = useAuth()
  const theme = useTaskStore((s) => s.theme)
  const setTheme = useTaskStore((s) => s.setTheme)
  const listColorPaletteId = useTaskStore((s) => s.listColorPaletteId)
  const setListColorPalette = useTaskStore((s) => s.setListColorPalette)
  const settingsScrollTarget = useTaskStore((s) => s.settingsScrollTarget)
  const clearSettingsScrollTarget = useTaskStore((s) => s.clearSettingsScrollTarget)
  const exportData = useTaskStore((s) => s.exportData)
  const importData = useTaskStore((s) => s.importData)
  const importTasksFromCsv = useTaskStore((s) => s.importTasksFromCsv)
  const lang = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'ja'

  useLayoutEffect(() => {
    if (!settingsScrollTarget) return
    const id =
      settingsScrollTarget === 'appearance'
        ? 'settings-appearance'
        : settingsScrollTarget === 'install'
          ? 'settings-app'
          : 'settings-account'
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
    clearSettingsScrollTarget()
  }, [settingsScrollTarget, clearSettingsScrollTarget])

  const jsonInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-8 px-4 pb-24 pt-6 md:px-6 md:pt-8">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{t('settings.title')}</h1>

        <SettingsGroup id="settings-appearance" title={t('settings.appearance')}>
          <SettingsRow label={t('settings.theme')}>
            <Segmented
              ariaLabel={t('settings.theme')}
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'light', label: t('settings.themeLight') },
                { value: 'dark', label: t('settings.themeDark') },
              ]}
            />
          </SettingsRow>
          <SettingsRow label={t('settings.language')}>
            <Segmented
              ariaLabel={t('settings.language')}
              value={lang}
              onChange={(v) => void i18n.changeLanguage(v)}
              options={[
                { value: 'ja', label: '日本語' },
                { value: 'en', label: 'English' },
              ]}
            />
          </SettingsRow>
        </SettingsGroup>

        <DailyRhythmSettings />

        <SettingsGroup id="settings-categories" title={t('categories.title')} description={t('categories.help')}>
          <CategoryManager />
        </SettingsGroup>

        <SettingsGroup id="settings-lists" title={t('settings.listsTitle')}>
          <SettingsRow label={t('settings.paletteTitle')} help={t(`palettes.${listColorPaletteId}.description`)}>
            <div role="radiogroup" aria-label={t('settings.paletteTitle')} className="flex flex-wrap gap-2">
              {LIST_COLOR_PALETTES.map((p) => {
                const selected = listColorPaletteId === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={t(`palettes.${p.id}.label`)}
                    onClick={() => setListColorPalette(p.id)}
                    className={`flex -space-x-1 rounded-full p-1 transition ${
                      selected ? 'ring-2 ring-accent-500' : 'ring-1 ring-zinc-200 hover:ring-zinc-300 dark:ring-zinc-700'
                    }`}
                  >
                    {p.colors.slice(0, 4).map((c) => (
                      <span key={c} className="h-4 w-4 rounded-full ring-2 ring-white dark:ring-zinc-900" style={{ backgroundColor: c }} aria-hidden />
                    ))}
                    <span className="sr-only">{t(`palettes.${p.id}.label`)}</span>
                  </button>
                )
              })}
            </div>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup id="settings-account" title={t('settings.account')}>
          {isSupabaseConfigured ? (
            <div className="px-4 py-3">
              {!user && !authLoading && <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">{t('settings.accountHelp')}</p>}
              <AccountMenu variant="settings" />
            </div>
          ) : (
            <SettingsRow label={t('settings.account')} help={t('settings.supabaseOff')} />
          )}
        </SettingsGroup>

        <SettingsGroup id="settings-app" title={t('settings.appTitle')}>
          <InstallAppSection />
        </SettingsGroup>

        <SettingsGroup id="settings-data" title={t('settings.data')} description={t('settings.dataIntro')}>
          <SettingsRow label={t('settings.backupTitle')} help={t('settings.backupHint')}>
            <button type="button" onClick={exportData} className={settingsButton}>{t('sidebar.export')}</button>
            <button type="button" onClick={() => jsonInputRef.current?.click()} className={settingsButton}>{t('sidebar.import')}</button>
          </SettingsRow>
          <SettingsRow label={t('settings.csvTitle')} help={t('settings.csvHint')}>
            <button type="button" onClick={() => csvInputRef.current?.click()} className={settingsButton}>{t('sidebar.importCsv')}</button>
          </SettingsRow>
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            if (!window.confirm(i18n.t('confirm.importOverwrite'))) {
              e.target.value = ''
              return
            }
            const reader = new FileReader()
            reader.onload = () => {
              const ok = importData(reader.result as string)
              if (!ok) alert(i18n.t('alert.invalidImportFile'))
            }
            reader.readAsText(file)
            e.target.value = ''
          }}
        />
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              const text = reader.result as string
              const result = importTasksFromCsv(text)
              if (result.errors.length > 0) {
                alert(i18n.t('alert.invalidCsvFile'))
              } else if (result.imported === 0) {
                alert(i18n.t('alert.csvNoRows'))
              } else {
                alert(
                  i18n.t('alert.csvImported', {
                    count: result.imported,
                    skipped: result.skipped,
                  }),
                )
              }
            }
            reader.readAsText(file)
            e.target.value = ''
          }}
        />
        </SettingsGroup>
      </div>
    </div>
  )
}
