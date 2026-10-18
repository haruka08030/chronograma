import type { ComponentType } from 'react'
import type { AddonId } from '../../lib/addons'
import { ICON_PATHS } from '../../lib/iconPaths'
import { TimetableDialog } from '../calendar/TimetableDialog'
import { DuesDialog } from './DuesDialog'

/** 追加機能の画面・設定に出す中身（名前と説明は `addons.<id>.name` / `addons.<id>.description`） */
export type AddonEntry = {
  icon: string
  /** 「開く」で出すダイアログ */
  Dialog: ComponentType<{ onClose: () => void }>
}

export const ADDON_CATALOG: Record<AddonId, AddonEntry> = {
  timetable: { icon: ICON_PATHS.calendar, Dialog: TimetableDialog },
  dues: { icon: ICON_PATHS.flag, Dialog: DuesDialog },
}
