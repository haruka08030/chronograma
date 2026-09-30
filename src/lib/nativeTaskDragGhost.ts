/**
 * ネイティブ D&D でタスクをドラッグするときの見た目。
 * ブラウザ標準のドラッグ画像（横長の行のスナップショット）は使わず、カーソルに追従する
 * 小さなカードを自前で描画する。タイムライン上では仮の時間ブロックだけを見せたいので、
 * useTimelineDrop が受け付けた dragover の間はカードを隠す。
 */

const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
let transparentImage: HTMLImageElement | null = null
if (typeof Image !== 'undefined') {
  transparentImage = new Image()
  transparentImage.src = TRANSPARENT_GIF
}

const OFFSET_X = 14
const OFFSET_Y = 14

let lastTimelineDragOver: Event | null = null

/** タイムラインが dragover を受け付けた（仮ブロックを表示中）ことを通知する */
export function markTimelineDragOver(e: Event) {
  lastTimelineDragOver = e
}

function buildGhost(title: string, count: number): HTMLDivElement {
  const dark = document.documentElement.classList.contains('dark')
  const ghost = document.createElement('div')
  ghost.style.cssText =
    'position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;visibility:hidden;' +
    'display:flex;align-items:center;gap:8px;max-width:280px;padding:6px 10px;' +
    'border-radius:10px;font-size:13px;font-weight:500;white-space:nowrap;' +
    'box-shadow:0 10px 24px rgba(0,0,0,0.22);' +
    (dark
      ? 'background:#18181b;color:#fafafa;border:1px solid rgba(255,255,255,0.12);'
      : 'background:#ffffff;color:#18181b;border:1px solid rgba(0,0,0,0.08);')
  const label = document.createElement('span')
  label.textContent = title
  label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;'
  ghost.appendChild(label)
  if (count > 1) {
    const badge = document.createElement('span')
    badge.textContent = String(count)
    badge.style.cssText =
      'flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;' +
      'padding:0 6px;border-radius:9999px;font-size:12px;font-weight:600;' +
      (dark ? 'background:#fafafa;color:#18181b;' : 'background:#18181b;color:#fafafa;')
    ghost.appendChild(badge)
  }
  return ghost
}

/** dragstart ハンドラ内で呼ぶ。標準のドラッグ画像を消し、追従カードを表示する */
export function startNativeTaskDragGhost(e: React.DragEvent, title: string, count = 1) {
  if (transparentImage) e.dataTransfer.setDragImage(transparentImage, 0, 0)

  const ghost = buildGhost(title, count)
  document.body.appendChild(ghost)

  const place = (x: number, y: number) => {
    ghost.style.transform = `translate(${x + OFFSET_X}px, ${y + OFFSET_Y}px)`
  }
  place(e.clientX, e.clientY)
  ghost.style.visibility = 'visible'

  // React のハンドラ（ルート要素に委譲）の後に走るよう window のバブリングで拾う
  const onDragOver = (ev: DragEvent) => {
    if (ev.clientX === 0 && ev.clientY === 0) return
    place(ev.clientX, ev.clientY)
    ghost.style.visibility = ev === lastTimelineDragOver ? 'hidden' : 'visible'
  }
  const cleanup = () => {
    lastTimelineDragOver = null
    ghost.remove()
    window.removeEventListener('dragover', onDragOver)
    window.removeEventListener('dragend', cleanup, true)
    window.removeEventListener('drop', cleanup, true)
  }
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragend', cleanup, true)
  window.addEventListener('drop', cleanup, true)
}
