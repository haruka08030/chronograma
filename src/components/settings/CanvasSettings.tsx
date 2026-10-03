import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { formatDate } from '../../lib/dateFormat'
import { useAuth } from '../../contexts/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  canvasExpiryWarning,
  canvasFeedUrlProblem,
  CanvasRequestError,
  connectCanvas,
  connectCanvasFeed,
  disconnectCanvas,
  fetchCanvasStatus,
  renewCanvasToken,
  type CanvasConnection,
  type CanvasStatus,
} from '../../lib/canvas'
import { requestCanvasSync, useCanvasSyncState } from '../../hooks/useCanvasSync'
import { SettingsGroup, SettingsRow } from './SettingsPrimitives'
import { fieldClass } from '../ui/fieldClass'
import { buttonClass } from '../ui/buttonClass'
import { Segmented } from '../ui/Segmented'
import { askConfirm } from '../../lib/confirmDialog'
import { useTaskStore } from '../../store/taskStore'

const field = fieldClass({}, 'w-full')
const errorClass = 'px-4 py-3 text-xs text-red-600 dark:text-red-400'

/**
 * Canvas LMS 連携。学校の Canvas の URL とアクセストークンを貼ってつなぐ。学校ごとに 1 つ、いくつでもつなげる。
 * トークンは最長 90 日で切れるので、切れた学校の下でトークンだけ貼り直せるようにする。
 * 取り込み自体は useCanvasSync が行う。
 */
export function CanvasSettings() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const sync = useCanvasSyncState()
  const [status, setStatus] = useState<CanvasStatus | null>(null)
  /** 接続・解除・貼り直しのエラー。キーは接続 ID、新しくつなぐときは 'new' */
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)

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
        setStatus({ connections: [] })
        setErrors({ new: toMessage(e) })
      })
    return () => {
      cancelled = true
    }
  }, [user])

  if (!isSupabaseConfigured) return null

  /** key: エラーを出す場所（接続 ID か 'new'） */
  const act = async (key: string, fn: () => Promise<CanvasStatus>) => {
    setBusy(true)
    setErrors({})
    try {
      setStatus(await fn())
      setAdding(false)
      // 科目はタグで出すので、新しくつないだらタグを見えるようにする（あとでオフにしても戻さない）
      if (key === 'new') useTaskStore.getState().setTagsEnabled(true)
      requestCanvasSync()
    } catch (e) {
      setErrors({ [key]: toMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  const connections = status?.connections ?? []
  const syncCell = (
    <SettingsRow
      label={t('canvas.syncNow')}
      help={
        sync.syncing
          ? t('canvas.syncing')
          : sync.lastSyncedAt
            ? t('common.syncedAt', { time: format(new Date(sync.lastSyncedAt), 'HH:mm') })
            : undefined
      }
    >
      <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} disabled={sync.syncing} onClick={() => requestCanvasSync()}>
        {t('canvas.syncNowAction')}
      </button>
    </SettingsRow>
  )

  const body = !user ? (
    <SettingsRow label={t('canvas.needsLogin')} />
  ) : status === null ? (
    <SettingsRow label={t('common.loading')} />
  ) : connections.length === 0 ? (
    <>
      <NewConnectionForm busy={busy} act={act} />
      {errorText(errors.new) && <p className={errorClass}>{errorText(errors.new)}</p>}
    </>
  ) : (
    <>
      {connections.map((c) => (
        <ConnectionRows
          key={c.id}
          connection={c}
          busy={busy}
          // 貼り直しに失敗したときは、その失敗を優先して出す
          error={errors[c.id] ?? sync.connectionErrors[c.id] ?? null}
          errorText={errorText}
          onRenew={(token) => act(c.id, () => renewCanvasToken(c.id, token))}
          onDisconnect={async () => {
            const host = new URL(c.baseUrl).host
            if (await askConfirm({ message: t('canvas.disconnectConfirm', { host }), confirmLabel: t('canvas.disconnect'), danger: true })) {
              void act(c.id, () => disconnectCanvas(c.id))
            }
          }}
        />
      ))}
      {adding ? (
        <>
          <NewConnectionForm busy={busy} act={act} onCancel={() => setAdding(false)} />
          {errorText(errors.new) && <p className={errorClass}>{errorText(errors.new)}</p>}
        </>
      ) : (
        <SettingsRow label={t('canvas.addAnother')}>
          <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} onClick={() => setAdding(true)}>
            {t('canvas.add')}
          </button>
        </SettingsRow>
      )}
      {syncCell}
    </>
  )

  const syncError = connections.length > 0 ? errorText(sync.error) : null

  return (
    <SettingsGroup id="settings-canvas" title={t('canvas.title')}>
      {body}
      {syncError && <p className={errorClass}>{syncError}</p>}
    </SettingsGroup>
  )
}

function ConnectionRows({
  connection,
  busy,
  error,
  errorText,
  onRenew,
  onDisconnect,
}: {
  connection: CanvasConnection
  busy: boolean
  error: string | null
  errorText: (code: string | null) => string | null
  onRenew: (token: string) => void
  onDisconnect: () => void
}) {
  const { t } = useTranslation()
  const host = new URL(connection.baseUrl).host
  // 期限切れ（つないだあとに切れた）ときと、延ばせないまま期限が近いときは、トークンだけ貼り直す欄を出す
  const feed = connection.kind === 'ical'
  const expiring = error || feed ? null : canvasExpiryWarning(connection.expiresAt)
  return (
    <>
      <SettingsRow label={host} help={feed ? t('canvas.feedHelp') : (connection.userName ?? undefined)}>
        <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} disabled={busy} onClick={onDisconnect}>
          {t('canvas.disconnect')}
        </button>
      </SettingsRow>
      {((!feed && error === 'canvas_unauthorized') || expiring) && (
        <TokenForm
          busy={busy}
          baseUrl={connection.baseUrl}
          notice={expiring ? t('canvas.expiresSoon', { date: formatDate(expiring, 'shortDate') }) : undefined}
          onSubmit={(token) => onRenew(token)}
        />
      )}
      {errorText(error) && <p className={errorClass}>{errorText(error)}</p>}
    </>
  )
}

/**
 * 新しくつなぐ。アクセストークン（読み書き）が基本で、トークンを作れない学校はカレンダーフィード（読むだけ）。
 */
function NewConnectionForm({
  busy,
  act,
  onCancel,
}: {
  busy: boolean
  act: (key: string, fn: () => Promise<CanvasStatus>) => Promise<void>
  onCancel?: () => void
}) {
  const { t } = useTranslation()
  const [method, setMethod] = useState<'token' | 'feed'>('token')
  return (
    <div>
      <div className="px-4 pt-3">
        <Segmented
          ariaLabel={t('canvas.methodLabel')}
          value={method}
          onChange={setMethod}
          options={[
            { value: 'token', label: t('canvas.methodToken') },
            { value: 'feed', label: t('canvas.methodFeed') },
          ]}
        />
      </div>
      {method === 'token' ? (
        <TokenForm busy={busy} onSubmit={(token, url) => act('new', () => connectCanvas(token, url))} onCancel={onCancel} />
      ) : (
        <FeedForm busy={busy} onSubmit={(url) => act('new', () => connectCanvasFeed(url))} onCancel={onCancel} />
      )}
    </div>
  )
}

function FeedForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (feedUrl: string) => void; onCancel?: () => void }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const problem = canvasFeedUrlProblem(url)
  const ready = url.trim() !== '' && !problem
  return (
    <form
      className="space-y-3 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) onSubmit(url.trim())
      }}
    >
      <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-500 dark:text-zinc-400">
        <li>{t('canvas.feedStep1')}</li>
        <li>{t('canvas.feedStep2')}</li>
      </ol>
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-300">{t('canvas.feedLabel')}</span>
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://canvas.ucsc.edu/feeds/calendars/user_….ics"
          className={field}
          aria-invalid={problem ? true : undefined}
        />
      </label>
      {problem && <p className="text-xs text-red-600 dark:text-red-400">{t(`canvas.feedProblem.${problem}`)}</p>}
      <FormButtons busy={busy} ready={ready} submitLabel={t('canvas.connect')} onCancel={onCancel} />
    </form>
  )
}

/** フォームの下の「キャンセル」「接続する」 */
function FormButtons({ busy, ready, submitLabel, onCancel }: { busy: boolean; ready: boolean; submitLabel: string; onCancel?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-end gap-2">
      {onCancel && (
        <button type="button" onClick={onCancel} className={buttonClass({ variant: 'ghost', size: 'md' })}>
          {t('common.cancel')}
        </button>
      )}
      <button type="submit" disabled={busy || !ready} className={`${buttonClass({ variant: 'secondary', size: 'md' })} disabled:opacity-50`}>
        {busy ? t('canvas.connecting') : submitLabel}
      </button>
    </div>
  )
}

/** 新しくつなぐときは URL とトークン、つないだ学校の貼り直し（baseUrl あり）はトークンだけ */
function TokenForm({
  busy,
  baseUrl,
  notice,
  onSubmit,
  onCancel,
}: {
  busy: boolean
  baseUrl?: string
  /** 手順の上に出す予告（期限が近いなど） */
  notice?: string
  onSubmit: (token: string, baseUrl: string) => void
  onCancel?: () => void
}) {
  const { t } = useTranslation()
  const renew = baseUrl !== undefined
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
        if (ready) onSubmit(token.trim(), baseUrl ?? url.trim())
      }}
    >
      {notice && <p className="text-xs text-amber-600 dark:text-amber-400">{notice}</p>}
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
      <FormButtons busy={busy} ready={ready} submitLabel={t(renew ? 'canvas.renew' : 'canvas.connect')} onCancel={onCancel} />
    </form>
  )
}
