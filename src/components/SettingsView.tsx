import { useLayoutEffect, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { parseTimeLogTagPresetLines } from '../lib/tagColors'
import { LIST_COLOR_PALETTES } from '../lib/listColorPalettes'
import { isSupabaseConfigured } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { AccountMenu } from './AccountMenu'
import { ThemeToggle } from './ThemeToggle'
import { DailyRhythmSettings } from './DailyRhythmSettings'
import { InstallAppSection } from './InstallAppSection'

export function SettingsView() {
  const { t } = useTranslation()
  const { user, loading: authLoading } = useAuth()
  const listColorPaletteId = useTaskStore((s) => s.listColorPaletteId)
  const setListColorPalette = useTaskStore((s) => s.setListColorPalette)
  const timeLogTagPresets = useTaskStore((s) => s.timeLogTagPresets)
  const setTimeLogTagPresets = useTaskStore((s) => s.setTimeLogTagPresets)
  const settingsScrollTarget = useTaskStore((s) => s.settingsScrollTarget)
  const clearSettingsScrollTarget = useTaskStore((s) => s.clearSettingsScrollTarget)
  const exportData = useTaskStore((s) => s.exportData)
  const importData = useTaskStore((s) => s.importData)
  const importTasksFromCsv = useTaskStore((s) => s.importTasksFromCsv)

  useLayoutEffect(() => {
    if (!settingsScrollTarget) return
    const id =
      settingsScrollTarget === 'appearance'
        ? 'settings-appearance'
        : settingsScrollTarget === 'install'
          ? 'settings-install'
          : 'settings-account'
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
    clearSettingsScrollTarget()
  }, [settingsScrollTarget, clearSettingsScrollTarget])

  const jsonInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const [presetText, setPresetText] = useState(() => timeLogTagPresets.join('\n'))
  const presetDirtyRef = useRef(false)

  useEffect(() => {
    if (!presetDirtyRef.current) {
      const text = timeLogTagPresets.join('\n')
      queueMicrotask(() => setPresetText(text))
    }
  }, [timeLogTagPresets])

  return (
    <div className="max-w-2xl flex-1 space-y-8 overflow-y-auto px-6 py-8">
      <div>
        <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{t('settings.title')}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('settings.intro')}</p>
      </div>

      <section
        id="settings-appearance"
        className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50"
      >
        <h2 className="mb-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">{t('settings.appearance')}</h2>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <svg
              className="h-4 w-4 flex-shrink-0 text-zinc-500 dark:text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
            </svg>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <DailyRhythmSettings />

      <InstallAppSection />

      <section
        id="settings-account"
        className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50"
      >
        <h2 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">{t('settings.account')}</h2>
        {(!isSupabaseConfigured || (!user && !authLoading)) && (
          <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">{t('settings.accountHelp')}</p>
        )}
        {isSupabaseConfigured ? (
          <div className="relative">
            <AccountMenu variant="settings" />
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('settings.supabaseOff')}</p>
        )}
      </section>

      <section
        id="settings-time-log-tags"
        className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50"
      >
        <h2 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {t('settings.timeLogTagPresetsTitle')}
        </h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">{t('settings.timeLogTagPresetsHelp')}</p>
        <textarea
          value={presetText}
          onFocus={() => {
            presetDirtyRef.current = true
          }}
          onBlur={() => {
            presetDirtyRef.current = false
            setTimeLogTagPresets(parseTimeLogTagPresetLines(presetText))
          }}
          onChange={(e) => setPresetText(e.target.value)}
          rows={6}
          spellCheck={false}
          className="w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm
                     text-zinc-900 outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                     dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          placeholder={t('settings.timeLogTagPresetsPlaceholder')}
          aria-label={t('settings.timeLogTagPresetsTitle')}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h2 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">{t('settings.paletteTitle')}</h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">{t('settings.paletteHelp')}</p>
        <div className="space-y-3">
          {LIST_COLOR_PALETTES.map((p) => {
            const selected = listColorPaletteId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setListColorPalette(p.id)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors
                  ${selected
                    ? 'border-accent-500 bg-accent-50/80 ring-1 ring-accent-500/30 dark:bg-accent-500/10'
                    : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/80'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {t(`palettes.${p.id}.label`)}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {t(`palettes.${p.id}.description`)}
                    </div>
                  </div>
                  {selected && (
                    <span className="flex-shrink-0 text-xs font-medium text-accent-600 dark:text-accent-400">
                      {t('settings.selected')}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.colors.map((c) => (
                    <span
                      key={c}
                      className="h-6 w-6 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                      style={{ backgroundColor: c }}
                      aria-hidden
                    />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section
        id="settings-data"
        className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50"
      >
        <h2 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">{t('settings.data')}</h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">{t('settings.dataIntro')}</p>

        <div className="space-y-4">
          <div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={exportData} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {t('sidebar.export')}
              </button>
              <button type="button" onClick={() => jsonInputRef.current?.click()} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {t('sidebar.import')}
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{t('settings.backupHint')}</p>
          </div>

          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <button type="button" onClick={() => csvInputRef.current?.click()} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c1.01.014 1.887.093 2.927.26 1.066.174 1.976 1.053 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-3.75m-9-2.25h9" />
              </svg>
              {t('sidebar.importCsv')}
            </button>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{t('settings.csvHint')}</p>
          </div>
        </div>

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
      </section>
    </div>
  )
}
