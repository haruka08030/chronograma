import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import { fetchNotionStatus } from '../../lib/notion'
import { fetchCanvasStatus } from '../../lib/canvas'
import { DisclosureButton } from '../ui/Disclosure'
import { NotionSettings } from './NotionSettings'
import { CanvasSettings } from './CanvasSettings'

/**
 * 連携のページの「その他の連携」（Notion・Canvas）。多くの人には関係ないので畳んでおき、
 * どちらかをつないでいる人には開いて出す（開け閉めしたあとはその人の選んだまま）
 */
export function MoreIntegrations() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!user || !isSupabaseConfigured || touched) return
    let cancelled = false
    const openIf = (connected: boolean) => {
      if (connected && !cancelled) setOpen(true)
    }
    // 状態が取れなければ畳んだまま（詳しいエラーは開いたときに各連携の欄で出す）
    fetchNotionStatus()
      .then((s) => openIf(s.connected))
      .catch(() => {})
    fetchCanvasStatus()
      .then((s) => openIf(s.connections.length > 0))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user, touched])

  if (!isSupabaseConfigured) return null

  return (
    <section>
      <DisclosureButton
        open={open}
        onToggle={() => {
          setTouched(true)
          setOpen((o) => !o)
        }}
        className="-ml-3"
      >
        {t('integrations.more')}
      </DisclosureButton>
      {open && (
        <div className="mt-4 space-y-8">
          <NotionSettings />
          <CanvasSettings />
        </div>
      )}
    </section>
  )
}
