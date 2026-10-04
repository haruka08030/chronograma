import { useEffect, useRef } from 'react'

/** 画面ごとの日付移動（今日 / 前 / 次）。各画面が自分の日付 state を持つので、イベントで伝える */
export type NavAction = 'today' | 'prev' | 'next'

const NAV_EVENT = 'chronograma:nav'

export function dispatchNav(action: NavAction) {
  window.dispatchEvent(new CustomEvent<NavAction>(NAV_EVENT, { detail: action }))
}

/** t / j / k などの日付移動を、表示中の画面で受け取る */
export function useNavShortcut(handlers: Partial<Record<NavAction, () => void>>) {
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })
  useEffect(() => {
    const on = (e: Event) => ref.current[(e as CustomEvent<NavAction>).detail]?.()
    window.addEventListener(NAV_EVENT, on)
    return () => window.removeEventListener(NAV_EVENT, on)
  }, [])
}

const SELECT_ALL_EVENT = 'chronograma:select-all'

/**
 * ⌘A を表示中の画面に渡す。受け取った画面が preventDefault したら true（その画面が全選択した）
 */
export function dispatchSelectAll(): boolean {
  const ev = new Event(SELECT_ALL_EVENT, { cancelable: true })
  window.dispatchEvent(ev)
  return ev.defaultPrevented
}

/** ⌘A を表示中の画面で受け取る。全選択できたら true を返す */
export function useSelectAllShortcut(handler: () => boolean) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    const on = (e: Event) => {
      if (ref.current()) e.preventDefault()
    }
    window.addEventListener(SELECT_ALL_EVENT, on)
    return () => window.removeEventListener(SELECT_ALL_EVENT, on)
  }, [])
}

/**
 * ショートカットの表（1 つだけ）。処理の登録（`useHotkey(SHORTCUTS.x.hotkeys, …)`）・「?」の一覧・ボタンのヒント（`shortcutTip`）を
 * ここから作る。別々に書くと、一覧に載っているのに効かない・ヒントのキーが違う、がおきる。
 * - hotkeys: `useHotkey` に渡すキー（'mod' は ⌘ / Ctrl）
 * - display: 一覧とヒントに出すキー。外側の並びは「どれか」（J / N）、内側は「同時に」（⌘ + A）。'mod' は ⌘ / Ctrl
 * - label: 説明の i18n キー
 */
export const SHORTCUTS = {
  today: { hotkeys: ['t'], display: [['T']], label: 'shortcuts.today' },
  next: { hotkeys: ['j', 'n'], display: [['J'], ['N']], label: 'shortcuts.next' },
  prev: { hotkeys: ['k', 'p'], display: [['K'], ['P']], label: 'shortcuts.prev' },
  dayView: { hotkeys: ['d'], display: [['D']], label: 'shortcuts.dayView' },
  weekView: { hotkeys: ['w'], display: [['W']], label: 'shortcuts.weekView' },
  monthView: { hotkeys: ['m'], display: [['M']], label: 'shortcuts.monthView' },
  logView: { hotkeys: ['l'], display: [['L']], label: 'shortcuts.logView' },
  stopLog: { hotkeys: ['shift+l'], display: [['Shift', 'L']], label: 'shortcuts.stopLog' },
  create: { hotkeys: ['c'], display: [['C']], label: 'shortcuts.create' },
  createAnywhere: { hotkeys: ['mod+n'], display: [['mod', 'N']], label: 'shortcuts.createAnywhere' },
  search: { hotkeys: ['/'], display: [['/']], label: 'shortcuts.search' },
  searchAnywhere: { hotkeys: ['mod+k'], display: [['mod', 'K']], label: 'shortcuts.searchAnywhere' },
  edit: { hotkeys: ['e'], display: [['E']], label: 'shortcuts.edit' },
  delete: { hotkeys: ['Delete', 'Backspace'], display: [['Delete']], label: 'shortcuts.delete' },
  moveRow: { hotkeys: ['ArrowDown', 'ArrowUp', 'shift+ArrowDown', 'shift+ArrowUp'], display: [['↑'], ['↓']], label: 'shortcuts.moveRow' },
  openRow: { hotkeys: ['Enter'], display: [['Enter']], label: 'shortcuts.openRow' },
  completeRow: { hotkeys: ['Space'], display: [['Space']], label: 'shortcuts.completeRow' },
  selectAll: { hotkeys: ['mod+a'], display: [['mod', 'A']], label: 'shortcuts.selectAll' },
  openMenu: { hotkeys: ['mod+/', 'ContextMenu', 'shift+F10'], display: [['mod', '/']], label: 'shortcuts.openMenu' },
  completeSelected: { hotkeys: ['mod+Enter'], display: [['mod', 'Enter']], label: 'shortcuts.completeSelected' },
  close: { hotkeys: ['Escape'], display: [['Esc']], label: 'shortcuts.close' },
  undo: { hotkeys: ['mod+z'], display: [['mod', 'Z']], label: 'shortcuts.undo' },
  redo: { hotkeys: ['mod+shift+z'], display: [['mod', 'Shift', 'Z']], label: 'shortcuts.redo' },
  help: { hotkeys: ['?'], display: [['?']], label: 'shortcuts.help' },
} as const satisfies Record<string, { hotkeys: readonly string[]; display: readonly (readonly string[])[]; label: string }>

export type ShortcutId = keyof typeof SHORTCUTS

/** ヘルプに出す一覧（表の順）。'mod' は ⌘ / Ctrl（`modKeyLabel`） */
export const SHORTCUT_LIST: { keys: string[]; label: string }[] = Object.values(SHORTCUTS).map((s) => ({
  keys: s.display.flat(),
  label: s.label,
}))
