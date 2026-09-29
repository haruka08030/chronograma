/**
 * リストの種類。
 * - `tasks`: 締切や予定のある「やること」（既定）
 * - `someday`: いつかやりたいこと（Wish）。期限系のビュー・今日の計画・統計・通知には出さない
 * - `checklist`: 買い物・持ち物など。チェックするだけで、予定・統計・通知には関係させない
 */
export type ListKind = 'tasks' | 'someday' | 'checklist'

export const LIST_KINDS: readonly ListKind[] = ['tasks', 'someday', 'checklist']

export function normalizeListKind(raw: unknown): ListKind {
  return raw === 'someday' || raw === 'checklist' ? raw : 'tasks'
}

export interface TaskList {
  id: string
  name: string
  color: string
  order: number
  /** 未設定（古いデータ）は `tasks` として扱う */
  kind?: ListKind
}
