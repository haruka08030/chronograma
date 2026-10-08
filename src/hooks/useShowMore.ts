import { useCallback, useState } from 'react'

/** 長い一覧で始めに描く行の数（検索・完了済み・ゴミ箱とアーカイブ）。「さらに表示」で同じ数ずつ足す */
export const LIST_PAGE_SIZE = 100

/**
 * 長い一覧を先頭から `pageSize` 行だけ描き、「さらに表示」で足す（#288）。
 * 行の部品はそれぞれストアを購読するので、数千行を一度に描くと開くのも、開いている間の変更も遅くなる。
 * `resetKey` が変わったら（検索の語・絞り込み・箱）始めの行数に戻す。
 * 残りが無いとき `showMore` は undefined（`useTaskListSelection` の `onShowMore` にそのまま渡せる）
 */
export function useShowMore(total: number, resetKey: string, pageSize = LIST_PAGE_SIZE) {
  const [state, setState] = useState({ key: resetKey, limit: pageSize })
  // 描いている間に戻す（effect で戻すと、一度だけ前の行数のまま描いてしまう）
  if (state.key !== resetKey) setState({ key: resetKey, limit: pageSize })
  const limit = Math.min(state.key === resetKey ? state.limit : pageSize, total)
  const remaining = total - limit
  const showMore = useCallback(() => {
    setState((s) => ({ key: resetKey, limit: (s.key === resetKey ? s.limit : pageSize) + pageSize }))
  }, [resetKey, pageSize])
  return { limit, remaining, showMore: remaining > 0 ? showMore : undefined }
}
