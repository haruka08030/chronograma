import type { ComponentType } from 'react'
import type { AddonId } from '../../lib/addons'
import { ICON_PATHS } from '../../lib/iconPaths'
import { DuesPage } from './DuesBody'
import { SchoolPage } from './SchoolBody'

/** 追加機能の画面に出す中身（名前と説明は `addons.<id>.name` / `addons.<id>.description`） */
export type AddonEntry = {
  icon: string
  /** オンのカードを押して進むページ（上に「‹ 追加機能」） */
  Page: ComponentType<{ onBack: () => void }>
}

export const ADDON_CATALOG: Record<AddonId, AddonEntry> = {
  school: { icon: ICON_PATHS.academicCap, Page: SchoolPage },
  dues: { icon: ICON_PATHS.flag, Page: DuesPage },
}
