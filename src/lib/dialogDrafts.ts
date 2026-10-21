/**
 * ダイアログ・入力カードの書きかけ（外側を押す・Esc・スワイプで閉じたとき）。次に開いたら続きから書ける（#491）。
 * 置き場はメモリだけ（読み込み直すと消える）。アカウントの境目で全部消す（`accountBoundary.ts`）
 */
const drafts = new Map<string, unknown>()

/** その鍵の書きかけ。無ければ undefined */
export function readDialogDraft<T>(key: string): T | undefined {
  return drafts.get(key) as T | undefined
}

export function hasDialogDraft(key: string): boolean {
  return drafts.has(key)
}

export function writeDialogDraft<T>(key: string, value: T): void {
  drafts.set(key, value)
}

/** 保存・キャンセルしたとき */
export function discardDialogDraft(key: string): void {
  drafts.delete(key)
}

/** ログアウト・アカウントが替わったとき（次の人に前の人の書きかけを見せない） */
export function clearDialogDrafts(): void {
  drafts.clear()
}
