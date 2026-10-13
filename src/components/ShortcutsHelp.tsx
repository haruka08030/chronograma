import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { SHORTCUT_LIST } from '../lib/shortcuts'
import { keyCapLabel } from '../lib/keyboard'
import { Modal, ModalTitle } from './ui/Modal'

/** 「?」で開くキーボードショートカット一覧 */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  // もう一度「?」でも閉じる
  return (
    <Modal onClose={onClose} closeKeys={['?']} labelledBy="shortcuts-title" className="p-5">
      <ModalTitle id="shortcuts-title">{t('shortcuts.title')}</ModalTitle>
      <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-700">
        {SHORTCUT_LIST.map((s) => (
          <li key={s.label} className="flex items-center justify-between py-2 text-sm">
            <span className="text-zinc-700 dark:text-zinc-300">{t(s.label)}</span>
            {/* 同時に押すキーは + でつなぎ、どれでもよいキーは / で区切る */}
            <span className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
              {s.keys.map((combo, i) => (
                <Fragment key={combo.join('+')}>
                  {i > 0 && <span aria-hidden>/</span>}
                  {combo.map((k, j) => (
                    <Fragment key={k}>
                      {j > 0 && <span aria-hidden>+</span>}
                      <kbd className="min-w-6 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-center font-mono text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                        {keyCapLabel(k)}
                      </kbd>
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
