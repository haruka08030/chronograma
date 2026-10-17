import { useTaskStore } from '../store/taskStore'
import { isAddonOn, type AddonId } from '../lib/addons'

/** 追加機能（#453）がオンか。オフの機能は普段の画面に出さない */
export function useAddonOn(id: AddonId): boolean {
  return useTaskStore((s) => isAddonOn(s.addons, id, s.tasks))
}
