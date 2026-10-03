import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, ModalTitle } from './Modal'
import { buttonClass } from './buttonClass'
import { isSubmitEnter } from '../../lib/keyboard'

export type ConfirmOptions = {
  /** 本文（何が起きるか・件数など）。改行はそのまま出す */
  message: string
  title?: string
  /** 実行のボタンの文字（「削除」「接続を解除」など、何をするかを書く）。省略すると「OK」 */
  confirmLabel?: string
  /** 取り消せない・重い操作は赤いボタン */
  danger?: boolean
  /** 押し間違いで実行されないよう、この文字を打つまで実行できない（大文字小文字は区別しない） */
  requireText?: { label: string; expected: string }
}

/**
 * 確認のダイアログ（ブラウザ標準の confirm の代わり）。見た目は `Modal`。Esc・背景・取消で閉じる。
 * 開いたときのフォーカス: 重い操作（danger）は取消、それ以外は実行。Enter はフォーカスのあるボタンを押す
 * （Enter の押し間違いで重い操作をしない）。文字の入力が要るときは入力欄で、打ち終えて Enter で実行
 * 呼ぶのは `askConfirm()`（lib/confirmDialog）から
 */
export function ConfirmDialog({ options, onResult }: { options: ConfirmOptions; onResult: (ok: boolean) => void }) {
  const { t } = useTranslation()
  const titleId = useId()
  const [typed, setTyped] = useState('')
  const need = options.requireText
  const ready = !need || typed.trim().toLowerCase() === need.expected.trim().toLowerCase()
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const initialFocus = need ? inputRef : options.danger ? cancelRef : confirmRef
  return (
    <Modal onClose={() => onResult(false)} initialFocus={initialFocus} labelledBy={options.title ? titleId : undefined} label={options.title ? undefined : options.message} width="sm" className="p-5">
      {options.title && <ModalTitle id={titleId}>{options.title}</ModalTitle>}
      <p className={`whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300 ${options.title ? 'mt-2' : ''}`}>{options.message}</p>
      {need && (
        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{need.label}</span>
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (isSubmitEnter(e) && ready) {
                e.preventDefault()
                onResult(true)
              }
            }}
            className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-accent-500/40 dark:border-zinc-700 dark:text-zinc-100"
          />
        </label>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button ref={cancelRef} type="button" onClick={() => onResult(false)} className={buttonClass({ variant: 'ghost', size: 'md' })}>
          {t('common.cancel')}
        </button>
        <button
          ref={confirmRef}
          type="button"
          disabled={!ready}
          onClick={() => onResult(true)}
          className={buttonClass({ variant: options.danger ? 'danger' : 'primary', size: 'md' })}
        >
          {options.confirmLabel ?? t('confirmDialog.ok')}
        </button>
      </div>
    </Modal>
  )
}
