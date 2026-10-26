import type { ReactNode, Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeftIcon } from '../icons'
import { PAGE_TITLE_CLASS } from '../ui/headingClass'
import { PAGE_SCROLL_CLASS } from '../ui/layoutClass'

/** 設定の次のページ（連携・データ）の枠。上に「‹ 設定」の戻ると見出し */
export function SettingsSubPage({
  ref,
  title,
  onBack,
  children,
}: {
  ref?: Ref<HTMLDivElement>
  title: ReactNode
  onBack: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div ref={ref} className={PAGE_SCROLL_CLASS}>
      <div className="mx-auto w-full max-w-2xl space-y-8 px-4 pb-24 pt-6 md:px-6 md:pt-8">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            {t('settings.title')}
          </button>
          <h1 className={`mt-2 ${PAGE_TITLE_CLASS}`}>{title}</h1>
        </div>
        {children}
      </div>
    </div>
  )
}
