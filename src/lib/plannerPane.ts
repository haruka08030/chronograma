import { showsDayResult } from './dayPlan'
import { appTodayKey, zonedNow } from './timeZone'

/**
 * スマホの今日の計画で最初に出す面（やること / タイムライン）。
 * 選ぶ前（今日の締めの時刻まで・先の日）は「やること」、決めた後（過ぎた日・今日の締めの時刻から）は予定と記録が並ぶ「タイムライン」。
 * 利用者がタブで選んだら、その日（アプリの今日）のうちはどの日を開いてもそれに従う（画面を移って戻っても同じ）。
 * はじめの案内（「やること」の面にある）を終える・閉じるまでは、時刻に関係なく「やること」
 */
export type PlannerPane = 'list' | 'timeline'

/** その日に選んだ面（日をまたいだら忘れる） */
let chosen: { pane: PlannerPane; todayKey: string } | null = null

/** 開いたときに出す面。`showsResult` は見出しが結果の 1 行になる日か（`showsDayResult`）、`onboarding` ははじめの案内が出ているか */
export function initialPlannerPane(todayKey: string, showsResult: boolean, onboarding = false): PlannerPane {
  if (chosen && chosen.todayKey === todayKey) return chosen.pane
  return showsResult && !onboarding ? 'timeline' : 'list'
}

/** 今開いたときに出す面（時計の購読より前に読むので、今の時刻をここで読む）。`wrapUpFromMinutes` は今日の締めの時刻 */
export function openedPlannerPane(dateKey: string, wrapUpFromMinutes: number, onboarding = false): PlannerPane {
  const now = zonedNow()
  const todayKey = appTodayKey()
  return initialPlannerPane(
    todayKey,
    showsDayResult(dateKey, todayKey, now.getHours() * 60 + now.getMinutes(), wrapUpFromMinutes),
    onboarding,
  )
}

/** タブで面を選んだ */
export function choosePlannerPane(pane: PlannerPane, todayKey: string) {
  chosen = { pane, todayKey }
}

/** テスト用: 選んだ面を忘れる */
export function forgetPlannerPane() {
  chosen = null
}
