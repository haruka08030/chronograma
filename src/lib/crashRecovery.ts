/**
 * アプリ全体が落ちたときの逃げ道。保存したデータが原因だと再読み込みしても同じところで落ちるので、
 * ストアや画面に頼らずに、データの書き出しと自動バックアップからの復元を出せるようにする
 */
import { listAutoBackups, loadAutoBackup } from './autoBackup'

const PERSIST_KEY = 'chronograma-storage'

/** 保存しているデータを、そのままファイルにして保存させる（取り込みで読める形） */
export function downloadRawData(): void {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PERSIST_KEY)
  } catch {
    /* 読めなければ空で出す */
  }
  let body = raw ?? '{}'
  try {
    // 取り込みはバックアップの形（tasks / lists / habits / listSections）を読むので、その形に寄せる
    const state = (JSON.parse(body) as { state?: Record<string, unknown> }).state ?? {}
    body = JSON.stringify({
      schemaVersion: 3,
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
  a.download = `chronograma-rescue-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** いちばん新しい自動バックアップ（日時と JSON）。無ければ null */
export async function latestAutoBackup(): Promise<{ savedAt: string; json: string } | null> {
  const [latest] = await listAutoBackups()
  if (!latest) return null
  const full = await loadAutoBackup(latest.id)
  return full ? { savedAt: full.savedAt, json: full.json } : null
}
