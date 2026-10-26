/**
 * 連携への送り待ち（Google カレンダーに送る予定・Notion のステータスを進める・Canvas の完了の書き戻し）を、ログアウトの前に送ってみる。
 * 送り待ちはログアウトの片付けで消える（`deviceCleanup.ts` の `clearIntegrationMemos`）ので、残った数を確かめに出す（`AccountMenu`）。
 * 送るのは各連携のフック（`useGooglePush`・`useNotionSync`・`useCanvasSync`）で、動いている間だけここに登録する。
 */
import i18n from '../i18n/config'

export type IntegrationName = 'google' | 'notion' | 'canvas'

type Writer = {
  /** 猶予中のものも含めて、待っているものを今すぐ送る（送れなかったものは待ちに残す） */
  flush: () => Promise<void>
  /** 待っている数 */
  count: () => number
}

const writers = new Map<IntegrationName, Writer>()

/** 登録する。外すときの関数を返す（同じ名前で後から登録したものは消さない） */
export function registerIntegrationWrites(name: IntegrationName, writer: Writer): () => void {
  writers.set(name, writer)
  return () => {
    if (writers.get(name) === writer) writers.delete(name)
  }
}

/** 送るのを待つ長さ。回線が無いときにログアウトを長く止めない */
export const INTEGRATION_FLUSH_TIMEOUT_MS = 10_000

/** 待っているものを送ってみて、送れずに残った数を連携ごとに返す（0 件の連携は入れない） */
export async function flushIntegrationWrites(timeoutMs = INTEGRATION_FLUSH_TIMEOUT_MS): Promise<Partial<Record<IntegrationName, number>>> {
  const entries = [...writers]
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })
  try {
    await Promise.race([Promise.allSettled(entries.map(([, w]) => w.flush())), timeout])
  } finally {
    clearTimeout(timer)
  }
  const left: Partial<Record<IntegrationName, number>> = {}
  for (const [name, w] of entries) {
    let n = 0
    try {
      n = w.count()
    } catch {
      n = 0
    }
    if (n > 0) left[name] = n
  }
  return left
}

const NAME_ORDER: readonly IntegrationName[] = ['google', 'notion', 'canvas']

/**
 * ログアウトの前の確かめの文。クラウドに送れていない変更（`synced` が false）と、連携に送れずに残った数（`left`）を並べる。
 * どちらも無ければ null（確かめずにログアウトする）
 */
export function signOutWarning(synced: boolean, left: Partial<Record<IntegrationName, number>>): string | null {
  const names = NAME_ORDER.filter((n) => (left[n] ?? 0) > 0)
  if (synced && names.length === 0) return null
  if (names.length === 0) return i18n.t('account.signOutUnsynced')
  const integrations = i18n.t('account.signOutIntegrationsUnsent', {
    targets: names.map((n) => i18n.t(`account.integrationName.${n}`)).join(i18n.t('account.integrationNameSeparator')),
    count: names.reduce((sum, n) => sum + (left[n] ?? 0), 0),
  })
  return synced ? `${integrations}${i18n.t('account.signOutAsk')}` : `${i18n.t('account.signOutUnsynced')}\n\n${integrations}`
}
