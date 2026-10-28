import type { CalendarCardsState } from '../../hooks/useCalendarCards'
import { EventPopover, GoogleEventPopover } from '../lazyOverlays'
import { HabitSlotPopover } from '../timeline/HabitSlotPopover'
import { HabitContextMenu } from '../HabitContextMenu'
import { SleepSlotPopover } from '../timeline/SleepSlotPopover'
import { requestHabitEdit } from '../../lib/habitEditRequest'

/** 押した予定のカード（Google の予定は `GoogleEventPopover`、アプリの予定・To-Do は `EventPopover`、習慣の枠は `HabitSlotPopover` と習慣のメニュー、睡眠の予定の枠は `SleepSlotPopover`、その「編集」は `HabitEditHost`）。`OverlaySuspense` の中に置く */
export function CalendarCards({ cards }: { cards: CalendarCardsState }) {
  const {
    googleCard,
    closeGoogleCard,
    eventCard,
    closeCard,
    openDetailFromCard,
    habitCard,
    closeHabitCard,
    habitMenu,
    closeHabitMenu,
    sleepCard,
    closeSleepCard,
  } = cards
  return (
    <>
      {googleCard && <GoogleEventPopover eventId={googleCard.eventId} anchor={googleCard.anchor} onClose={closeGoogleCard} />}
      {eventCard && (
        <EventPopover taskId={eventCard.taskId} anchor={eventCard.anchor} onClose={closeCard} onOpenDetail={openDetailFromCard} />
      )}
      {habitCard && (
        <HabitSlotPopover
          habitId={habitCard.habitId}
          dateKey={habitCard.dateKey}
          anchor={habitCard.anchor}
          onClose={closeHabitCard}
          onOpenRecord={(id) => cards.openCard(id)}
        />
      )}
      {sleepCard && <SleepSlotPopover wakeDate={sleepCard.wakeDate} anchor={sleepCard.anchor} onClose={closeSleepCard} />}
      {habitMenu && (
        <HabitContextMenu
          x={habitMenu.x}
          y={habitMenu.y}
          habitId={habitMenu.habitId}
          dateKey={habitMenu.dateKey}
          onClose={closeHabitMenu}
          onEdit={() => requestHabitEdit(habitMenu.habitId, habitMenu.dateKey)}
          onTimeline
        />
      )}
    </>
  )
}
