import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n/config'
import { useTaskStore } from '../../store/taskStore'
import { notify } from '../../lib/notify'
import { isImportFileTooLarge, MAX_IMPORT_FILE_BYTES, previewBackupJson } from '../../lib/backupFormat'
import { backupProblemText } from '../../lib/backupProblemText'
import { loadImportRollback } from '../../lib/importRollback'
import { askChoice, askConfirm } from '../../lib/confirmDialog'
import { parseTasksCsv, unknownCsvListNames } from '../../lib/importTasksCsv'
import { buttonClass } from '../ui/buttonClass'
import { AutoBackupSettings } from './AutoBackupSettings'
import { RecordExportSettings } from './RecordExportSettings'
import { SettingsGroup, SettingsRow } from './SettingsPrimitives'
import { SettingsSubPage } from './SettingsSubPage'

/**
 * データのページ（#541）。バックアップ・自動バックアップ・取り込む前に戻す・ほかのアプリから取り込む・記録の書き出し。
 * たまにしか使わないので、設定のトップには 1 行だけ置き、ここを次のページにする。戻るで設定のトップへ
 */
export function DataSettingsPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const exportData = useTaskStore((s) => s.exportData)
  const importData = useTaskStore((s) => s.importData)
  const importTasksFromCsv = useTaskStore((s) => s.importTasksFromCsv)

  const jsonInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  return (
    <SettingsSubPage title={t('settings.data')} onBack={onBack}>
      <SettingsGroup>
        <SettingsRow label={t('settings.backupTitle')}>
          <button type="button" onClick={exportData} className={buttonClass({ variant: 'secondary', size: 'md' })}>
            {t('sidebar.export')}
          </button>
          <button type="button" onClick={() => jsonInputRef.current?.click()} className={buttonClass({ variant: 'secondary', size: 'md' })}>
            {t('sidebar.import')}
          </button>
        </SettingsRow>
        <AutoBackupSettings />
        <RestoreBeforeImportRow />
        <SettingsRow label={t('settings.csvTitle')}>
          <button type="button" onClick={() => csvInputRef.current?.click()} className={buttonClass({ variant: 'secondary', size: 'md' })}>
            {t('sidebar.importCsv')}
          </button>
        </SettingsRow>
        <RecordExportSettings />
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
          reader.onload = async () => {
            const text = reader.result as string
            // 一致するラベルの無いリスト名（TickTick のリスト・Todoist のプロジェクト）は、取り込む前にラベルを作るかを聞く
            const parsed = parseTasksCsv(text, { fileName: file.name })
            const current = useTaskStore.getState()
            const unknown = unknownCsvListNames(parsed.rows, current.lists, current.timeLogTagPresets)
            let unknownLists: 'label' | 'inbox' = 'inbox'
            if (parsed.errors.length === 0 && unknown.count > 0) {
              const choice = await askChoice({
                message: i18n.t('confirm.csvUnknownLists', {
                  names: unknown.names.slice(0, 5).join(i18n.t('common.listSeparator')) + (unknown.names.length > 5 ? ' …' : ''),
                  labels: unknown.names.length,
                  count: unknown.count,
                }),
                confirmLabel: i18n.t('confirm.csvMakeLabels'),
                secondaryLabel: i18n.t('confirm.csvNoLabels'),
              })
              if (!choice) return
              unknownLists = choice === 'confirm' ? 'label' : 'inbox'
            }
            const result = await importTasksFromCsv(text, { fileName: file.name, unknownLists })
            // 取り込めたときは store が「元に戻す」付きの通知を出す
            if (result.errors.length > 0) notify(i18n.t('alert.invalidCsvFile'))
            else if (result.imported === 0) notify(i18n.t('alert.csvNoRows'))
          }
          reader.readAsText(file)
          e.target.value = ''
        }}
      />
    </SettingsSubPage>
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

  const restore = async () => {
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
  }

  return (
    <SettingsRow label={t('settings.restoreImportTitle')}>
      <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} onClick={() => void restore()}>
        {t('settings.restoreImportAction')}
      </button>
    </SettingsRow>
  )
}
