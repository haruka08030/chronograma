import { useEffect, useState } from 'react'

/** CSS メディアクエリの一致状態を購読する。SSR/初期描画は false 相当で安全側。 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Tailwind の `md`(≥768px) 以上か。詳細ペインの分割/モーダル切替などに使う。 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)')
}
