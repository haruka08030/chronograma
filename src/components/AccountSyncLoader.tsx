import { useEffect, useState, type ComponentType } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { needsSupabaseAtStart } from '../lib/supabase'
import { reportError } from '../lib/errorReport'

let loading: Promise<ComponentType> | null = null
/** 同期の部品（`AccountSync`）を読む。失敗したら次に呼んだときに取り直す */
function loadAccountSync(): Promise<ComponentType> {
  loading ??= import('./AccountSync')
    .then((m) => m.AccountSync)
    .catch((err: unknown) => {
      loading = null
      throw err
    })
  return loading
}

// ログインのセッションが保存されている人は、ログインの確認（Supabase の読み込み）を待たずに読み始める
if (needsSupabaseAtStart()) void loadAccountSync().catch(() => {})

/**
 * ログインしたら同期と連携の部品（`AccountSync`）を読んで描く。ログインしていない人は読まない（起動時の JS を軽くする）。
 * 一度描いたらログアウトしても描いたまま（ログアウトしたときの片付け・表示の戻しも同じ部品がする）。
 * 読めなければ（オフライン）回線が戻ったときに取り直す
 */
export function AccountSyncLoader() {
  const { user } = useAuth()
  const signedIn = Boolean(user)
  const [Sync, setSync] = useState<ComponentType | null>(null)

  useEffect(() => {
    if (!signedIn || Sync) return
    let cancelled = false
    const load = () => {
      void loadAccountSync().then(
        (component) => {
          if (!cancelled) setSync(() => component)
        },
        (err: unknown) => reportError('chunk', err, { component: 'AccountSync' }),
      )
    }
    load()
    window.addEventListener('online', load)
    return () => {
      cancelled = true
      window.removeEventListener('online', load)
    }
  }, [signedIn, Sync])

  return Sync ? <Sync /> : null
}
