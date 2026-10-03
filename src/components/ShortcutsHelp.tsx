import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SHORTCUT_LIST } from '../lib/shortcuts'
import { modKeyLabel } from '../lib/keyboard'
import { Modal, ModalTitle } from './ui/Modal'

/** 「?」で開くキーボードショートカット一覧 */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    // もう一度「?」で閉じる。ダイアログはキー入力を外へ流さないので、先回り（capture）して受ける
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?') onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <Modal onClose={onClose} labelledBy="shortcuts-title" className="p-5">
      <ModalTitle id="shortcuts-title">{t('shortcuts.title')}</ModalTitle>
      <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-700">
        {SHORTCUT_LIST.map((s) => (
          <li key={s.label} className="flex items-center justify-between py-2 text-sm">
            <span className="text-zinc-700 dark:text-zinc-300">{t(s.label)}</span>
            <span className="flex gap-1">
              {s.keys.map((k) => (k === 'mod' ? modKeyLabel() : k)).map((k) => (
                <kbd key={k} className="min-w-6 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-center font-mono text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
