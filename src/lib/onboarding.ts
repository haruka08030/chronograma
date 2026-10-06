import { isEventTask, isLogTask, isSleepTask, isTodoTask, type Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'

/**
 * はじめて使う人の 3 ステップ（今日の画面）。やったかどうかは手元のデータから決める（押した記録は持たない）:
 * ① やることを 1 つ入れる ② 時間に置く ③ ▶ で記録する
 */
export type OnboardingSteps = {
  /** To-Do が 1 つでもある */
  added: boolean
  /** 時間帯（開始と終了）のある To-Do がある（タイムラインに置いた・時刻つきで足した） */
  placed: boolean
  /** 記録がある、またはタイマーが動いている */
  recorded: boolean
}

export function onboardingSteps(tasks: readonly Task[], timerRunning: boolean): OnboardingSteps {
  let added = false
  let placed = false
  let recorded = timerRunning
  for (const t of tasks) {
    if (!isActiveTask(t)) continue
    if (isTodoTask(t)) {
      added = true
      if (t.startTime && t.endTime) placed = true
    } else if (isEventTask(t)) {
      // カレンダーに予定を入れたら「置いた」
      if (t.startTime && t.endTime) placed = true
    } else if (isLogTask(t) && !isSleepTask(t)) {
      recorded = true
    }
  }
  return { added, placed, recorded }
}

export function allOnboardingStepsDone(steps: OnboardingSteps): boolean {
  return steps.added && steps.placed && steps.recorded
}

/**
 * すでに使っている人か（案内を出さない）。タスク・記録・習慣のどれかがあれば使っている。
 * 前の版から引き継いだデータ・取り込んだバックアップ・初めての同期で届いたアカウントのデータに使う
 */
export function hasExistingData(data: { tasks?: readonly unknown[]; habits?: readonly unknown[] }): boolean {
  return (data.tasks?.length ?? 0) > 0 || (data.habits?.length ?? 0) > 0
}
