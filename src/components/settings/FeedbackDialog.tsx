import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { MAX_FEEDBACK_LENGTH, sendFeedback } from '../../lib/feedback'
import { notify } from '../../lib/notify'
import { Modal, ModalTitle } from '../ui/Modal'
import { buttonClass } from '../ui/buttonClass'
import { fieldClass } from '../ui/fieldClass'
import { ERROR_TEXT, SUBTLE_TEXT } from '../ui/textClass'
import { SettingsLinkRow } from './SettingsPrimitives'
import { useDialogDraft } from '../../hooks/useDialogDraft'

/**
 * 設定の「お問い合わせ・フィードバック」。1 つの欄に書いて送る（`lib/feedback.ts`）。
 * 送れるのはログインしている人だけ（返事はアカウントのメールアドレスへ）。ログインしていなければ、そう伝えるだけにする。
 * 送れたら閉じて画面下で知らせる。送れなければ書いたものを残してダイアログの中に出す。
 * 外側・Esc で閉じても書きかけは残す（`useDialogDraft`）。キャンセルで捨てる
 */
export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const titleId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText, discardDraft] = useDialogDraft('feedback', '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (sending || !text.trim()) return
    setSending(true)
    setError(null)
    const res = await sendFeedback(text)
    setSending(false)
    if (res.ok) {
      discardDraft()
      notify(t('feedback.sent'))
      onClose()
      return
    }
    setError(t(`feedback.${res.reason}`))
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId} initialFocus={user ? inputRef : undefined} width="sm" className="p-5">
      <ModalTitle id={titleId}>{t('feedback.title')}</ModalTitle>
      {user ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_FEEDBACK_LENGTH}
            rows={5}
            aria-label={t('feedback.title')}
            placeholder={t('feedback.placeholder')}
            className={fieldClass({}, 'mt-3 w-full')}
          />
          {error && (
            <p role="alert" className={`mt-2 ${ERROR_TEXT}`}>
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                discardDraft()
                onClose()
              }}
              className={buttonClass({ variant: 'ghost', size: 'md' })}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={sending || !text.trim()} className={buttonClass({ variant: 'primary', size: 'md' })}>
              {t('feedback.send')}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className={`mt-2 ${SUBTLE_TEXT}`}>{t('feedback.signInToSend')}</p>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={onClose} className={buttonClass({ variant: 'ghost', size: 'md' })}>
              {t('common.close')}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

/** 設定の一番下の行。押すとダイアログを開く */
export function FeedbackRow() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <SettingsLinkRow label={t('feedback.title')} onClick={() => setOpen(true)} />
      {open && <FeedbackDialog onClose={() => setOpen(false)} />}
    </>
  )
}
