/** 画面の選択・絞り込み・トーストなど、表示の状態 */
import { sortKeyOf } from '../../lib/todoSurfaceView'
import { INBOX_ID } from '../storeConstants'
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
    selectList: (id) => set({ selectedListId: id, selectedView: null, quickAddSectionId: null, settingsScrollTarget: null, filterColor: null, filterTag: null }),
    selectListTag: (listId, tag) =>
      set({ selectedListId: listId, selectedView: null, quickAddSectionId: null, settingsScrollTarget: null, filterColor: null, filterTag: tag }),
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
    setSelectedCalendarDateKey: (key) => {
      pushUndo()
      set({ selectedCalendarDateKey: key })
    },
    setSearchQuery: (q) => set({ searchQuery: q }),
    setSortMode: (mode) => {
      pushUndo()
      set((s) => ({ sortByKey: { ...s.sortByKey, [sortKeyOf(s.selectedListId, s.selectedView)]: mode } }))
    },
    setSectionGrouping: (scope, on) =>
      set((s) => ({
        sectionGrouping:
          typeof scope === 'object'
            ? { ...s.sectionGrouping, byList: { ...s.sectionGrouping.byList, [scope.listId]: on } }
            : { ...s.sectionGrouping, [scope]: on },
      })),
    setFilterTag: (tag) => {
      pushUndo()
      set({ filterTag: tag })
    },
    requestQuickAdd: () => {
      const s = get()
      // 色ラベルを開いているときはその場で追加する（追加したタスクにその色が付く）
      const colorView = s.selectedView === 'all' && s.filterColor !== null
      if (s.selectedView !== null && !colorView) {
        set({ selectedListId: s.selectedListId ?? INBOX_ID, selectedView: null, quickAddRequested: true })
      } else {
        set({ quickAddRequested: true })
      }
    },
    clearQuickAddRequest: () => set({ quickAddRequested: false }),

    showMoveBanner: (text) => set({ moveBannerText: text }),
    clearMoveBanner: () => set({ moveBannerText: null }),

    clearUndoBanner: () => set({ undoBanner: null }),

    setTaskDragHoverListId: (id) => set({ taskDragHoverListId: id }),
  }
}
