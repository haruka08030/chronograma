import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { Toast } from './ui/Toast'
import { toastText } from '../lib/toastText'
import { usePresence } from '../hooks/usePresence'

/** 戻すものの無いお知らせ（移動・アーカイブなど）。2.6 秒で消える。置き場は `ToastStack` */
export function MoveToast() {
  const { t } = useTranslation()
  const text = useTaskStore((s) => s.moveBannerText)
  const clearMoveBanner = useTaskStore((s) => s.clearMoveBanner)

  useEffect(() => {
    if (!text) return
    const timer = window.setTimeout(() => clearMoveBanner(), 2600)
    return () => window.clearTimeout(timer)
  }, [text, clearMoveBanner])

  const toast = usePresence(text)
  if (!toast.shown) return null

  return (
    <Toast closing={toast.closing}>
      <span className="min-w-0 line-clamp-2">{toastText(t, toast.shown)}</span>
    </Toast>
  )
}
