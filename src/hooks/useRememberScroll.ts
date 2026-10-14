import { useLayoutEffect, type RefObject } from 'react'

/** 画面ごとの縦スクロールの位置。アプリを開いている間だけ覚える（再読み込みで先頭に戻る） */
const remembered = new Map<string, number>()

export function rememberedScroll(key: string): number | undefined {
  return remembered.get(key)
}

export function rememberScroll(key: string, top: number) {
  remembered.set(key, top)
}

/** 中身が後から伸びるのを待つ長さ。見えてからこの間に届かなければ諦める */
const RESTORE_WINDOW_MS = 2000

/**
 * 画面を切り替えて戻ったら、離れたときのスクロール位置から出す。
 * key ごとに覚える（画面・リストごと）。key が null のときは何もしない
 */
export function useRememberScroll(ref: RefObject<HTMLElement | null>, key: string | null) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || key === null) return
    const target = remembered.get(key) ?? 0
    el.scrollTop = target
    let restoring = target > 0 && Math.abs(el.scrollTop - target) >= 1

    let timer: ReturnType<typeof setTimeout> | undefined
    let ro: ResizeObserver | undefined
    const stop = () => {
      restoring = false
      ro?.disconnect()
      if (timer !== undefined) clearTimeout(timer)
    }
    // 隠れている間（スマホの片方のタブ）は合わせられないので、見えてから待ち始める
    const startWindow = () => {
      if (timer === undefined && el.clientHeight > 0) timer = setTimeout(stop, RESTORE_WINDOW_MS)
    }
    if (restoring && typeof ResizeObserver !== 'undefined') {
      // 遅れて読む部品・同期で中身が伸びたら、届くまで合わせ直す
      ro = new ResizeObserver(() => {
        if (!restoring || el.clientHeight === 0) return
        startWindow()
        el.scrollTop = target
        if (Math.abs(el.scrollTop - target) < 1) stop()
      })
      ro.observe(el)
      for (const child of Array.from(el.children)) ro.observe(child)
      startWindow()
    } else {
      restoring = false
    }

    const onScroll = () => {
      if (!restoring) {
        remembered.set(key, el.scrollTop)
        return
      }
      // 届かず端で止まったのではなく別の位置へ動いた（行き先へのスクロールなど）なら、そちらに任せる
      const atEnd = el.scrollTop >= el.scrollHeight - el.clientHeight - 1
      if (Math.abs(el.scrollTop - target) >= 1 && !atEnd) {
        stop()
        remembered.set(key, el.scrollTop)
      }
    }
    // 利用者が自分で動かしたら、それ以上は合わせない
    const onUserScroll = () => {
      if (restoring) stop()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', onUserScroll, { passive: true })
    el.addEventListener('touchstart', onUserScroll, { passive: true })
    el.addEventListener('keydown', onUserScroll)
    return () => {
      stop()
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onUserScroll)
      el.removeEventListener('touchstart', onUserScroll)
      el.removeEventListener('keydown', onUserScroll)
    }
  }, [ref, key])
}
