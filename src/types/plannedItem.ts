import type { PlanSlot } from '../../supabase/functions/_shared/dayResult.ts'

/** Unified shape for matching (Google / 自分で配置したタスク / 予定（授業・バイト） / 習慣スロット) */
export type { PlannedSource } from '../../supabase/functions/_shared/dayResult.ts'

export interface PlannedItem extends PlanSlot {
  /** Google の予定の色（解決済み）。記録にするときもこの色を写す */
  color?: string
}
