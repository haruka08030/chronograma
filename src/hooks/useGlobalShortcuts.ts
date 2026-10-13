import type { RefObject } from 'react'
import { useTaskStore } from '../store/taskStore'
import { useHotkey } from './useHotkey'
import { SHORTCUTS, dispatchNav, dispatchSelectAll } from '../lib/shortcuts'
import { requestAction, whenElement } from '../lib/pendingAction'
import { focusQuickAdd, focusQuickAddWhenReady, hasQuickAddTarget } from '../lib/quickAddFocus'
import { OPEN_TIMER_ACTION } from '../components/RecordPanel'
import { undoGoogleDelete } from '../lib/googleEventEdit'

/**
 * 画面全体のショートカット（表は `lib/shortcuts.ts` の `SHORTCUTS`）。
 * 1 文字のもの（Google カレンダー風）は入力中・修飾キー付き・ダイアログやカードが開いている間は効かない。
 * ⌘K・⌘N・⌘A・⌘Z は層が開いていても効く
 */
export function useGlobalShortcuts({
  searchRef,
  onShowHelp,
  onOpenPalette,
}: {
  searchRef: RefObject<HTMLInputElement | null>
  onShowHelp: () => void
  /** ⌘K の検索パレットを開く（画面は切り替えない） */
  onOpenPalette: () => void
}) {
  // / は To-Do の検索欄へ。検索欄の無い画面（今日・カレンダーなど）では To-Do へ切り替えてから、欄が出たら入る
  const focusSearch = () => {
    if (!searchRef.current) useTaskStore.getState().selectView('all')
    whenElement(
      () => searchRef.current,
      (el) => el.focus(),
    )
  }

  useHotkey(SHORTCUTS.today.hotkeys, () => dispatchNav('today'))
  useHotkey(SHORTCUTS.next.hotkeys, () => dispatchNav('next'))
  useHotkey(SHORTCUTS.prev.hotkeys, () => dispatchNav('prev'))
  useHotkey(SHORTCUTS.dayView.hotkeys, () => useTaskStore.getState().selectView('planner'))
  useHotkey([...SHORTCUTS.weekView.hotkeys, ...SHORTCUTS.monthView.hotkeys], (e) => {
    const store = useTaskStore.getState()
    store.setCalendarMode(e.key === 'w' ? 'week' : 'month')
    store.selectView('calendar')
  })
  useHotkey(SHORTCUTS.logView.hotkeys, () => {
    // 記録は「今日」に統合。今日を開いて「記録する」を開く
    useTaskStore.getState().selectView('planner')
    requestAction(OPEN_TIMER_ACTION)
  })
  // 追加欄の無い画面では今日を開き、欄が出てからフォーカスする（読み込みに時間がかかっても取りこぼさない）
  useHotkey(SHORTCUTS.create.hotkeys, () => {
    if (!hasQuickAddTarget()) useTaskStore.getState().selectView('planner')
    focusQuickAddWhenReady()
  })
  useHotkey(SHORTCUTS.search.hotkeys, focusSearch)
  useHotkey(SHORTCUTS.help.hotkeys, onShowHelp)

  // ⌘K 検索パレット・⌘N 追加は入力中でも、カードやタスク詳細が開いていても効く。パレットは今の画面の上に出す
  useHotkey(SHORTCUTS.searchAnywhere.hotkeys, onOpenPalette, { scope: 'always', allowInInputs: true })
  useHotkey(
    SHORTCUTS.createAnywhere.hotkeys,
    () => {
      // 追加欄が無ければ To-Do を開いてその欄へ（ストアの requestQuickAdd）
      if (!focusQuickAdd()) useTaskStore.getState().requestQuickAdd()
    },
    { scope: 'always', allowInInputs: true },
  )
  useHotkey(
    SHORTCUTS.selectAll.hotkeys,
    () => {
      // To-Do 一覧ならタスクを全選択。それ以外は、メモなど選べる文字の中にいるときだけその中を全選択し、
      // 画面全体（ボタンや見出しまで）が青くなるブラウザ標準の全選択はしない
      if (dispatchSelectAll()) return
      const anchor = window.getSelection()?.anchorNode
      const box = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('.select-text')
      if (box) window.getSelection()?.selectAllChildren(box)
    },
    { scope: 'always' },
  )
  // 入力中はブラウザのテキスト取り消しを優先する（allowInInputs なし）。戻すものが無ければブラウザに任せる
  useHotkey(
    SHORTCUTS.undo.hotkeys,
    () => {
      const state = useTaskStore.getState()
      // 消したばかりの Google の予定は、トーストと同じくそれを先に戻す
      if (state.googleUndo && undoGoogleDelete()) return
      if (state.undoLastOperation()) return
      if (state.recentDeletes.length === 0) return false
      state.undoDelete()
    },
    { scope: 'always' },
  )
  useHotkey(SHORTCUTS.redo.hotkeys, () => useTaskStore.getState().redoLastOperation(), { scope: 'always' })
  // 記録を止める（l → Enter で間違えて始めたときも、マウスに持ち替えずに止められる。1 分未満は記録に残らない）
  useHotkey(SHORTCUTS.stopLog.hotkeys, () => {
    const state = useTaskStore.getState()
    if (!state.activeTimer) return false
    state.stopTimer()
  })
}
