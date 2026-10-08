/** 画面の選択・絞り込み・トーストなど、表示の状態 */
import { isTodoSurfaceView, sortKeyOf } from '../../lib/todoSurfaceView'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'

type UiActions = Pick<
  TaskState,
  | 'selectList'
  | 'selectListTag'
  | 'selectView'
  | 'selectColor'
  | 'openSettingsWithScroll'
  | 'clearSettingsScrollTarget'
  | 'selectListSection'
  | 'clearSectionScrollTarget'
  | 'setCalendarMode'
  | 'setSelectedCalendarDateKey'
  | 'setSearchQuery'
  | 'setSortMode'
  | 'setSectionGrouping'
  | 'setPlannerCandidateView'
  | 'setTodoFilter'
  | 'setCompletedFilter'
  | 'setFilterTag'
  | 'requestQuickAdd'
  | 'clearQuickAddRequest'
  | 'showMoveBanner'
  | 'clearMoveBanner'
  | 'clearUndoBanner'
  | 'setTaskDragHoverListId'
>

export function createUiSlice({ set, get, undo }: SliceContext): UiActions {
  const { pushUndo } = undo
  return {
    // 色ラベルの絞り込みはラベルを開いている間だけ。別のリスト・ビューへ移ったら外す
    // リストを開き直したらタグの絞り込みも外す（サイドバーの科目タグから戻れるように）
    selectList: (id) =>
      set({
        selectedListId: id,
        selectedView: null,
        quickAddSectionId: null,
        settingsScrollTarget: null,
        filterColor: null,
        filterTag: null,
      }),
    selectListTag: (listId, tag) =>
      set({
        selectedListId: listId,
        selectedView: null,
        quickAddSectionId: null,
        settingsScrollTarget: null,
        filterColor: null,
        filterTag: tag,
      }),
    selectView: (view) =>
      set({
        selectedView: view,
        selectedListId: null,
        quickAddSectionId: null,
        settingsScrollTarget: null,
        filterColor: null,
      }),
    selectColor: (hex) =>
      set({
        selectedView: 'all',
        selectedListId: null,
        quickAddSectionId: null,
        settingsScrollTarget: null,
        filterColor: hex.toUpperCase(),
      }),
    openSettingsWithScroll: (target) =>
      set({
        selectedView: 'settings',
        selectedListId: null,
        quickAddSectionId: null,
        settingsScrollTarget: target,
      }),
    clearSettingsScrollTarget: () => set({ settingsScrollTarget: null }),
    selectListSection: (listId, sectionId) =>
      set({
        selectedListId: listId,
        selectedView: null,
        quickAddSectionId: sectionId,
        sectionScrollTarget: sectionId,
        settingsScrollTarget: null,
        filterColor: null,
      }),
    clearSectionScrollTarget: () => set({ sectionScrollTarget: null }),
    setCalendarMode: (mode) => {
      pushUndo()
      set({ calendarMode: mode })
    },
    // 見ている日は画面の状態（取り消しの対象にしない）。今日の計画・カレンダー・習慣で共有する
    setSelectedCalendarDateKey: (key) => set({ selectedCalendarDateKey: key }),
    setSearchQuery: (q) => set({ searchQuery: q }),
    setSortMode: (mode) => {
      pushUndo()
      set((s) => ({ sortByKey: { ...s.sortByKey, [sortKeyOf(s.selectedListId, s.selectedView, s.filterColor)]: mode } }))
    },
    setSectionGrouping: (scope, on) =>
      set((s) => ({
        sectionGrouping:
          typeof scope === 'object'
            ? { ...s.sectionGrouping, byList: { ...s.sectionGrouping.byList, [scope.listId]: on } }
            : { ...s.sectionGrouping, [scope]: on },
      })),
    setPlannerCandidateView: (patch) => set((s) => ({ plannerCandidateView: { ...s.plannerCandidateView, ...patch } })),
    setTodoFilter: (patch) => set((s) => ({ todoFilter: { ...s.todoFilter, ...patch } })),
    setCompletedFilter: (patch) => set((s) => ({ completedFilter: { ...s.completedFilter, ...patch } })),
    setFilterTag: (tag) => {
      pushUndo()
      set({ filterTag: tag })
    },
    requestQuickAdd: (prefill) => {
      const s = get()
      const quickAddPrefill = prefill ?? null
      // To-Do の一覧（すべて・今日など・いつか・買い物）ならその場で追加する（色ラベルを開いていれば、追加したタスクにその色が付く）。
      // ほかの画面からは「すべて」へ
      if (!isTodoSurfaceView(s.selectedView)) {
        set({
          selectedListId: null,
          selectedView: 'all',
          filterColor: null,
          quickAddSectionId: null,
          quickAddRequested: true,
          quickAddPrefill,
        })
      } else {
        set({ quickAddRequested: true, quickAddPrefill })
      }
    },
    clearQuickAddRequest: () => set({ quickAddRequested: false, quickAddPrefill: null }),

    showMoveBanner: (text) => set({ moveBannerText: text }),
    clearMoveBanner: () => set({ moveBannerText: null }),

    clearUndoBanner: () => set({ undoBanner: null }),

    setTaskDragHoverListId: (id) => set({ taskDragHoverListId: id }),
  }
}
