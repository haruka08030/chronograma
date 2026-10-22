import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured, sendFunctionOnLeave } from '../lib/supabase'
import { deleteGoogleEvent, googleCalendarStatus, upsertGoogleEvent } from '../lib/googleCalendar'
import {
  changedForGoogle,
  changedForGoogleSkip,
  googleEventIdForTask,
  googleFieldsForTask,
  googleSignature,
  shouldBeOnGoogle,
} from '../lib/googlePush'
import { trashGoogleDeleted } from '../lib/googleDeleted'
import {
  LEAVE_SEND_MAX,
  enqueuePush,
  failedPushCount,
  loadPushQueue,
  pushPass,
  pushQueueKey,
  resetFailedPush,
  sendablePushIds,
} from '../lib/googlePushQueue'
import {
  googleCanWriteHint,
  markGoogleConnectionLost,
  rememberGoogleCanWrite,
  wasGoogleConnected,
  wasGoogleConnectionLost,
} from '../lib/googleConnectedHint'
import { googleSkipKeys } from '../lib/googleSkip'
import { isIncomingChange } from '../lib/changeOrigin'
import { INTEGRATION_FLUSH_TIMEOUT_MS, registerIntegrationWrites } from '../lib/integrationWrites'
import { notify } from '../lib/notify'
import i18n from '../i18n/config'
import { appTimeZone, appTodayKey } from '../lib/timeZone'
import { useTaskStore, isAdoptingFromOtherTab } from '../store/taskStore'

/** 続けて直したときにまとめて 1 回にする */
const SEND_DELAY_MS = 1_500
/** 送れなかったときの次の試し（倍にしていき、ここで止める） */
const RETRY_MIN_MS = 10_000
const RETRY_MAX_MS = 5 * 60_000

/** 「もう一度送る」を押した（`retryGooglePush`） */
const RETRY_EVENT = 'chronograma:google-push-retry'

/** 何度送っても送れなかった予定を、もう一度送る */
export function retryGooglePush(): void {
  window.dispatchEvent(new Event(RETRY_EVENT))
}

/**
 * この端末で作った・直した・消したアプリの予定を Google カレンダーにも反映する（`lib/googlePush.ts`）。
 * Google につないでいれば（切れていても）変えた予定は待ちに入れて端末に覚え（`lib/googlePushQueue.ts`）、
 * 送るのは書き込みを許可しているときだけ。同期・ほかのタブで届いた変更は、変えた端末が送るので送らない。
 * 送れなかったものは、つながったとき・画面に戻ったとき・次に開いたときに送り直す。
 */
export function useGooglePush() {
  const { user, session, loading } = useAuth()
  const userId = user?.id ?? null
  // タブを閉じるときはセッションの読み出しを待てないので、手元に持っておく
  const accessTokenRef = useRef<string | null>(null)
  useEffect(() => {
    accessTokenRef.current = session?.access_token ?? null
  }, [session])

  useEffect(() => {
    if (!isSupabaseConfigured || !userId || loading) return

    let cancelled = false
    let sending = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let retryMs = RETRY_MIN_MS
    /** 書き込めるかを関数に聞いた（つながるたびに 1 回） */
    let probed = false
    // 送らない名前（同じ並びのあいだは作り直さない）
    let skipNames = useTaskStore.getState().addons.googleSkip
    let skip = googleSkipKeys(skipNames)
    const skipKeys = () => {
      const names = useTaskStore.getState().addons.googleSkip
      if (names !== skipNames) {
        skipNames = names
        skip = googleSkipKeys(names)
      }
      return skip
    }

    const canSend = () => {
      const s = useTaskStore.getState()
      return s.googleConnected && s.googleCanWrite
    }
    /** 変えた予定を待ちに入れるか: この端末で Google につないでいる（切れていても）、書き込めないと分かっていない */
    const mayQueue = () => {
      const s = useTaskStore.getState()
      const linked = s.googleConnected || s.googleReconnectNeeded || wasGoogleConnected(userId) || wasGoogleConnectionLost(userId)
      return linked && (s.googleCanWrite || googleCanWriteHint(userId) !== false)
    }
    const hasSendable = () => sendablePushIds(loadPushQueue(userId)).length > 0
    const publishFailed = () => useTaskStore.getState().setGooglePushFailed(failedPushCount(loadPushQueue(userId)))

    const schedule = (ms: number) => {
      clearTimeout(timer)
      timer = setTimeout(() => void flush(), ms)
    }

    /** つながっているのに書き込めるか分からない（カレンダーを開いていない）: 関数に聞く */
    const probeWrite = () => {
      const s = useTaskStore.getState()
      if (probed || !s.googleConnected || s.googleCanWrite) return
      probed = true
      googleCalendarStatus().then(
        ({ connected, canWrite }) => {
          if (cancelled || !connected || canWrite === null) return
          rememberGoogleCanWrite(userId, canWrite)
          // 書き込めると分かったら、購読から送り始める
          if (canWrite) useTaskStore.getState().setGoogleCanWrite(true)
        },
        () => {
          probed = false
        },
      )
    }

    const sendOne = async (taskId: string, revive: boolean) => {
      // 送る時点の中身を送る（待っている間に直したものもまとめて 1 回）
      const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
      const eventId = googleEventIdForTask(taskId)
      if (task && shouldBeOnGoogle(task, skipKeys())) await upsertGoogleEvent(eventId, googleFieldsForTask(task), revive)
      else await deleteGoogleEvent(eventId)
    }

    const flush = async () => {
      if (cancelled || sending || !hasSendable()) return
      if (!canSend()) {
        probeWrite()
        return
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      sending = true
      let status
      // Google で消されていた予定（アプリでもゴミ箱に入れる）
      const deleted: string[] = []
      try {
        status = await pushPass(
          userId,
          sendOne,
          () => cancelled,
          (id) => deleted.push(id),
        )
      } finally {
        sending = false
        if (!cancelled) publishFailed()
      }
      if (deleted.length > 0 && !cancelled) void trashGoogleDeleted(deleted)
      if (cancelled || status === 'cancelled') return
      const store = useTaskStore.getState()
      if (status === 'auth') {
        // 切れた。待ちは残し、つなぎ直したら送る（予定の取得で切れたと分かったときと同じ）
        store.setGoogleConnected(false)
        store.setGoogleReconnectNeeded(true)
        markGoogleConnectionLost(userId)
        notify(i18n.t('googleReconnect.lost'))
        return
      }
      if (status === 'scope') {
        // 書き込みの許可が無い。待ちは残し、許可されたら送る
        rememberGoogleCanWrite(userId, false)
        store.setGoogleCanWrite(false)
        return
      }
      if (status === 'retry' || status === 'wait') {
        schedule(retryMs)
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS)
        return
      }
      retryMs = RETRY_MIN_MS
      // 送っている間に増えたもの
      if (hasSendable()) schedule(SEND_DELAY_MS)
    }

    const unsub = useTaskStore.subscribe((state, prev) => {
      if (state.googleConnected !== prev.googleConnected) probed = false
      // つながった・書き込めるようになったら、残っているものを送る
      if (state.googleCanWrite !== prev.googleCanWrite || state.googleConnected !== prev.googleConnected) {
        if (state.googleConnected && hasSendable()) schedule(SEND_DELAY_MS)
      }
      const skipChanged = state.addons.googleSkip !== prev.addons.googleSkip
      if (state.tasks === prev.tasks && !skipChanged) return
      if (isIncomingChange() || isAdoptingFromOtherTab()) return
      if (!mayQueue()) return
      const nextSkip = skipKeys()
      const ids = [
        ...(state.tasks === prev.tasks ? [] : changedForGoogle(prev.tasks, state.tasks, nextSkip)),
        // 送らない名前を変えた: その名前の予定を Google から消す・送る
        ...(skipChanged ? changedForGoogleSkip(state.tasks, googleSkipKeys(prev.addons.googleSkip), nextSkip, appTodayKey()) : []),
      ]
      if (ids.length === 0) return
      // 前は Google に置いていなかった予定（ゴミ箱から戻した・送らない名前から外したなど）は、Google で消えていても戻す
      const prevSkip = skipChanged ? googleSkipKeys(prev.addons.googleSkip) : nextSkip
      const before = new Map(prev.tasks.map((t) => [t.id, t]))
      const revive = new Set(ids.filter((id) => googleSignature(before.get(id), prevSkip) === 'off'))
      enqueuePush(userId, ids, revive)
      publishFailed()
      schedule(SEND_DELAY_MS)
    })

    /** 待っているものを応答を待たずに送る（届かなければ覚えたまま、次に開いたときに送る）。一度に送る数は抑える */
    const flushOnLeave = () => {
      const token = accessTokenRef.current
      if (!token || !canSend()) return
      const queue = loadPushQueue(userId)
      const ids = sendablePushIds(queue).slice(0, LEAVE_SEND_MAX)
      if (ids.length === 0) return
      clearTimeout(timer)
      const tasks = useTaskStore.getState().tasks
      for (const taskId of ids) {
        const task = tasks.find((t) => t.id === taskId)
        const eventId = googleEventIdForTask(taskId)
        sendFunctionOnLeave(
          'google-calendar',
          task && shouldBeOnGoogle(task, skipKeys())
            ? {
                action: 'upsert',
                eventId,
                fields: googleFieldsForTask(task),
                timeZone: appTimeZone(),
                revive: queue[taskId]?.revive === true,
              }
            : { action: 'delete', eventId },
          token,
        )
      }
    }

    // ログアウトの前に今すぐ送る（送っている最中ならそれを待ってから。残った数は確かめに出す）
    const unregisterWrites = registerIntegrationWrites('google', {
      flush: async () => {
        clearTimeout(timer)
        const until = Date.now() + INTEGRATION_FLUSH_TIMEOUT_MS
        while (sending && !cancelled && Date.now() < until) await new Promise((r) => setTimeout(r, 100))
        await flush()
      },
      count: () => Object.keys(loadPushQueue(userId)).length,
    })

    // スマホではタブを閉じても pagehide が来ないことがあるので、隠れたときにも送る
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flush()
      else flushOnLeave()
    }
    const onOnline = () => void flush()
    const onRetry = () => {
      resetFailedPush(userId)
      publishFailed()
      retryMs = RETRY_MIN_MS
      void flush()
    }
    // ほかのタブが待ちを変えた: 送れなかった数を合わせ、増えていれば送る
    const onStorage = (e: StorageEvent) => {
      if (e.key !== pushQueueKey(userId)) return
      publishFailed()
      if (hasSendable()) schedule(SEND_DELAY_MS)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', flushOnLeave)
    window.addEventListener('online', onOnline)
    window.addEventListener(RETRY_EVENT, onRetry)
    window.addEventListener('storage', onStorage)
    publishFailed()
    if (hasSendable()) schedule(SEND_DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      unsub()
      unregisterWrites()
      useTaskStore.getState().setGooglePushFailed(0)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', flushOnLeave)
      window.removeEventListener('online', onOnline)
      window.removeEventListener(RETRY_EVENT, onRetry)
      window.removeEventListener('storage', onStorage)
    }
  }, [userId, loading])
}
