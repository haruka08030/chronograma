import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SHORTCUT_LIST } from '../lib/shortcuts'
import { useEscapeLayer } from '../hooks/useEscapeLayer'

/** 「?」で開くキーボードショートカット一覧 */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  useEscapeLayer(onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={t('shortcuts.title')}
        className="animate-pop-in w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{t('shortcuts.title')}</h2>
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-700">
          {SHORTCUT_LIST.map((s) => (
            <li key={s.label} className="flex items-center justify-between py-2 text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">{t(s.label)}</span>
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="min-w-6 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-center font-mono text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
