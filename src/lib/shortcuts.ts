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

/** 入力中（テキスト欄・選択・contenteditable）はショートカットを無視する */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/** ヘルプに出す一覧（キー → 説明の i18n キー） */
export const SHORTCUT_LIST: { keys: string[]; label: string }[] = [
  { keys: ['t'], label: 'shortcuts.today' },
  { keys: ['j', 'n'], label: 'shortcuts.next' },
  { keys: ['k', 'p'], label: 'shortcuts.prev' },
  { keys: ['d'], label: 'shortcuts.dayView' },
  { keys: ['w'], label: 'shortcuts.weekView' },
  { keys: ['m'], label: 'shortcuts.monthView' },
  { keys: ['l'], label: 'shortcuts.logView' },
  { keys: ['c'], label: 'shortcuts.create' },
  { keys: ['/'], label: 'shortcuts.search' },
  { keys: ['e'], label: 'shortcuts.edit' },
  { keys: ['Delete'], label: 'shortcuts.delete' },
  { keys: ['Esc'], label: 'shortcuts.close' },
  { keys: ['⌘', 'Z'], label: 'shortcuts.undo' },
  { keys: ['?'], label: 'shortcuts.help' },
]
