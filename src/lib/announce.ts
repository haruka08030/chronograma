/**
 * 画面には出さず、読み上げにだけ伝える（キーでブロックを動かしたときの新しい時刻など）。
 * 見えない `role="status"` の欄を 1 つだけ作って使い回す。同じ文が続いても読まれるよう、一度空にしてから入れる
 */
let region: HTMLElement | null = null

function ensureRegion(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  if (region && document.body.contains(region)) return region
  region = document.createElement('div')
  region.setAttribute('role', 'status')
  region.setAttribute('aria-live', 'polite')
  region.setAttribute('aria-atomic', 'true')
  region.className = 'sr-only'
  region.dataset.testid = 'live-announcer'
  document.body.appendChild(region)
  return region
}

export function announce(text: string) {
  const el = ensureRegion()
  if (!el) return
  el.textContent = ''
  // 空にした変化と入れた変化を分ける（同じ文を続けて入れても読み上げさせる）
  window.setTimeout(() => {
    el.textContent = text
  }, 30)
}
