import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { notify } from '../lib/notify'
import { isSupabaseConfigured } from '../lib/supabase'
import { previewBackupJson } from '../lib/backupFormat'
import { loadImportRollback } from '../lib/importRollback'
import { AccountMenu } from './AccountMenu'
import { DailyRhythmSettings } from './DailyRhythmSettings'
import { InstallAppSection } from './InstallAppSection'
import { CategoryManager } from './settings/CategoryManager'
import { NotionSettings } from './settings/NotionSettings'
import { CanvasSettings } from './settings/CanvasSettings'
import { GoogleCalendarSettings } from './settings/GoogleCalendarSettings'
import { IntegrationsSummary } from './settings/IntegrationsSummary'
import { ChevronLeftIcon } from './icons'
import { AutoBackupSettings } from './settings/AutoBackupSettings'
import { TimeZoneSettings } from './settings/TimeZoneSettings'
import { SettingsGroup, SettingsRow, Switch } from './settings/SettingsPrimitives'
import { Segmented } from './ui/Segmented'
import { buttonClass } from './ui/buttonClass'
import { askConfirm } from '../lib/confirmDialog'

/**
 * 設定。よく触るもの（表示・通知とリズム・記録の分類）を上に、アカウントやデータの入出力を下に。
 * どのまとまりも「見出し + 1 枚の枠に行を並べる」形に揃える。
 * 外部連携は使う人だけが使うので、トップには接続中のものだけを出し、つなぐ・設定するのは次のページにする。
 */
export function SettingsView() {
  const settingsScrollTarget = useTaskStore((s) => s.settingsScrollTarget)
  const [page, setPage] = useState<'main' | 'integrations'>(() => (settingsScrollTarget === 'google' ? 'integrations' : 'main'))

  // Google カレンダーへの案内は連携のページを開く（届いたときに 1 回だけ切り替える）
  const [seenTarget, setSeenTarget] = useState(settingsScrollTarget)
  if (settingsScrollTarget !== seenTarget) {
    setSeenTarget(settingsScrollTarget)
    if (settingsScrollTarget === 'google') setPage('integrations')
  }

  return page === 'integrations' ? (
    <IntegrationsPage onBack={() => setPage('main')} />
  ) : (
    <MainSettings onOpenIntegrations={() => setPage('integrations')} />
  )
}

/** 外部連携のページ。戻るで設定のトップへ */
function IntegrationsPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const settingsScrollTarget = useTaskStore((s) => s.settingsScrollTarget)
  const clearSettingsScrollTarget = useTaskStore((s) => s.clearSettingsScrollTarget)
  const scrollRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (settingsScrollTarget === 'google') {
      document.getElementById('settings-google')?.scrollIntoView({ block: 'start' })
      clearSettingsScrollTarget()
    } else {
      scrollRef.current?.scrollTo({ top: 0 })
    }
  }, [settingsScrollTarget, clearSettingsScrollTarget])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-8 px-4 pb-24 pt-6 md:px-6 md:pt-8">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            {t('settings.title')}
          </button>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{t('integrations.title')}</h1>
        </div>
        <GoogleCalendarSettings />
        <NotionSettings />
        <CanvasSettings />
      </div>
    </div>
  )
}

function MainSettings({ onOpenIntegrations }: { onOpenIntegrations: () => void }) {
  const { t } = useTranslation()
  const theme = useTaskStore((s) => s.theme)
  const setTheme = useTaskStore((s) => s.setTheme)
  const tagsEnabled = useTaskStore((s) => s.tagsEnabled)
  const setTagsEnabled = useTaskStore((s) => s.setTagsEnabled)
  const settingsScrollTarget = useTaskStore((s) => s.settingsScrollTarget)
  const clearSettingsScrollTarget = useTaskStore((s) => s.clearSettingsScrollTarget)
  const exportData = useTaskStore((s) => s.exportData)
  const importData = useTaskStore((s) => s.importData)
  const importTasksFromCsv = useTaskStore((s) => s.importTasksFromCsv)
  const lang = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'ja'

  useLayoutEffect(() => {
    // Google カレンダーは連携のページで扱う（SettingsView が切り替える）
    if (!settingsScrollTarget || settingsScrollTarget === 'google') return
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
          <SettingsRow label={t('settings.tagsEnabled')}>
            <Switch checked={tagsEnabled} onChange={setTagsEnabled} label={t('settings.tagsEnabled')} />
          </SettingsRow>
        </SettingsGroup>

        <DailyRhythmSettings />

        <TimeZoneSettings />

        <SettingsGroup id="settings-categories" title={t('categories.title')}>
          <CategoryManager />
        </SettingsGroup>

        <SettingsGroup id="settings-account" title={t('settings.account')}>
          {isSupabaseConfigured ? (
            <div className="px-4 py-3">
              <AccountMenu variant="settings" />
            </div>
          ) : (
            <SettingsRow label={t('settings.account')} help={t('settings.supabaseOff')} />
          )}
        </SettingsGroup>

        <IntegrationsSummary onOpen={onOpenIntegrations} />

        <SettingsGroup id="settings-app" title={t('settings.appTitle')}>
          <InstallAppSection />
          <SettingsRow label={t('settings.legalTitle')}>
            <a href="/privacy.html" target="_blank" rel="noopener" className={buttonClass({ variant: 'secondary', size: 'md' })}>{t('settings.privacyPolicy')}</a>
            <a href="/terms.html" target="_blank" rel="noopener" className={buttonClass({ variant: 'secondary', size: 'md' })}>{t('settings.terms')}</a>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup id="settings-data" title={t('settings.data')}>
          <SettingsRow label={t('settings.backupTitle')}>
            <button type="button" onClick={exportData} className={buttonClass({ variant: 'secondary', size: 'md' })}>{t('sidebar.export')}</button>
            <button type="button" onClick={() => jsonInputRef.current?.click()} className={buttonClass({ variant: 'secondary', size: 'md' })}>{t('sidebar.import')}</button>
          </SettingsRow>
          <AutoBackupSettings />
          <RestoreBeforeImportRow />
          <SettingsRow label={t('settings.csvTitle')}>
            <button type="button" onClick={() => csvInputRef.current?.click()} className={buttonClass({ variant: 'secondary', size: 'md' })}>{t('sidebar.importCsv')}</button>
          </SettingsRow>
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = async () => {
              // 先に中身を読んでから確認する。件数が分からないまま
              // 「上書きしますか？」だけ出しても判断できない
              const preview = previewBackupJson(reader.result as string)
              if (!preview) {
                notify(i18n.t('alert.invalidImportFile'))
                return
              }
              const current = useTaskStore.getState()
              const ok = await askConfirm({
                message: i18n.t('confirm.importOverwriteCounts', {
                  currentTasks: current.tasks.length,
                  nextTasks: preview.tasks,
                  currentLists: current.lists.length,
                  nextLists: preview.lists,
                }),
                confirmLabel: i18n.t('sidebar.import'),
                danger: true,
              })
              if (!ok) return
              if (!importData(reader.result as string)) {
                notify(i18n.t('alert.invalidImportFile'))
              }
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
              // 取り込めたときは store が「元に戻す」付きの通知を出す
              if (result.errors.length > 0) notify(i18n.t('alert.invalidCsvFile'))
              else if (result.imported === 0) notify(i18n.t('alert.csvNoRows'))
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

/**
 * 直前の取り込みを取り消す行。控えがあるときだけ出す
 * （原則 3: 必要なときだけ出す）。⌘Z と違い再読み込み後でも使える。
 */
function RestoreBeforeImportRow() {
  const { t } = useTranslation()
  const restoreBeforeImport = useTaskStore((s) => s.restoreBeforeImport)
  const tasksLength = useTaskStore((s) => s.tasks.length)
  const [reloadKey, setReloadKey] = useState(0)
  /** localStorage を読むのは副作用なので render では呼ばず、件数が動いたときに読み直す */
  const [saved, setSaved] = useState(() => loadImportRollback())

  useEffect(() => {
    const id = setTimeout(() => setSaved(loadImportRollback()), 0)
    return () => clearTimeout(id)
  }, [tasksLength, reloadKey])

  if (!saved) return null

  return (
    <SettingsRow
      label={t('settings.restoreImportTitle')}
    >
      <button
        type="button"
        className={buttonClass({ variant: 'secondary', size: 'md' })}
        onClick={async () => {
          if (!(await askConfirm({ message: i18n.t('confirm.restoreBeforeImport', { count: saved.taskCount }), confirmLabel: i18n.t('settings.restoreImportAction') }))) return
          if (restoreBeforeImport()) {
            setSaved(null)
            setReloadKey((n) => n + 1)
          }
        }}
      >
        {t('settings.restoreImportAction')}
      </button>
    </SettingsRow>
  )
}
