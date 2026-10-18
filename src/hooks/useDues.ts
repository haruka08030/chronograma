import { useTaskStore } from '../store/taskStore'
import type { DueItem } from '../lib/dues'
import { useAddonOn } from './useAddon'

const NONE: DueItem[] = []

/** 引き落とし・期限の日（#454）。追加機能がオフなら空（カレンダー・今日の計画に出さない） */
export function useDues(): DueItem[] {
  const on = useAddonOn('dues')
  const dues = useTaskStore((s) => s.addons.dues)
  return on ? dues : NONE
}
