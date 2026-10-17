import type { TaskState } from '../store/storeTypes'

/**
 * クラウドの内容がもう手元に入っているか（開いてから取り込み終えた、または同期が一度終わった）。
 * Notion・Canvas の取り込みはこれを待つ（クラウドの To-Do が届く前に取り込むと、同じタスクを二重に作る）
 */
export function cloudReady(s: Pick<TaskState, 'cloudPulledAt' | 'lastSyncedAt'>): boolean {
  return Boolean(s.cloudPulledAt || s.lastSyncedAt)
}
