/** 押下に続いて届くイベント（離す・クリック・指のあとのマウス互換・長押しのメニュー・指の動き） */
const FOLLOW_UPS = [
  'pointerup',
  'pointercancel',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
] as const

/** 離したあと、遅れて来るクリック（指のあとの互換イベント）を待つ長さ */
const AFTER_UP_MS = 600

let end: (() => void) | null = null

const block = (e: Event) => {
  if (e.cancelable) e.preventDefault()
  e.stopPropagation()
}

/**
 * この押下を「閉じるだけ」にする。下にあるボタン・行・タイムラインには、押下も、そのあとの離す・クリック・
 * 指のあとのクリック・長押し・ドラッグも届けない（window の capture で止める）。
 * 押したまま（離すまで）と、離してから少しの間だけ止める。次の押下はふつうに通す。
 */
export function swallowPress(e: PointerEvent | Event) {
  block(e)
  end?.()
  const id = (e as PointerEvent).pointerId
  let up = false
  let timer = 0
  const opts = { capture: true, passive: false } as const

  const onFollow = (ev: Event) => {
    const pid = (ev as PointerEvent).pointerId
    if (ev.type === 'pointerup' || ev.type === 'pointercancel') {
      block(ev)
      if (pid === id && !up) {
        up = true
        timer = window.setTimeout(stop, AFTER_UP_MS)
      }
      return
    }
    block(ev)
    // マウスはクリックが最後
    if (ev.type === 'click' && up) stop()
  }
  const onDown = (ev: PointerEvent) => {
    // 離したあとの押下・離したのを取りこぼした同じポインターの押下は新しい押下として通す。押したままの別の指は止める
    if (up || ev.pointerId === id) {
      stop()
      return
    }
    block(ev)
  }
  function stop() {
    window.clearTimeout(timer)
    window.removeEventListener('pointerdown', onDown, opts)
    for (const type of FOLLOW_UPS) window.removeEventListener(type, onFollow, opts)
    if (end === stop) end = null
  }

  window.addEventListener('pointerdown', onDown, opts)
  for (const type of FOLLOW_UPS) window.addEventListener(type, onFollow, opts)
  end = stop
}
