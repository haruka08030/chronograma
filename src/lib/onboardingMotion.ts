import { prefersReducedMotion } from '../hooks/usePresence'

/**
 * はじめの案内の間の動き（説明の代わりに、リストとタイムラインがつながっていることを見せる）。
 * 動きを減らす設定のときは何もしない（Web Animations は CSS の一括の止め方が効かないので、ここで止める）
 */

const EASE = 'cubic-bezier(0.2, 0, 0, 1)'

/**
 * 足したばかりの To-Do のタイムラインの枠を、追加欄のあたりから今の場所へ形を変えながら移す（PC）。
 * 枠はタイムラインのスクロールの中で切れるので、写しを画面の一番上に作って飛ばし、着いたら本物を見せる
 */
export function flyIntoTimeline(from: Element, taskId: string) {
  if (prefersReducedMotion()) return
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const block = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(taskId)}"]`)
      if (!block || typeof block.animate !== 'function') return
      block.scrollIntoView({ block: 'nearest' })
      const a = from.getBoundingClientRect()
      const b = block.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) return
      const ghost = block.cloneNode(true) as HTMLElement
      ghost.removeAttribute('data-block-id')
      ghost.setAttribute('aria-hidden', 'true')
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${b.left}px`,
        top: `${b.top}px`,
        width: `${b.width}px`,
        height: `${b.height}px`,
        right: 'auto',
        margin: '0',
        zIndex: '60',
        pointerEvents: 'none',
        transformOrigin: 'top left',
      })
      // 色の決まり（--gc-surface など）は画面全体に付いているので、body の下でも本物と同じ色になる
      document.body.appendChild(ghost)
      const hidden = block.style.visibility
      block.style.visibility = 'hidden'
      const sx = a.width / b.width
      const sy = Math.max(a.height, 1) / b.height
      const flight = ghost.animate(
        [
          { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${sx}, ${sy})`, opacity: 0.3 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 560, easing: EASE },
      )
      const land = () => {
        ghost.remove()
        block.style.visibility = hidden
      }
      flight.onfinish = land
      flight.oncancel = land
    }),
  )
}

type Listener = () => void
const tabListeners = new Set<Listener>()

/** スマホ: 「タイムライン」のタブを少しだけ弾ませる（タイムラインに入ったことを知らせる） */
export function nudgeTimelineTab() {
  if (prefersReducedMotion()) return
  for (const listener of tabListeners) listener()
}

/** タブの側で弾ませ方を登録する。戻り値で外す */
export function onTimelineTabNudge(listener: Listener): () => void {
  tabListeners.add(listener)
  return () => tabListeners.delete(listener)
}

/** 弾ませる動き（少し大きくなって上へ跳ね、もう一度小さく跳ねて戻る） */
export function bounce(el: HTMLElement) {
  if (typeof el.animate !== 'function') return
  // 緩急は区間ごと（全体にかけると跳ねる頂点が一瞬で過ぎる）
  el.animate(
    [
      { transform: 'none', easing: 'ease-out' },
      { transform: 'translateY(-5px) scale(1.08)', offset: 0.25, easing: 'ease-in' },
      { transform: 'none', offset: 0.5, easing: 'ease-out' },
      { transform: 'translateY(-2px) scale(1.03)', offset: 0.7, easing: 'ease-in' },
      { transform: 'none' },
    ],
    { duration: 800 },
  )
}
