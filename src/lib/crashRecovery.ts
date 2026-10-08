/**
 * アプリ全体が落ちたときの逃げ道。保存したデータが原因だと再読み込みしても同じところで落ちるので、
 * ストアや画面に頼らずに、データの書き出しと自動バックアップからの復元を出せるようにする
 */
import { listAutoBackups, loadAutoBackup } from './autoBackup'
import { appTodayKey } from './timeZone'
import { PERSIST_STORAGE_KEY } from '../store/storeConstants'
import { BACKUP_SCHEMA_VERSION } from './backupFormat'

/** 保存しているデータを、そのままファイルにして保存させる（取り込みで読める形） */
export function downloadRawData(): void {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PERSIST_STORAGE_KEY)
  } catch {
    /* 読めなければ空で出す */
  }
  let body = raw ?? '{}'
  try {
    // 取り込みはバックアップの形（tasks / lists / habits / listSections）を読むので、その形に寄せる
    const state = (JSON.parse(body) as { state?: Record<string, unknown> }).state ?? {}
    body = JSON.stringify({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      tasks: state.tasks ?? [],
      lists: state.lists ?? [],
      habits: state.habits ?? [],
      listSections: state.sections ?? [],
      timeLogTagPresets: state.timeLogTagPresets ?? [],
      logCategoryColors: state.logCategoryColors ?? {},
    })
  } catch {
    /* 形が壊れていても、中身はそのまま渡す */
  }
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `chronograma-rescue-${appTodayKey()}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * いまログインしている人の id。ストアに頼らず、Supabase が保存したセッションから読む。
 * 読めなければ、保存したデータの持ち主（`dataOwner`）
 */
function currentViewer(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue
      const id = (JSON.parse(localStorage.getItem(key) ?? 'null') as { user?: { id?: unknown } } | null)?.user?.id
      if (typeof id === 'string') return id
    }
    const owner = (JSON.parse(localStorage.getItem(PERSIST_STORAGE_KEY) ?? 'null') as { state?: { dataOwner?: unknown } } | null)?.state
      ?.dataOwner
    return typeof owner === 'string' ? owner : null
  } catch {
    return null
  }
}

/** いちばん新しい自動バックアップ（日時と JSON）。いまの人が戻せるものだけ。無ければ null */
export async function latestAutoBackup(): Promise<{ savedAt: string; json: string } | null> {
  const viewer = currentViewer()
  const [latest] = await listAutoBackups(viewer)
  if (!latest) return null
  const full = await loadAutoBackup(latest.id, viewer)
  return full ? { savedAt: full.savedAt, json: full.json } : null
}
