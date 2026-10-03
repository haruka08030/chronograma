import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  connectNotion,
  disconnectNotion,
  fetchNotionStatus,
  NotionRequestError,
  saveNotionConfig,
  type NotionConfig,
  type NotionStatus,
} from '../../lib/notion'
import { requestNotionSync, useNotionSyncState } from '../../hooks/useNotionSync'
import { SettingsGroup, SettingsRow } from './SettingsPrimitives'
import { fieldClass } from '../ui/fieldClass'
import { buttonClass } from '../ui/buttonClass'
import { askConfirm } from '../../lib/confirmDialog'

const select = fieldClass({ size: 'sm' }, 'max-w-[12rem]')
const field = fieldClass({}, 'w-full')

type Connected = Extract<NotionStatus, { connected: true }>

/**
 * Notion 連携。データベースをつなぎ、どのステータスを「要アクション」にするかと、
 * 完了にしたときどのステータスへ進めるかを選ぶ。取り込み自体は useNotionSync が行う。
 */
export function NotionSettings() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const sync = useNotionSyncState()
  const [status, setStatus] = useState<NotionStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const errorText = (code: string | null | undefined) =>
    code ? t(`notion.errors.${code}`, { defaultValue: t('notion.errors.generic') }) : null
  const toMessage = (e: unknown) => (e instanceof NotionRequestError && e.code ? e.code : 'generic')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetchNotionStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch((e) => {
        if (cancelled) return
        setStatus({ connected: false })
        setError(toMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [user])

  if (!isSupabaseConfigured) return null

  const body = !user ? (
    <SettingsRow label={t('notion.needsLogin')} />
  ) : status === null ? (
    <SettingsRow label={t('common.loading')} />
  ) : status.connected ? (
    <ConnectedRows
      status={status}
      busy={busy}
      onConfig={async (config) => {
        // 先に画面を変えてから保存する（選ぶたびに待たせない）
        setStatus({ ...status, config })
        setError(null)
        try {
          setStatus(await saveNotionConfig(config))
          requestNotionSync()
        } catch (e) {
          setError(toMessage(e))
        }
      }}
      onDisconnect={async () => {
        if (!(await askConfirm({ message: t('notion.disconnectConfirm'), confirmLabel: t('notion.disconnect'), danger: true }))) return
        setBusy(true)
        try {
          await disconnectNotion()
          setStatus({ connected: false })
          requestNotionSync()
        } catch (e) {
          setError(toMessage(e))
        } finally {
          setBusy(false)
        }
      }}
    />
  ) : (
    <ConnectForm
      busy={busy}
      onConnect={async (token, database) => {
        setBusy(true)
        setError(null)
        try {
          setStatus(await connectNotion(token, database))
        } catch (e) {
          setError(toMessage(e))
        } finally {
          setBusy(false)
        }
      }}
    />
  )

  const shownError = errorText(error) ?? (status?.connected ? errorText(sync.error) : null)

  return (
    <SettingsGroup id="settings-notion" title={t('notion.title')}>
      {body}
      {status?.connected && (
        <SettingsRow
          label={t('notion.syncNow')}
          help={
            sync.syncing
              ? t('notion.syncing')
              : sync.lastSyncedAt
                ? t('common.syncedAt', { time: format(new Date(sync.lastSyncedAt), 'HH:mm') })
                : status.config.actionStatuses.length === 0
                  ? t('notion.pickStatusesFirst')
                  : undefined
          }
        >
          <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} disabled={sync.syncing} onClick={() => requestNotionSync()}>
            {t('notion.syncNowAction')}
          </button>
        </SettingsRow>
      )}
      {shownError && <p className="px-4 py-3 text-xs text-red-600 dark:text-red-400">{shownError}</p>}
    </SettingsGroup>
  )
}

function ConnectForm({ busy, onConnect }: { busy: boolean; onConnect: (token: string, database: string) => void }) {
  const { t } = useTranslation()
  const [token, setToken] = useState('')
  const [database, setDatabase] = useState('')

  return (
    <form
      className="space-y-3 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (token.trim() && database.trim()) onConnect(token.trim(), database.trim())
      }}
    >
      <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-500 dark:text-zinc-400">
        <li>
          <a
            href="https://www.notion.so/profile/integrations"
            target="_blank"
            rel="noreferrer"
            className="text-accent-600 underline-offset-2 hover:underline dark:text-accent-400"
          >
            {t('notion.step1Link')}
          </a>
          {t('notion.step1')}
        </li>
        <li>{t('notion.step2')}</li>
        <li>{t('notion.step3')}</li>
      </ol>
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-300">{t('notion.tokenLabel')}</span>
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ntn_…"
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-300">{t('notion.databaseLabel')}</span>
        <input
          type="url"
          value={database}
          onChange={(e) => setDatabase(e.target.value)}
          placeholder="https://www.notion.so/…"
          className={field}
        />
      </label>
      <div className="flex justify-end">
        <button type="submit" disabled={busy || !token.trim() || !database.trim()} className={`${buttonClass({ variant: 'secondary', size: 'md' })} disabled:opacity-50`}>
          {busy ? t('notion.connecting') : t('notion.connect')}
        </button>
      </div>
    </form>
  )
}

function ConnectedRows({
  status,
  busy,
  onConfig,
  onDisconnect,
}: {
  status: Connected
  busy: boolean
  onConfig: (config: NotionConfig) => void
  onDisconnect: () => void
}) {
  const { t } = useTranslation()
  const { config, properties } = status
  const statusProps = properties.filter((p) => p.type === 'status' || p.type === 'select')
  const dateProps = properties.filter((p) => p.type === 'date')
  const options = statusProps.find((p) => p.name === config.statusProperty)?.options ?? []

  const toggleAction = (name: string, on: boolean) => {
    const actionStatuses = on
      ? options.filter((o) => o === name || config.actionStatuses.includes(o))
      : config.actionStatuses.filter((s) => s !== name)
    const nextStatus = { ...config.nextStatus }
    if (!on) delete nextStatus[name]
    onConfig({ ...config, actionStatuses, nextStatus })
  }

  const setNext = (from: string, to: string) => {
    const nextStatus = { ...config.nextStatus }
    if (to) nextStatus[from] = to
    else delete nextStatus[from]
    onConfig({ ...config, nextStatus })
  }

  return (
    <>
      <SettingsRow label={t('notion.connectedTo', { name: status.databaseTitle })}>
        <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} disabled={busy} onClick={onDisconnect}>
          {t('notion.disconnect')}
        </button>
      </SettingsRow>

      <SettingsRow label={t('notion.statusProperty')} htmlFor="notion-status-prop">
        <select
          id="notion-status-prop"
          className={select}
          value={config.statusProperty ?? ''}
          onChange={(e) => onConfig({ ...config, statusProperty: e.target.value || null, actionStatuses: [], nextStatus: {} })}
        >
          {!config.statusProperty && <option value="">{t('common.none')}</option>}
          {statusProps.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </SettingsRow>

      <SettingsRow label={t('notion.dateProperty')} htmlFor="notion-date-prop">
        <select
          id="notion-date-prop"
          className={select}
          value={config.dateProperty ?? ''}
          onChange={(e) => onConfig({ ...config, dateProperty: e.target.value || null })}
        >
          <option value="">{t('common.none')}</option>
          {dateProps.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </SettingsRow>

      {options.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-sm text-zinc-800 dark:text-zinc-200">{t('notion.actionStatuses')}</p>
          <ul className="mt-3 space-y-2">
            {options.map((name) => {
              const on = config.actionStatuses.includes(name)
              return (
                <li key={name} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => toggleAction(name, e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 accent-accent-600"
                    />
                    <span className="truncate">{name}</span>
                  </label>
                  {on && (
                    <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {t('notion.whenDone')}
                      <select className={select} value={config.nextStatus[name] ?? ''} onChange={(e) => setNext(name, e.target.value)}>
                        <option value="">{t('notion.dontAdvance')}</option>
                        {options
                          .filter((o) => o !== name)
                          .map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                      </select>
                    </label>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}
