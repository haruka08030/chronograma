import type { Habit, HabitPastRule } from '../types/habit'
import { sameValue } from './sameValue'

/** 日によって変わる設定の項目（変えたら前の日の設定を残す） */
const RULE_KEYS = ['timeMode', 'startTime', 'endTime', 'frequency', 'weekdayTimes', 'goalMinutes'] as const

/** 作った習慣の前の日の設定: 今日より前は予定の日にしない */
export function createdPastRules(todayKey: string): HabitPastRule[] {
  return [{ until: todayKey, off: true }]
}

/**
 * 設定を変えた習慣の前の日の設定。頻度・時間・時間の目標が変わったら、今日より前を前の設定のまま残す。
 * 今日すでに残してあれば（作った日・同じ日に 2 度目）そのまま（その日の最初の前の設定を残す）
 */
export function pastRulesAfterEdit(before: Habit, after: Habit, todayKey: string): HabitPastRule[] | undefined {
  const rules = before.pastRules
  if (RULE_KEYS.every((k) => sameValue(before[k] ?? null, after[k] ?? null))) return rules
  const last = rules?.[rules.length - 1]
  if (last && last.until >= todayKey) return rules
  const rule: HabitPastRule = {
    until: todayKey,
    timeMode: before.timeMode,
    startTime: before.startTime,
    endTime: before.endTime,
    frequency: before.frequency,
    ...(before.weekdayTimes ? { weekdayTimes: before.weekdayTimes } : {}),
    ...(before.goalMinutes ? { goalMinutes: before.goalMinutes } : {}),
  }
  return [...(rules ?? []), rule]
}
