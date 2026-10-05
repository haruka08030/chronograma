import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import i18n from '../../i18n/config'
import { listAutoBackups, loadAutoBackup, type AutoBackupKind, type AutoBackupMeta } from '../../lib/autoBackup'
import { onAutoBackupSaved } from '../../hooks/useAutoBackup'
import { useTaskStore } from '../../store/taskStore'
import { notify } from '../../lib/notify'
import { SettingsRow } from './SettingsPrimitives'
import { buttonClass } from '../ui/buttonClass'
import { askConfirm } from '../../lib/confirmDialog'
import { useDateFormat } from '../../hooks/useDateFormat'
import { useAuth } from '../../contexts/AuthContext'
import { META_TEXT } from '../ui/textClass'

const KIND_LABEL: Record<AutoBackupKind, string> = {
  daily: 'kindDaily',
  beforeSync: 'kindBeforeSync',
  beforeSignOut: 'kindBeforeSignOut',
}

/**
 * 自動バックアップの一覧。いまのデータは置き換えず「控えにあって今は無いもの」だけを戻すので、
 * どの控えを選んでも今日の入力は消えない。全部をそのまま見たいときは書き出して取り込む。
 * 出すのはいまログインしている人（していなければ、ログインせずに作ったデータ）の控えだけ
 */
export function AutoBackupSettings() {
  const { t } = useTranslation()
  const restoreMissingFromBackup = useTaskStore((s) => s.restoreMissingFromBackup)
  const viewer = useAuth().user?.id ?? null
  const [backups, setBackups] = useState<AutoBackupMeta[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => void listAutoBackups(viewer).then((b) => !cancelled && setBackups(b))
    load()
    const off = onAutoBackupSaved(load)
    return () => {
      cancelled = true
      off()
    }
  }, [viewer])

  const df = useDateFormat()
  const when = (iso: string) => {
    const d = new Date(iso)
    return `${df.shortDateWeekday(d)} ${format(d, 'HH:mm')}`
  }

  const restore = async (b: AutoBackupMeta) => {
    const full = await loadAutoBackup(b.id, viewer)
    if (!full) {
      notify(i18n.t('autoBackup.unreadable'))
      return
    }
    if (!(await askConfirm({ message: i18n.t('autoBackup.confirmRestore', { when: when(b.savedAt) }), confirmLabel: i18n.t('autoBackup.restoreMissing') }))) return
    const added = restoreMissingFromBackup(full.json)
    // 戻せたときは store が「元に戻す」付きの通知を出す
    if (added === null) notify(i18n.t('autoBackup.unreadable'))
    else if (added === 0) notify(i18n.t('autoBackup.nothingMissing'))
  }

  const download = async (b: AutoBackupMeta) => {
    const full = await loadAutoBackup(b.id, viewer)
    if (!full) {
      notify(i18n.t('autoBackup.unreadable'))
      return
    }
    const url = URL.createObjectURL(new Blob([full.json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `chronograma-auto-backup-${b.savedAt.slice(0, 16).replace(/[:T]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 見出しの行の下に、控えを 1 件ずつ設定の行として並べる（枠の中に枠を作らない）
  return (
    <>
      <SettingsRow label={t('autoBackup.title')} help={backups?.length === 0 ? t('autoBackup.empty') : undefined} />
      {/* 日時と件数は潰さず 1 行で読めるように、幅が足りなければボタンを下の行へ回す */}
      {backups?.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-[12rem] flex-1">
            <p className="text-sm text-zinc-800 dark:text-zinc-200">
              {when(b.savedAt)}
              <span className={`ml-2 ${META_TEXT}`}>{t(`autoBackup.${KIND_LABEL[b.kind]}`)}</span>
            </p>
            <p className={META_TEXT}>{t('autoBackup.counts', { todos: b.todoCount, logs: b.logCount })}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} onClick={() => void restore(b)}>
              {t('autoBackup.restoreMissing')}
            </button>
            <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} onClick={() => void download(b)}>
              {t('autoBackup.download')}
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
