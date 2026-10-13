import { useCallback, useMemo, useState } from 'react'
import type { Task } from '../../types/task'
import { getMoreSuggestions, groupCandidatesByDue, type DueGroup } from '../../lib/dayPlan'
import { sortCandidates, type CandidateView } from '../../lib/plannerCandidates'
import { filterTasks } from '../../lib/taskFilter'

const MORE_SUGGESTIONS_PAGE = 10

/** 候補の 1 まとまり。締切順は締切の日ごと、それ以外の並び順は見出しなしの 1 つ（`sorted`） */
export type CandidateGroup = DueGroup | { kind: 'sorted'; tasks: Task[] }

/**
 * 今日の計画の候補: 締切間近（`suggestions`）の下に、締切が先のもの・日付なしなどを「さらに表示」で 10 件ずつ足していく
 * （スクロールで足し続けると、下の習慣・完了・締めに届かない）。
 * 締切の日の見出しで分けたまとまり（`candidateGroups`）と、残りの件数（`remaining`）・足す操作（`showMore`）を返す。
 * 絞り込み（`view`）は全部の候補にかけてから読み込む。締切順以外は見出しで分けず 1 列に並べ直す
 */
export function usePlannerSuggestions({
  tasks,
  dateKey,
  excludedListIds,
  suggestions,
  view,
}: {
  tasks: Task[]
  dateKey: string
  excludedListIds: ReadonlySet<string>
  suggestions: Task[]
  view: CandidateView
}) {
  const moreSuggestions = useMemo(() => getMoreSuggestions(tasks, dateKey, excludedListIds), [tasks, dateKey, excludedListIds])
  const [moreShown, setMoreShown] = useState(MORE_SUGGESTIONS_PAGE)
  const [moreShownFor, setMoreShownFor] = useState(dateKey)
  if (moreShownFor !== dateKey) {
    setMoreShownFor(dateKey)
    setMoreShown(MORE_SUGGESTIONS_PAGE)
  }
  // 「すべて追加」は締切間近のうち絞り込みに合うもの（締切順のときだけ出す）
  const shownSuggestions = useMemo(() => filterTasks(suggestions, view), [suggestions, view])
  const shownMore = useMemo(() => filterTasks(moreSuggestions, view), [moreSuggestions, view])
  const sorted = useMemo(
    () => (view.sort === 'dueDate' ? null : sortCandidates([...shownSuggestions, ...shownMore], view.sort)),
    [view.sort, shownSuggestions, shownMore],
  )
  // 締切順は締切間近を全部出してからその先を 10 件ずつ。並べ直したときは締切間近の件数（10 件より多ければ）から
  const sortedPage = Math.max(MORE_SUGGESTIONS_PAGE, shownSuggestions.length)
  const remaining = Math.max(0, sorted ? sorted.length - (moreShown + sortedPage - MORE_SUGGESTIONS_PAGE) : shownMore.length - moreShown)
  const showMore = useCallback(() => setMoreShown((n) => n + MORE_SUGGESTIONS_PAGE), [])

  // 候補（締切間近 → その先 → 日付なし…）を締切の日の見出しで分ける。行に「〜まで」を並べない
  const candidateGroups = useMemo((): CandidateGroup[] => {
    if (sorted) {
      const shown = sorted.slice(0, moreShown + sortedPage - MORE_SUGGESTIONS_PAGE)
      return shown.length > 0 ? [{ kind: 'sorted', tasks: shown }] : []
    }
    return groupCandidatesByDue([...shownSuggestions, ...shownMore.slice(0, moreShown)], dateKey)
  }, [sorted, sortedPage, shownSuggestions, shownMore, moreShown, dateKey])

  return { moreSuggestions, candidateGroups, remaining, showMore, shownSuggestions: sorted ? [] : shownSuggestions }
}
