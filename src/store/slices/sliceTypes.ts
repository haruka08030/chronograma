import type { StoreApi } from 'zustand'
import type { TaskState } from '../storeTypes'
import type { UndoHistory } from '../undo'

export type StoreSet = StoreApi<TaskState>['setState']
export type StoreGet = () => TaskState

/** 各 slice に渡すもの。`undo` は全 slice で共有する 1 つの ⌘Z 履歴 */
export interface SliceContext {
  set: StoreSet
  get: StoreGet
  undo: UndoHistory
}
