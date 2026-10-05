import { useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from '../../types/task'
import { getMoreSuggestions, groupCandidatesByDue } from '../../lib/dayPlan'

const MORE_SUGGESTIONS_PAGE = 10

/**
 * 今日の計画の候補: 締切間近（`suggestions`）の下に、締切が先のもの・日付なしなどを 10 件ずつスクロールで足していく。
 * 締切の日の見出しで分けたまとまり（`candidateGroups`）と、続きを読み込む目印（`moreSentinelRef`）を返す
 */
export function usePlannerSuggestions({
  tasks,
  dateKey,
  excludedListIds,
  suggestions,
  showSuggestions,
}: {
  tasks: Task[]
  dateKey: string
  excludedListIds: ReadonlySet<string>
  suggestions: Task[]
  showSuggestions: boolean
}) {
  const moreSuggestions = useMemo(() => getMoreSuggestions(tasks, dateKey, excludedListIds), [tasks, dateKey, excludedListIds])
  const [moreShown, setMoreShown] = useState(MORE_SUGGESTIONS_PAGE)
  const [moreShownFor, setMoreShownFor] = useState(dateKey)
  if (moreShownFor !== dateKey) {
    setMoreShownFor(dateKey)
    setMoreShown(MORE_SUGGESTIONS_PAGE)
  }
  const moreSentinelRef = useRef<HTMLDivElement>(null)
  const hasMoreToShow = moreShown < moreSuggestions.length
  useEffect(() => {
    const el = moreSentinelRef.current
    if (!el || !showSuggestions || !hasMoreToShow) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setMoreShown((n) => n + MORE_SUGGESTIONS_PAGE)
      },
      { rootMargin: '0px 0px 200px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [showSuggestions, hasMoreToShow, moreShown])

  // 候補（締切間近 → その先 → 日付なし…）を締切の日の見出しで分ける。行に「〜まで」を並べない
  const candidateGroups = useMemo(
    () => groupCandidatesByDue([...suggestions, ...moreSuggestions.slice(0, moreShown)], dateKey),
    [suggestions, moreSuggestions, moreShown, dateKey],
  )

  return { moreSuggestions, candidateGroups, hasMoreToShow, moreSentinelRef }
}
