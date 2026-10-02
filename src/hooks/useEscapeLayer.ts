import { useEffect, useRef } from 'react'
import { isTypingTarget } from '../lib/shortcuts'

/**
 * Esc で閉じる層（ドロワー・モーダル・ポップオーバー）の積み重ね。
 * Esc は一番上の 1 枚だけを閉じる（タスク詳細の上の日付ピッカーで Esc → ピッカーだけ閉じる）。
 */
const layers: { close: () => void }[] = []

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return
  // 入力欄の Esc は欄のほうで扱う（元に戻す・クリアする）。閉じるのはその次の Esc
  if (isTypingTarget(e.target)) return
  const top = layers.at(-1)
  if (!top) return
  e.preventDefault()
  // 下の層や画面全体の Esc（選択の解除など）には渡さない
  e.stopPropagation()
  top.close()
}

/** 開いている間、この層を Esc で閉じられるようにする。返す関数は「いま一番上の層か」 */
export function useEscapeLayer(onClose: () => void, active = true): () => boolean {
  const closeRef = useRef(onClose)
  const layerRef = useRef<{ close: () => void } | null>(null)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    if (!active) return
    const layer = { close: () => closeRef.current() }
    layerRef.current = layer
    layers.push(layer)
    if (layers.length === 1) window.addEventListener('keydown', onKeyDown, true)
    return () => {
      const i = layers.indexOf(layer)
      if (i >= 0) layers.splice(i, 1)
      if (layers.length === 0) window.removeEventListener('keydown', onKeyDown, true)
      layerRef.current = null
    }
  }, [active])
  return () => layerRef.current !== null && layers.at(-1) === layerRef.current
}
