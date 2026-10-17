import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useTaskStore } from '../store/taskStore'
import { fetchCalendarEvents, googleWriteGeneration, localizeGoogleError, shouldDisconnectAfterFetchError } from '../lib/googleCalendar'
import { cacheGoogleEvents, cachedGoogleEvents, rangeKey } from '../lib/googleEventCache'
import { withoutPendingDeletes } from '../lib/googleEventEdit'
import { withoutPushedEvents } from '../lib/googlePush'
import { appTimeZone } from '../lib/timeZone'
import type { CalendarEvent } from '../types/calendarEvent'

/** Google 側で変えた予定を拾う間隔（画面に戻ったときはすぐ取り直す） */
const REFRESH_MS = 5 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** 前後を先に読んでおく範囲の長さ（日・3 日・週）。月は次の月の範囲が同じ長さにならないので読まない */
const PREFETCH_MAX_DAYS = 7

function shiftDays(d: Date, days: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

/** 取得中・取得直後にアプリから書き換えていなければ（取得の始まりと今の世代が同じ） */
const unchangedSince = (generation: number) => generation !== -1 && generation === googleWriteGeneration()

/**
 * 表示中の期間の Google の予定を取得してストアに入れる。
 * 前に取った予定があればまずそれを出し（`googleEventCache.ts`）、取り直した結果で入れ替える。日・3 日・週は前後の期間も先に読んでおく。
 * 期間が変わったとき・画面に戻ったとき（focus / 表示）・数分おきに取り直し、Google 側の変更を反映する。
 */
export function useGoogleCalendarEvents(timeMin: Date, timeMax: Date) {
  const { t } = useTranslation()
  const owner = useAuth().user?.id ?? null
  const googleConnected = useTaskStore((s) => s.googleConnected)
  const minMs = timeMin.getTime()
  const maxMs = timeMax.getTime()

  useEffect(() => {
    if (!googleConnected) return
    let cancelled = false
    const { setCalendarEvents, setGoogleConnected, setGoogleConnectionError, setGoogleCanWrite } = useTaskStore.getState()
    const timeZone = appTimeZone()
    const show = (events: CalendarEvent[]) => setCalendarEvents(withoutPendingDeletes(withoutPushedEvents(events)))

    // 前に取った予定を先に出す（書き込み中なら、楽観的に動かした予定を巻き戻さないよう出さない）
    const cached = owner ? cachedGoogleEvents(owner, rangeKey(new Date(minMs), new Date(maxMs), timeZone)) : null
    if (cached && googleWriteGeneration() !== -1) show(cached.events)

    /** 前後の期間を読んで覚えておく（画面には出さない）。少し前に読んだものは読まない */
    const prefetchNeighbors = () => {
      if (!owner) return
      const days = Math.ceil((maxMs - minMs) / DAY_MS)
      if (days < 1 || days > PREFETCH_MAX_DAYS) return
      for (const dir of [-1, 1]) {
        const from = shiftDays(new Date(minMs), dir * days)
        const to = shiftDays(new Date(maxMs), dir * days)
        const key = rangeKey(from, to, timeZone)
        const known = cachedGoogleEvents(owner, key)
        if (known && Date.now() - known.at < REFRESH_MS) continue
        const generation = googleWriteGeneration()
        fetchCalendarEvents(from, to)
          .then(({ events }) => {
            if (unchangedSince(generation)) cacheGoogleEvents(owner, key, events)
          })
          .catch(() => {
            /* 先読みの失敗は出さない（その期間を開いたときに取り直す） */
          })
      }
    }

    const doFetch = async () => {
      const generation = googleWriteGeneration()
      try {
        const { events, canWrite } = await fetchCalendarEvents(new Date(minMs), new Date(maxMs))
        if (cancelled) return
        setGoogleCanWrite(canWrite)
        setGoogleConnectionError(null)
        // 取得中にアプリから書き換えたなら、その結果を古い取得で巻き戻さない
        if (!unchangedSince(generation)) return
        if (owner) cacheGoogleEvents(owner, rangeKey(new Date(minMs), new Date(maxMs), timeZone), events)
        // アプリの予定から作った Google の予定は、アプリの予定として出ている
        show(events)
        prefetchNeighbors()
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
  }, [googleConnected, owner, minMs, maxMs, t])
}
