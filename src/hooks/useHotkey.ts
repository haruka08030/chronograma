import { useEffect, useRef, useState } from 'react'
import { isImeKeyEvent, isTypingTarget, matchesHotkey } from '../lib/keyboard'

/**
 * キーボードショートカットの仕組み（1 つだけ）。
 *
 * - 層: Esc で閉じるもの（ドロワー・モーダル・ポップオーバー・予定カード）の積み重ね。
 *   Esc は一番上の 1 枚だけを閉じる（タスク詳細の上の日付ピッカーで Esc → ピッカーだけ閉じる）
 * - キー: `useHotkey` で登録する。どこで効くかは scope で決める
 *   - 'global'（既定）: 層が 1 枚も開いていないときだけ（1 文字のショートカット・To-Do の行の操作）
 *   - 'always': 層が開いていても効く（⌘Z・⌘K など）。モーダルの中だけは効かない
 *   - 層（`useEscapeLayer` / `useDismiss` の戻り値）: その層が一番上のときだけ（予定カードの e・Delete）
 * - 入力中（`isTypingTarget`）・日本語の変換中は動かさない。入力中も効かせるものだけ allowInInputs
 * - 部品が先に使ったキー（preventDefault 済み）は拾わない
 */

export type HotkeyLayer = {
  close: () => void
  /** いま一番上の層か */
  isTop: () => boolean
}

export type HotkeyScope = 'global' | 'always' | HotkeyLayer

export type HotkeyOptions = {
  scope?: HotkeyScope
  /** 入力欄にフォーカスがあっても効かせる */
  allowInInputs?: boolean
  enabled?: boolean
}

/** false を返すと「使わなかった」扱いで、preventDefault せず次の登録に回す */
export type HotkeyHandler = (e: KeyboardEvent) => boolean | void

type Entry = {
  keys: string[]
  handler: { current: HotkeyHandler }
  options: { current: HotkeyOptions }
}

const layers: HotkeyLayer[] = []
const entries: Entry[] = []

/** Esc は先回り（capture）して一番上の層だけを閉じ、下の層や画面全体の Esc（選択の解除など）には渡さない */
function onEscapeCapture(e: KeyboardEvent) {
  // document の KeyboardEvent（React の nativeEvent が無い）なので isCancelEscape は使えない。変換中の Esc は同じ行の isImeKeyEvent で除く
  // eslint-disable-next-line no-restricted-syntax
  if (e.key !== 'Escape' || isImeKeyEvent(e) || e.defaultPrevented) return
  // 入力欄の Esc は欄のほうで扱う（元に戻す・クリアする）。閉じるのはその次の Esc
  if (isTypingTarget(e.target)) return
  const top = layers.at(-1)
  if (!top) return
  e.preventDefault()
  e.stopPropagation()
  top.close()
}

/**
 * 登録したキーを 1 つだけ実行する。ふだんは window のリスナーから呼ばれる。
 * キー入力を外へ流さないモーダルは、自分の層のキーだけ（layerOnly）ここへ渡す
 */
export function dispatchHotkey(e: KeyboardEvent, { layerOnly = false }: { layerOnly?: boolean } = {}) {
  if (isImeKeyEvent(e) || e.defaultPrevented) return
  const top = layers.at(-1)
  const typing = isTypingTarget(e.target)
  for (const entry of [...entries]) {
    const { scope = 'global', allowInInputs = false, enabled = true } = entry.options.current
    if (!enabled) continue
    const inScope = typeof scope === 'object' ? scope === top : !layerOnly && (scope === 'always' || !top)
    if (!inScope) continue
    if (typing && !allowInInputs) continue
    if (!entry.keys.some((k) => matchesHotkey(e, k))) continue
    if (entry.handler.current(e) === false) continue
    e.preventDefault()
    return
  }
}

const onKeyDown = (e: KeyboardEvent) => dispatchHotkey(e)

let listening = false
function ensureListeners() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('keydown', onEscapeCapture, true)
  window.addEventListener('keydown', onKeyDown)
}

/**
 * キーを登録する。keys は 'e'・'Delete'・'mod+Enter'・'shift+ArrowDown'・'?' など（`matchesHotkey`）
 *   useHotkey('e', () => openDetail(id), { scope: layer })
 */
export function useHotkey(keys: string | readonly string[], handler: HotkeyHandler, options: HotkeyOptions = {}) {
  const handlerRef = useRef(handler)
  const optionsRef = useRef(options)
  useEffect(() => {
    handlerRef.current = handler
    optionsRef.current = options
  })
  const keyList = (Array.isArray(keys) ? keys : [keys]).join('\n')
  useEffect(() => {
    const entry: Entry = { keys: keyList.split('\n'), handler: handlerRef, options: optionsRef }
    entries.push(entry)
    ensureListeners()
    return () => {
      const i = entries.indexOf(entry)
      if (i >= 0) entries.splice(i, 1)
    }
  }, [keyList])
}

/** 開いている間、この層を Esc で閉じられるようにする。返す層は `useHotkey` の scope に使う */
export function useEscapeLayer(onClose: () => void, active = true): HotkeyLayer {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  const [layer] = useState<HotkeyLayer>(() => {
    const self: HotkeyLayer = {
      close: () => closeRef.current(),
      isTop: () => layers.at(-1) === self,
    }
    return self
  })
  useEffect(() => {
    if (!active) return
    layers.push(layer)
    ensureListeners()
    return () => {
      const i = layers.indexOf(layer)
      if (i >= 0) layers.splice(i, 1)
    }
  }, [active, layer])
  return layer
}
