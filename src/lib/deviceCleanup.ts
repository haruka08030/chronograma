/**
 * 端末に溜まり続けるものの片付け（#256）。写しや控えを作るところはあっても消すところが無く、
 * 容量を食い（保存できなくなる）、共用の端末では前の人の題名やデータが次の人の手元に残っていた。
 *
 * - 保存データの写し（読めなかった本体 `-unreadable-`・別の人のデータを取り込む前の本体 `-before-recovery-`）は種類ごとに新しい 1 つだけ。
 *   どこからも読まない（調べるときに開発者ツールで見るだけ）。ログアウトでは消す
 * - 連携（Canvas・Notion）から前回取り込んだ値（題名・締切）は人ごとのキー。ログアウトでは誰の分も消す
 *   （ログインし直した人は、前回の値が分からない＝手元の値を上書きしない扱いから始まるだけ）
 * - 前回同期の控えは、ログアウトした人の分の中身を消して印だけ残す（`hasOtherUsersBaseline` が見るのはキーがあるかだけ。
 *   データを空にした後は控えを使わない）
 * - 前回取得したサーバーの内容（`syncPull.ts` の `savePullState`）は、ログアウトでは誰の分も消す。容量が足りないときも手放す（次は全部を取るだけ）
 */
import { BASELINE_KEY_PREFIX, PULL_STATE_KEY_PREFIX, readStored, storedKeys, writeStored } from './dataStore'
import { CANVAS_PULLED_PREFIX, NOTION_PULLED_PREFIX } from './externalFields'
import { CANVAS_SUBMITTED_PREFIX } from './canvasSubmitted'
import { INTEGRATION_HINT_PREFIX } from './integrationHint'
import { WRITE_BACK_PREFIX } from './writeBackQueue'
import { PERSIST_STORAGE_KEY } from '../store/storeConstants'

export const UNREADABLE_COPY_PREFIX = `${PERSIST_STORAGE_KEY}-unreadable-`
export const BEFORE_RECOVERY_COPY_PREFIX = `${PERSIST_STORAGE_KEY}-before-recovery-`
const COPY_PREFIXES = [UNREADABLE_COPY_PREFIX, BEFORE_RECOVERY_COPY_PREFIX]

/**
 * 中身を消した前回同期の控え。`loadBaseline` は `null` として読む（控えが無いのと同じ。次の同期は両方を残す合わせ方）。
 * キーは残るので、この端末でその人として同期したことは分かる
 */
export const BASELINE_MARKER = 'null'

function localKeys(): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key !== null) out.push(key)
    }
  } catch {
    /* 読めなければ無いものとして */
  }
  return out
}

/** 置き場所（IndexedDB か localStorage）のキー */
function dataStoreKeys(): string[] {
  try {
    return storedKeys()
  } catch {
    return []
  }
}

function removeStored(key: string): boolean {
  try {
    writeStored(key, null)
    return true
  } catch {
    return false
  }
}

function removeLocal(key: string): boolean {
  try {
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/**
 * 写しのキー。置き場所にあるものと、localStorage に残ったもの（IndexedDB を開けなかった回に localStorage に写した分。
 * IndexedDB に移すのは本体と控えだけなので、写しは localStorage に残り続ける）
 */
function copyKeys(prefix: string): { stored: string[]; local: string[] } {
  const stored = dataStoreKeys().filter((k) => k.startsWith(prefix))
  const local = localKeys().filter((k) => k.startsWith(prefix) && !stored.includes(k))
  return { stored, local }
}

/** キーの末尾の時刻（`Date.now()`）。読めなければ 0 */
const copyTime = (prefix: string, key: string) => Number(key.slice(prefix.length)) || 0

/**
 * 保存データの写しを残し、同じ種類の前の写しを消す（新しい 1 つだけにする）。
 * 書けなかったら（容量不足など）前の写しはそのまま
 */
export function keepStorageCopy(prefix: string, raw: string, now = Date.now()): void {
  const key = `${prefix}${now}`
  try {
    writeStored(key, raw)
  } catch {
    return
  }
  const { stored, local } = copyKeys(prefix)
  for (const k of stored) if (k !== key) removeStored(k)
  for (const k of local) if (k !== key) removeLocal(k)
}

/** 新しい 1 つを残して、ほかの写しを消す（前の版で溜まった分）。消したら true */
export function pruneStorageCopies(): boolean {
  let removed = false
  for (const prefix of COPY_PREFIXES) {
    const { stored, local } = copyKeys(prefix)
    const all = [...stored, ...local].sort((a, b) => copyTime(prefix, b) - copyTime(prefix, a))
    for (const k of all.slice(1)) removed = (stored.includes(k) ? removeStored(k) : removeLocal(k)) || removed
  }
  return removed
}

/** 写しをすべて消す（ログアウト・容量が足りないとき）。消したら true */
export function clearStorageCopies(): boolean {
  let removed = false
  for (const prefix of COPY_PREFIXES) {
    const { stored, local } = copyKeys(prefix)
    for (const k of stored) removed = removeStored(k) || removed
    for (const k of local) removed = removeLocal(k) || removed
  }
  return removed
}

/** 連携（Canvas・Notion）から前回取り込んだ値・Canvas の提出済みの控え・送り直し待ちの書き戻しを、誰の分も消す */
export function clearIntegrationMemos(): void {
  for (const key of localKeys()) {
    if (
      key.startsWith(CANVAS_PULLED_PREFIX) ||
      key.startsWith(NOTION_PULLED_PREFIX) ||
      key.startsWith(CANVAS_SUBMITTED_PREFIX) ||
      key.startsWith(INTEGRATION_HINT_PREFIX) ||
      key.startsWith(WRITE_BACK_PREFIX)
    )
      removeLocal(key)
  }
}

/**
 * 前回同期の控えの中身を消して印だけ残す。`keep` の人の控えはそのまま（ログイン中の人）。
 * 中身を消したら true
 */
export function shrinkBaselines(keep: string | null): boolean {
  let shrunk = false
  for (const key of dataStoreKeys()) {
    if (!key.startsWith(BASELINE_KEY_PREFIX) || (keep !== null && key === `${BASELINE_KEY_PREFIX}${keep}`)) continue
    let raw: string | null
    try {
      raw = readStored(key)
    } catch {
      continue
    }
    if (raw === null || raw === BASELINE_MARKER) continue
    try {
      writeStored(key, BASELINE_MARKER)
      shrunk = true
    } catch {
      /* 書けなければそのまま */
    }
  }
  return shrunk
}

/** 前回取得したサーバーの内容を、誰の分も消す。消したら true */
export function clearSyncMirrors(): boolean {
  let cleared = false
  for (const key of dataStoreKeys()) if (key.startsWith(PULL_STATE_KEY_PREFIX) && removeStored(key)) cleared = true
  return cleared
}

/** ログアウトしたときの片付け。前の人の写し・連携の控え・前回同期の控えの中身・前回取得したサーバーの内容を端末に残さない */
export function clearSignedOutLeftovers(): void {
  clearStorageCopies()
  clearIntegrationMemos()
  shrinkBaselines(null)
  clearSyncMirrors()
}
