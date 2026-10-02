import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  CanvasRequestError,
  connectCanvas,
  disconnectCanvas,
  fetchCanvasStatus,
  type CanvasStatus,
} from '../../lib/canvas'
import { requestCanvasSync, useCanvasSyncState } from '../../hooks/useCanvasSync'
import { SettingsGroup, SettingsRow, settingsFieldClass as field } from './SettingsPrimitives'
import { buttonClass } from '../ui/buttonClass'

/**
 * Canvas LMS 連携。学校の Canvas の URL とアクセストークンを貼ってつなぐ。
 * トークンは最長 90 日で切れるので、切れたら同じ場所でトークンだけ貼り直せるようにする。
 * 取り込み自体は useCanvasSync が行う。
 */
export function CanvasSettings() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const sync = useCanvasSyncState()
  const [status, setStatus] = useState<CanvasStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const errorText = (code: string | null | undefined) =>
    code ? t(`canvas.errors.${code}`, { defaultValue: t('canvas.errors.generic') }) : null
  const toMessage = (e: unknown) => (e instanceof CanvasRequestError && e.code ? e.code : 'generic')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetchCanvasStatus()
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

  const connect = async (token: string, baseUrl?: string) => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await connectCanvas(token, baseUrl))
      requestCanvasSync()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!window.confirm(t('canvas.disconnectConfirm'))) return
    setBusy(true)
    try {
      await disconnectCanvas()
      setStatus({ connected: false })
      requestCanvasSync()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const syncError = status?.connected ? sync.error : null
  // 期限切れ（つないだあとに切れた）ときは、トークンだけ貼り直す欄を出す
  const expired = syncError === 'canvas_unauthorized' || (status?.connected && error === 'canvas_unauthorized')
  const shownError = errorText(error) ?? errorText(syncError)

  const body = !user ? (
    <SettingsRow label={t('canvas.needsLogin')} />
  ) : status === null ? (
    <SettingsRow label={t('common.loading')} />
  ) : status.connected ? (
    <>
      <SettingsRow
        label={
          status.userName
            ? t('canvas.connectedAs', { name: status.userName, host: new URL(status.baseUrl).host })
            : t('canvas.connectedTo', { host: new URL(status.baseUrl).host })
        }
      >
        <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} disabled={busy} onClick={disconnect}>
          {t('canvas.disconnect')}
        </button>
      </SettingsRow>
      {expired ? (
        <TokenForm busy={busy} baseUrl={status.baseUrl} renew onSubmit={(token) => connect(token)} />
      ) : (
        <SettingsRow
          label={t('canvas.syncNow')}
          help={
            sync.syncing
              ? t('canvas.syncing')
              : sync.lastSyncedAt
                ? t('canvas.lastSynced', { time: format(new Date(sync.lastSyncedAt), 'HH:mm') })
                : undefined
          }
        >
          <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} disabled={sync.syncing} onClick={() => requestCanvasSync()}>
            {t('canvas.syncNowAction')}
          </button>
        </SettingsRow>
      )}
    </>
  ) : (
    <TokenForm busy={busy} onSubmit={connect} />
  )

  return (
    <SettingsGroup id="settings-canvas" title={t('canvas.title')}>
      {body}
      {shownError && <p className="px-4 py-3 text-xs text-red-600 dark:text-red-400">{shownError}</p>}
    </SettingsGroup>
  )
}

/** 初めてつなぐときは URL とトークン、貼り直す（renew）ときはトークンだけ */
function TokenForm({
  busy,
  baseUrl,
  renew = false,
  onSubmit,
}: {
  busy: boolean
  baseUrl?: string
  renew?: boolean
  onSubmit: (token: string, baseUrl?: string) => void
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const ready = token.trim() !== '' && (renew || url.trim() !== '')
  // 学校の URL が分かれば、トークンを作る画面へ直接飛べるようにする
  const settingsUrl = (() => {
    const raw = (baseUrl ?? url).trim()
    if (!raw) return null
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
      return u.hostname.includes('.') ? `https://${u.hostname}/profile/settings` : null
    } catch {
      return null
    }
  })()

  return (
    <form
      className="space-y-3 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) onSubmit(token.trim(), renew ? undefined : url.trim())
      }}
    >
      <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-500 dark:text-zinc-400">
        <li>
          {settingsUrl ? (
            <a href={settingsUrl} target="_blank" rel="noreferrer" className="text-accent-600 underline-offset-2 hover:underline dark:text-accent-400">
              {t('canvas.step1Link')}
            </a>
          ) : (
            t('canvas.step1Link')
          )}
          {t('canvas.step1')}
        </li>
        <li>{t(renew ? 'canvas.step2Renew' : 'canvas.step2')}</li>
      </ol>
      {!renew && (
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-300">{t('canvas.urlLabel')}</span>
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://xxx.instructure.com"
            className={field}
          />
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-300">{t('canvas.tokenLabel')}</span>
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className={field}
        />
      </label>
      <div className="flex justify-end">
        <button type="submit" disabled={busy || !ready} className={`${buttonClass({ variant: 'secondary', size: 'md' })} disabled:opacity-50`}>
          {busy ? t('canvas.connecting') : t(renew ? 'canvas.renew' : 'canvas.connect')}
        </button>
      </div>
    </form>
  )
}
