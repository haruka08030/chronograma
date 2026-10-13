import { useState, useCallback, type RefObject } from 'react'
import { rectOf, type AnchorRect } from '../components/timeline/anchoredCard'
import { openTaskDetail } from '../lib/overlays'

/**
 * カレンダーで予定・To-Do・Google の予定を押したときの小さなカード（どの表示でも同じ。Google カレンダーと同じ）と、
 * 週タイムラインの空き時間の作成カードの位置。描くのは `CalendarCards`
 */
export function useCalendarCards(gridRef?: RefObject<HTMLDivElement | null>) {
  const openDetail = openTaskDetail
  // 予定を押したときのカード / 空き時間の作成カード（Google カレンダー風）
  const [eventCard, setEventCard] = useState<{ taskId: string; anchor: AnchorRect } | null>(null)
  const [createAnchor, setCreateAnchor] = useState<AnchorRect | null>(null)
  const [googleCard, setGoogleCard] = useState<{ eventId: string; anchor: AnchorRect } | null>(null)
  /** 押した所（`el`。無ければタイムラインのブロック）の横にカードを出す。どちらも無ければ詳細 */
  const openCard = useCallback(
    (taskId: string, el?: Element | null) => {
      const anchor = rectOf(el ?? gridRef?.current?.querySelector(`[data-block-id="${CSS.escape(taskId)}"]`) ?? null)
      setGoogleCard(null)
      if (anchor) setEventCard({ taskId, anchor })
      else openDetail(taskId)
    },
    [openDetail, gridRef],
  )
  const closeCard = useCallback(() => setEventCard(null), [])
  const openGoogleCard = useCallback((eventId: string, el?: Element | null) => {
    // 終日の行のチップはグリッドの外にあるので、画面全体から探す
    const anchor = rectOf(el ?? document.querySelector(`[data-block-id="${CSS.escape(`event-${eventId}`)}"]`))
    setEventCard(null)
    if (anchor) setGoogleCard({ eventId, anchor })
  }, [])
  const closeGoogleCard = useCallback(() => setGoogleCard(null), [])
  // 安定した ref コールバック（毎回作り直すと描画のたびに state が変わって無限ループになる）
  const setCreateAnchorFromEl = useCallback((el: HTMLDivElement | null) => setCreateAnchor(el ? rectOf(el) : null), [])
  const openDetailFromCard = useCallback(
    (taskId: string) => {
      setEventCard(null)
      openDetail(taskId)
    },
    [openDetail],
  )

  return {
    eventCard,
    setEventCard,
    openCard,
    closeCard,
    openDetailFromCard,
    googleCard,
    setGoogleCard,
    openGoogleCard,
    closeGoogleCard,
    createAnchor,
    setCreateAnchorFromEl,
  }
}

export type CalendarCardsState = ReturnType<typeof useCalendarCards>
