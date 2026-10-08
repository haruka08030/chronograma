import { useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from '../../types/task'
import { getMoreSuggestions, groupCandidatesByDue, type DueGroup } from '../../lib/dayPlan'
import { filterCandidates, sortCandidates, type CandidateView } from '../../lib/plannerCandidates'

const MORE_SUGGESTIONS_PAGE = 10

/** 候補の 1 まとまり。締切順は締切の日ごと、それ以外の並び順は見出しなしの 1 つ（`sorted`） */
export type CandidateGroup = DueGroup | { kind: 'sorted'; tasks: Task[] }

/**
 * 今日の計画の候補: 締切間近（`suggestions`）の下に、締切が先のもの・日付なしなどを 10 件ずつスクロールで足していく。
 * 締切の日の見出しで分けたまとまり（`candidateGroups`）と、続きを読み込む目印（`moreSentinelRef`）を返す。
 * 絞り込み（`view`）は全部の候補にかけてから読み込む。締切順以外は見出しで分けず 1 列に並べ直す
 */
export function usePlannerSuggestions({
  tasks,
  dateKey,
  excludedListIds,
  suggestions,
  showSuggestions,
  view,
}: {
  tasks: Task[]
  dateKey: string
  excludedListIds: ReadonlySet<string>
  suggestions: Task[]
  showSuggestions: boolean
  view: CandidateView
}) {
  const moreSuggestions = useMemo(() => getMoreSuggestions(tasks, dateKey, excludedListIds), [tasks, dateKey, excludedListIds])
  const [moreShown, setMoreShown] = useState(MORE_SUGGESTIONS_PAGE)
  const [moreShownFor, setMoreShownFor] = useState(dateKey)
  if (moreShownFor !== dateKey) {
    setMoreShownFor(dateKey)
    setMoreShown(MORE_SUGGESTIONS_PAGE)
  }
  const moreSentinelRef = useRef<HTMLDivElement>(null)
  // 「すべて追加」は締切間近のうち絞り込みに合うもの（締切順のときだけ出す）
  const shownSuggestions = useMemo(() => filterCandidates(suggestions, view), [suggestions, view])
  const shownMore = useMemo(() => filterCandidates(moreSuggestions, view), [moreSuggestions, view])
  const sorted = useMemo(
    () => (view.sort === 'due' ? null : sortCandidates([...shownSuggestions, ...shownMore], view.sort)),
    [view.sort, shownSuggestions, shownMore],
  )
  // 締切順は締切間近を全部出してからその先を 10 件ずつ。並べ直したときは締切間近の件数（10 件より多ければ）から
  const sortedPage = Math.max(MORE_SUGGESTIONS_PAGE, shownSuggestions.length)
  const hasMoreToShow = sorted ? moreShown + sortedPage - MORE_SUGGESTIONS_PAGE < sorted.length : moreShown < shownMore.length
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
  const candidateGroups = useMemo((): CandidateGroup[] => {
    if (sorted) {
      const shown = sorted.slice(0, moreShown + sortedPage - MORE_SUGGESTIONS_PAGE)
      return shown.length > 0 ? [{ kind: 'sorted', tasks: shown }] : []
    }
    return groupCandidatesByDue([...shownSuggestions, ...shownMore.slice(0, moreShown)], dateKey)
  }, [sorted, sortedPage, shownSuggestions, shownMore, moreShown, dateKey])

  return { moreSuggestions, candidateGroups, hasMoreToShow, moreSentinelRef, shownSuggestions: sorted ? [] : shownSuggestions }
}
