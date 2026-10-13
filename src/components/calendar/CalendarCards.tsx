import type { CalendarCardsState } from '../../hooks/useCalendarCards'
import { EventPopover, GoogleEventPopover } from '../lazyOverlays'

/** 押した予定のカード（Google の予定は `GoogleEventPopover`、アプリの予定・To-Do は `EventPopover`）。`OverlaySuspense` の中に置く */
export function CalendarCards({ cards }: { cards: CalendarCardsState }) {
  const { googleCard, closeGoogleCard, eventCard, closeCard, openDetailFromCard } = cards
  return (
    <>
      {googleCard && <GoogleEventPopover eventId={googleCard.eventId} anchor={googleCard.anchor} onClose={closeGoogleCard} />}
      {eventCard && (
        <EventPopover taskId={eventCard.taskId} anchor={eventCard.anchor} onClose={closeCard} onOpenDetail={openDetailFromCard} />
      )}
    </>
  )
}
