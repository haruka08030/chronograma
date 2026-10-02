import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n/config'
import { DAILY_KEEP, listAutoBackups, loadAutoBackup, type AutoBackupKind, type AutoBackupMeta } from '../../lib/autoBackup'
import { onAutoBackupSaved } from '../../hooks/useAutoBackup'
import { useTaskStore } from '../../store/taskStore'
import { SettingsRow, settingsButton } from './SettingsPrimitives'

const KIND_LABEL: Record<AutoBackupKind, string> = {
  daily: 'kindDaily',
  beforeSync: 'kindBeforeSync',
  beforeSignOut: 'kindBeforeSignOut',
}

/**
 * 自動バックアップの一覧。いまのデータは置き換えず「控えにあって今は無いもの」だけを戻すので、
 * どの控えを選んでも今日の入力は消えない。全部をそのまま見たいときは書き出して取り込む
 */
export function AutoBackupSettings() {
  const { t } = useTranslation()
  const restoreMissingFromBackup = useTaskStore((s) => s.restoreMissingFromBackup)
  const [backups, setBackups] = useState<AutoBackupMeta[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => void listAutoBackups().then((b) => !cancelled && setBackups(b))
    load()
    const off = onAutoBackupSaved(load)
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const lang = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'ja-JP'
  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang, { month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' })

  const restore = async (b: AutoBackupMeta) => {
    const full = await loadAutoBackup(b.id)
    if (!full) {
      alert(i18n.t('autoBackup.unreadable'))
      return
    }
    if (!window.confirm(i18n.t('autoBackup.confirmRestore', { when: when(b.savedAt) }))) return
    const added = restoreMissingFromBackup(full.json)
    if (added === null) alert(i18n.t('autoBackup.unreadable'))
    else if (added === 0) alert(i18n.t('autoBackup.nothingMissing'))
    else alert(i18n.t('autoBackup.restored', { count: added }))
  }

  const download = async (b: AutoBackupMeta) => {
    const full = await loadAutoBackup(b.id)
    if (!full) {
      alert(i18n.t('autoBackup.unreadable'))
      return
    }
    const url = URL.createObjectURL(new Blob([full.json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `chronograma-auto-backup-${b.savedAt.slice(0, 16).replace(/[:T]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <SettingsRow label={t('autoBackup.title')} help={t('autoBackup.hint', { days: DAILY_KEEP })} />
      {backups !== null && (
        <div className="px-4 pb-3">
          {backups.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('autoBackup.empty')}</p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-100 px-3 dark:divide-zinc-800 dark:border-zinc-800">
              {backups.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">
                      {when(b.savedAt)}
                      <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {t(`autoBackup.${KIND_LABEL[b.kind]}`)}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {t('autoBackup.counts', { todos: b.todoCount, logs: b.logCount })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className={settingsButton} onClick={() => void restore(b)}>
                      {t('autoBackup.restoreMissing')}
                    </button>
                    <button type="button" className={settingsButton} onClick={() => void download(b)}>
                      {t('autoBackup.download')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
