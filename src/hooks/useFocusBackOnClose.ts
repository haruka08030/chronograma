import { useEffect, useRef, type RefObject } from 'react'

/**
 * その場で開く欄（題名の編集・記録の入力など）を閉じたとき、フォーカスを開いた元（ボタン・題名）へ戻す。
 * 閉じた欄が消えるとフォーカスは BODY に落ち、次の Tab がサイドバーからやり直しになるため。
 * 別の所を押して閉じたとき（フォーカスがもう移っている）は奪わない
 */
export function useFocusBackOnClose(open: boolean, target: RefObject<HTMLElement | null>) {
  const wasOpen = useRef(open)
  useEffect(() => {
    if (wasOpen.current && !open) {
      const active = document.activeElement
      if (!active || active === document.body) target.current?.focus()
    }
    wasOpen.current = open
  }, [open, target])
}
