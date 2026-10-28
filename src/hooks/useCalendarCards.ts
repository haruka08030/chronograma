import { useState, useCallback, useEffect, useId, type RefObject } from 'react'
import { rectOf, type AnchorRect } from '../components/timeline/anchoredCard'
import { openTaskDetail } from '../lib/overlays'
import { parseHabitSlotId } from '../lib/habitSlots'
import { parseSleepSlotId } from '../lib/sleepSchedule'

/** カードを開いたことをほかの `useCalendarCards` に知らせる（月と下・横の日のパネルのように 2 つ並んでも、開くカードは画面に 1 枚） */
const CARD_OPEN_EVENT = 'chronograma:calendar-card-open'

/**
 * カレンダーで予定・To-Do・Google の予定を押したときの小さなカード（どの表示でも同じ。Google カレンダーと同じ）と、
 * 習慣の枠のカードとメニュー、週タイムラインの空き時間の作成カードの位置。描くのは `CalendarCards`
 */
export function useCalendarCards(gridRef?: RefObject<HTMLDivElement | null>) {
  const openDetail = openTaskDetail
  // 予定を押したときのカード / 空き時間の作成カード（Google カレンダー風）
  const [eventCard, setEventCard] = useState<{ taskId: string; anchor: AnchorRect } | null>(null)
  const [createAnchor, setCreateAnchor] = useState<AnchorRect | null>(null)
  const [googleCard, setGoogleCard] = useState<{ eventId: string; anchor: AnchorRect } | null>(null)
  const [habitCard, setHabitCard] = useState<{ habitId: string; dateKey: string; anchor: AnchorRect } | null>(null)
  const [habitMenu, setHabitMenu] = useState<{ habitId: string; dateKey: string; x: number; y: number } | null>(null)
  const [sleepCard, setSleepCard] = useState<{ wakeDate: string; anchor: AnchorRect } | null>(null)
  const ownId = useId()
  useEffect(() => {
    const onOtherOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail === ownId) return
      setEventCard(null)
      setGoogleCard(null)
      setHabitCard(null)
      setHabitMenu(null)
      setSleepCard(null)
    }
    window.addEventListener(CARD_OPEN_EVENT, onOtherOpen)
    return () => window.removeEventListener(CARD_OPEN_EVENT, onOtherOpen)
  }, [ownId])
  const announce = useCallback(() => window.dispatchEvent(new CustomEvent(CARD_OPEN_EVENT, { detail: ownId })), [ownId])
  /** 押した所（`el`。無ければタイムラインのブロック）の横にカードを出す。どちらも無ければ詳細 */
  const openCard = useCallback(
    (taskId: string, el?: Element | null) => {
      const anchor = rectOf(el ?? gridRef?.current?.querySelector(`[data-block-id="${CSS.escape(taskId)}"]`) ?? null)
      setGoogleCard(null)
      setHabitCard(null)
      announce()
      if (anchor) setEventCard({ taskId, anchor })
      else openDetail(taskId)
    },
    [openDetail, gridRef, announce],
  )
  const closeCard = useCallback(() => setEventCard(null), [])
  const openGoogleCard = useCallback(
    (eventId: string, el?: Element | null) => {
      // 終日の行のチップはグリッドの外にあるので、画面全体から探す
      const anchor = rectOf(el ?? document.querySelector(`[data-block-id="${CSS.escape(`event-${eventId}`)}"]`))
      setEventCard(null)
      setHabitCard(null)
      announce()
      if (anchor) setGoogleCard({ eventId, anchor })
    },
    [announce],
  )
  const closeGoogleCard = useCallback(() => setGoogleCard(null), [])
  // 習慣の枠: 押すとカード、右クリック・長押しで習慣の画面と同じメニュー
  const openHabitCard = useCallback(
    (slotId: string, el?: Element | null) => {
      const slot = parseHabitSlotId(slotId)
      const anchor = rectOf(el ?? gridRef?.current?.querySelector(`[data-block-id="${CSS.escape(slotId)}"]`) ?? null)
      if (!slot || !anchor) return
      setEventCard(null)
      setGoogleCard(null)
      announce()
      setHabitCard({ ...slot, anchor })
    },
    [gridRef, announce],
  )
  const closeHabitCard = useCallback(() => setHabitCard(null), [])
  /** 習慣の枠ならメニューを開いて true */
  const openHabitMenu = useCallback(
    (slotId: string, x: number, y: number): boolean => {
      const slot = parseHabitSlotId(slotId)
      if (!slot) return false
      setHabitCard(null)
      announce()
      setHabitMenu({ ...slot, x, y })
      return true
    },
    [announce],
  )
  const closeHabitMenu = useCallback(() => setHabitMenu(null), [])
  // 睡眠の予定の枠（#660）: 押す・右クリック・長押しでカード。睡眠の枠でなければ false
  const openSleepCard = useCallback(
    (slotId: string, el?: Element | null): boolean => {
      const wakeDate = parseSleepSlotId(slotId)
      if (!wakeDate) return false
      const anchor = rectOf(el ?? gridRef?.current?.querySelector(`[data-block-id="${CSS.escape(slotId)}"]`) ?? null)
      if (!anchor) return false
      setEventCard(null)
      setGoogleCard(null)
      setHabitCard(null)
      announce()
      setSleepCard({ wakeDate, anchor })
      return true
    },
    [gridRef, announce],
  )
  const closeSleepCard = useCallback(() => setSleepCard(null), [])
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
    habitCard,
    openHabitCard,
    closeHabitCard,
    habitMenu,
    openHabitMenu,
    closeHabitMenu,
    sleepCard,
    openSleepCard,
    closeSleepCard,
    openGoogleCard,
    closeGoogleCard,
    createAnchor,
    setCreateAnchorFromEl,
  }
}

export type CalendarCardsState = ReturnType<typeof useCalendarCards>
