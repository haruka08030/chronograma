import type { ComponentType } from 'react'
import type { AddonId } from '../../lib/addons'
import { ICON_PATHS } from '../../lib/iconPaths'
import { DuesBody } from './DuesBody'
import { SchoolBody } from './SchoolBody'

/** 追加機能の画面に出す中身（名前と説明は `addons.<id>.name` / `addons.<id>.description`） */
export type AddonEntry = {
  icon: string
  /** オンのカードを押して進むページの中身 */
  Body: ComponentType
}

export const ADDON_CATALOG: Record<AddonId, AddonEntry> = {
  school: { icon: ICON_PATHS.academicCap, Body: SchoolBody },
  dues: { icon: ICON_PATHS.flag, Body: DuesBody },
}
