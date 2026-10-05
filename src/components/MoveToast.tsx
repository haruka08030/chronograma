import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { INVERSE_SURFACE } from './ui/surface'
import { toastText } from '../lib/toastText'
import { usePresence } from '../hooks/usePresence'

const MOBILE_FLOAT_BOTTOM = 'bottom-[calc(3.5rem+0.75rem+env(safe-area-inset-bottom))] md:bottom-6'

export function MoveToast() {
  const { t } = useTranslation()
  const text = useTaskStore((s) => s.moveBannerText)
  const clearMoveBanner = useTaskStore((s) => s.clearMoveBanner)
  const activeTimer = useTaskStore((s) => s.activeTimer)

  useEffect(() => {
    if (!text) return
    const timer = window.setTimeout(() => clearMoveBanner(), 2600)
    return () => window.clearTimeout(timer)
  }, [text, clearMoveBanner])

  const toast = usePresence(text)
  if (!toast.shown) return null

  const stacked = activeTimer ? 'bottom-[calc(3.5rem+4.5rem+env(safe-area-inset-bottom))] md:bottom-24' : MOBILE_FLOAT_BOTTOM

  return (
    <div
      className={`pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2 ${toast.closing ? 'animate-toast-out' : 'animate-toast-in'} ${stacked}`}
    >
      <div className={`max-w-[min(90vw,20rem)] rounded-xl px-4 py-2.5 text-center text-sm ${INVERSE_SURFACE}`} role="status">
        {toastText(t, toast.shown)}
      </div>
    </div>
  )
}
