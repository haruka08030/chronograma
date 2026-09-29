import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { installAvailability, promptInstall, subscribeInstallAvailability } from '../lib/pwa'

/** 設定: ホーム画面 / Dock に追加して「アプリとして」使う案内 */
export function InstallAppSection() {
  const { t } = useTranslation()
  const availability = useSyncExternalStore(subscribeInstallAvailability, installAvailability, () => 'unavailable' as const)

  return (
    <section
      id="settings-install"
      className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <h2 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">{t('install.title')}</h2>
      <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">{t('install.why')}</p>

      {availability === 'installed' && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{t('install.installed')}</p>
      )}
      {availability === 'prompt' && (
        <button
          type="button"
          onClick={() => void promptInstall()}
          className="rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700"
        >
          {t('install.button')}
        </button>
      )}
      {availability === 'ios' && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>{t('install.iosStep1')}</li>
          <li>{t('install.iosStep2')}</li>
          <li>{t('install.iosStep3')}</li>
        </ol>
      )}
      {availability === 'unavailable' && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('install.manual')}</p>
      )}
    </section>
  )
}
