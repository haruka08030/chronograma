import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { notify } from '../lib/notify'
import { isSupabaseConfigured } from '../lib/supabase'
import { isImportFileTooLarge, MAX_IMPORT_FILE_BYTES, previewBackupJson } from '../lib/backupFormat'
import { backupProblemText } from '../lib/backupProblemText'
import { loadImportRollback } from '../lib/importRollback'
import { AccountMenu } from './AccountMenu'
import { DailyRhythmSettings } from './DailyRhythmSettings'
import { InstallAppSection } from './InstallAppSection'
import { CategoryManager } from './settings/CategoryManager'
import { MoreIntegrations } from './settings/MoreIntegrations'
import { GoogleCalendarSettings } from './settings/GoogleCalendarSettings'
import { IntegrationsSummary } from './settings/IntegrationsSummary'
import { ChevronLeftIcon } from './icons'
import { AutoBackupSettings } from './settings/AutoBackupSettings'
import { TimeZoneSettings } from './settings/TimeZoneSettings'
import { SettingsGroup, SettingsLinkRow, SettingsRow } from './settings/SettingsPrimitives'
import { Segmented } from './ui/Segmented'
import { buttonClass } from './ui/buttonClass'
import { askConfirm } from '../lib/confirmDialog'
import { PAGE_TITLE_CLASS } from './ui/headingClass'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'

/**
 * 設定。上から アカウント → ラベル → 通知・計画 → 日付と時刻 → 外観 → 連携 → データ → アプリ → 規約。
 * 誰として使っているかを先頭に、よく触るもの（記録の分類）を上に、一度決めたら触らないものを下に。
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
    <div ref={scrollRef} className={PAGE_SCROLL_CLASS}>
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
          <h1 className={`mt-2 ${PAGE_TITLE_CLASS}`}>{t('integrations.title')}</h1>
        </div>
        <GoogleCalendarSettings />
        <MoreIntegrations />
      </div>
    </div>
  )
}

function MainSettings({ onOpenIntegrations }: { onOpenIntegrations: () => void }) {
  const { t } = useTranslation()
  const theme = useTaskStore((s) => s.theme)
  const setTheme = useTaskStore((s) => s.setTheme)
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
    <div className={PAGE_SCROLL_CLASS}>
      <div className="mx-auto w-full max-w-2xl space-y-8 px-4 pb-24 pt-6 md:px-6 md:pt-8">
        <h1 className={PAGE_TITLE_CLASS}>{t('settings.title')}</h1>

        <SettingsGroup id="settings-account" title={t('settings.account')}>
          {isSupabaseConfigured ? (
            <div className="px-4 py-3">
              <AccountMenu />
            </div>
          ) : (
            <SettingsRow label={t('settings.syncOffTitle')} help={t('settings.supabaseOff')} />
          )}
        </SettingsGroup>

        <SettingsGroup id="settings-categories" title={t('categories.title')}>
          <CategoryManager />
        </SettingsGroup>

        <DailyRhythmSettings />

        <TimeZoneSettings />

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

        <IntegrationsSummary onOpen={onOpenIntegrations} />

        <SettingsGroup id="settings-data" title={t('settings.data')}>
          <SettingsRow label={t('settings.backupTitle')}>
            <button type="button" onClick={exportData} className={buttonClass({ variant: 'secondary', size: 'md' })}>
              {t('sidebar.export')}
            </button>
            <button
              type="button"
              onClick={() => jsonInputRef.current?.click()}
              className={buttonClass({ variant: 'secondary', size: 'md' })}
            >
              {t('sidebar.import')}
            </button>
          </SettingsRow>
          <AutoBackupSettings />
          <RestoreBeforeImportRow />
          <SettingsRow label={t('settings.csvTitle')}>
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className={buttonClass({ variant: 'secondary', size: 'md' })}
            >
              {t('sidebar.importCsv')}
            </button>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup id="settings-app" title={t('settings.appTitle')}>
          <InstallAppSection />
        </SettingsGroup>

        {/* 規約は読みに行くだけのものなので、見出しを立てず一番下に小さな行で置く */}
        <SettingsGroup>
          <SettingsLinkRow label={t('settings.privacyPolicy')} href="/privacy.html" />
          <SettingsLinkRow label={t('settings.terms')} href="/terms.html" />
        </SettingsGroup>

        {/* 書き出し・読み込みのファイル選び（枠の行の区切り線が掛からないよう枠の外に置く） */}
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            if (isImportFileTooLarge(file)) {
              notify(i18n.t('alert.importFileTooLarge', { mb: MAX_IMPORT_FILE_BYTES / 1024 / 1024 }))
              e.target.value = ''
              return
            }
            const reader = new FileReader()
            reader.onload = async () => {
              // 先に中身を読んでから確認する。件数が分からないまま
              // 「上書きしますか？」だけ出しても判断できない
              const preview = previewBackupJson(reader.result as string)
              if (!preview.ok) {
                // どこが悪いか（重複 ID・無いリストを指すタスクなど）を出す
                notify(backupProblemText(preview.problem))
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
            if (isImportFileTooLarge(file)) {
              notify(i18n.t('alert.importFileTooLarge', { mb: MAX_IMPORT_FILE_BYTES / 1024 / 1024 }))
              e.target.value = ''
              return
            }
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
    <SettingsRow label={t('settings.restoreImportTitle')}>
      <button
        type="button"
        className={buttonClass({ variant: 'secondary', size: 'md' })}
        onClick={async () => {
          if (
            !(await askConfirm({
              message: i18n.t('confirm.restoreBeforeImport', { count: saved.taskCount }),
              confirmLabel: i18n.t('settings.restoreImportAction'),
            }))
          )
            return
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
