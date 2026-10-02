import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import {
  fetchCalendarEvents,
  googleWriteGeneration,
  localizeGoogleError,
  shouldDisconnectAfterFetchError,
} from '../lib/googleCalendar'
import { withoutPendingDeletes } from '../lib/googleEventEdit'

/** Google 側で変えた予定を拾う間隔（画面に戻ったときはすぐ取り直す） */
const REFRESH_MS = 5 * 60 * 1000

/**
 * 表示中の期間の Google の予定を取得してストアに入れる。
 * 期間が変わったとき・画面に戻ったとき（focus / 表示）・数分おきに取り直し、Google 側の変更を反映する。
 */
export function useGoogleCalendarEvents(timeMin: Date, timeMax: Date) {
  const { t } = useTranslation()
  const googleConnected = useTaskStore((s) => s.googleConnected)
  const minMs = timeMin.getTime()
  const maxMs = timeMax.getTime()

  useEffect(() => {
    if (!googleConnected) return
    let cancelled = false
    const { setCalendarEvents, setGoogleConnected, setGoogleConnectionError, setGoogleCanWrite } = useTaskStore.getState()

    const doFetch = async () => {
      const generation = googleWriteGeneration()
      try {
        const { events, canWrite } = await fetchCalendarEvents(new Date(minMs), new Date(maxMs))
        if (cancelled) return
        setGoogleCanWrite(canWrite)
        setGoogleConnectionError(null)
        // 取得中にアプリから書き換えたなら、その結果を古い取得で巻き戻さない
        if (generation === -1 || generation !== googleWriteGeneration()) return
        setCalendarEvents(withoutPendingDeletes(events))
      } catch (e) {
        if (cancelled) return
        const raw = e instanceof Error ? e.message : t('account.genericError')
        setGoogleConnectionError(localizeGoogleError(raw, t))
        if (shouldDisconnectAfterFetchError(raw)) {
          setGoogleConnected(false)
          setCalendarEvents([])
        }
      }
    }

    void doFetch()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void doFetch()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(onVisible, REFRESH_MS)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [googleConnected, minMs, maxMs, t])
}
