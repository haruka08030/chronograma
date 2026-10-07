/**
 * 開いたときにだけ要る詳細・メニュー・ポップオーバー。最初の読み込みから外し、手すきのときに先読みする
 * （`preloadOverlays`。App に 1 つの `OverlayHost` が呼ぶ）。描画は `OverlaySuspense` の中で（読めなかったら何も出さずに知らせ、次に押したときに読み直す）
 */
import { lazyNamed, preloadWhenIdle } from '../lib/lazyComponent'

export const TaskDetail = lazyNamed(() => import('./TaskDetail'), 'TaskDetail')
export const TaskContextMenu = lazyNamed(() => import('./TaskContextMenu'), 'TaskContextMenu')
export const TaskEventMenu = lazyNamed(() => import('./timeline/EventContextMenu'), 'TaskEventMenu')
export const GoogleEventMenu = lazyNamed(() => import('./timeline/EventContextMenu'), 'GoogleEventMenu')
export const EventPopover = lazyNamed(() => import('./timeline/EventPopover'), 'EventPopover')
export const GoogleEventPopover = lazyNamed(() => import('./timeline/GoogleEventPopover'), 'GoogleEventPopover')
export const QuickCreatePopover = lazyNamed(() => import('./timeline/QuickCreatePopover'), 'QuickCreatePopover')
export const TimeSlotMenu = lazyNamed(() => import('./TimeSlotMenu'), 'TimeSlotMenu')
export const DueDateTimeMenu = lazyNamed(() => import('./DueDateTimeMenu'), 'DueDateTimeMenu')
export const CompleteWithLogModal = lazyNamed(() => import('./CompleteWithLogModal'), 'CompleteWithLogModal')

export const preloadOverlays = () =>
  preloadWhenIdle(
    TaskDetail.preload,
    TaskContextMenu.preload,
    TaskEventMenu.preload,
    EventPopover.preload,
    GoogleEventPopover.preload,
    QuickCreatePopover.preload,
    CompleteWithLogModal.preload,
    TimeSlotMenu.preload,
    DueDateTimeMenu.preload,
  )
