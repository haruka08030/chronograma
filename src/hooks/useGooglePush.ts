import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured, sendFunctionOnLeave } from '../lib/supabase'
import { deleteGoogleEvent, upsertGoogleEvent } from '../lib/googleCalendar'
import { changedForGoogle, changedForGoogleSkip, googleEventIdForTask, googleFieldsForTask, shouldBeOnGoogle } from '../lib/googlePush'
import { googleSkipKeys } from '../lib/googleSkip'
import { isIncomingChange } from '../lib/changeOrigin'
import { reportFailure } from '../lib/errorReport'
import { appTimeZone, appTodayKey } from '../lib/timeZone'
import { useTaskStore, isAdoptingFromOtherTab } from '../store/taskStore'

/** 続けて直したときにまとめて 1 回にする */
const SEND_DELAY_MS = 1_500
/** 送れなかったときの次の試し（倍にしていき、ここで止める） */
const RETRY_MIN_MS = 10_000
const RETRY_MAX_MS = 5 * 60_000

const queueKey = (userId: string) => `chronograma.googlePush.${userId}`

function loadQueue(userId: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(queueKey(userId)) ?? '[]') as unknown
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveQueue(userId: string, queue: Set<string>) {
  try {
    if (queue.size === 0) localStorage.removeItem(queueKey(userId))
    else localStorage.setItem(queueKey(userId), JSON.stringify([...queue]))
  } catch {
    /* 保存できなくても、開いている間は送る */
  }
}

/** もう一度送っても直らない失敗（接続が無い・書き込みの許可が無い・他人の予定） */
function isPermanentFailure(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('not connected') || m.includes('scope not granted') || m.includes('read-only') || m.includes('reconnect')
}

/**
 * この端末で作った・直した・消したアプリの予定を Google カレンダーにも反映する（`lib/googlePush.ts`）。
 * 送るのは Google につないで書き込みを許可しているときだけ。同期・ほかのタブで届いた変更は、変えた端末が送るので送らない。
 * 送れなかったものはこの端末に覚えておき、つながったとき・画面に戻ったとき・次に開いたときに送り直す。
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
    const queue = loadQueue(userId)
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

    const schedule = (ms: number) => {
      clearTimeout(timer)
      timer = setTimeout(() => void flush(), ms)
    }

    const flush = async () => {
      if (cancelled || sending || queue.size === 0 || !canSend()) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      sending = true
      let failed = false
      try {
        for (const taskId of [...queue]) {
          if (cancelled) return
          // 送る時点の中身を送る（待っている間に直したものもまとめて 1 回）
          const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
          const eventId = googleEventIdForTask(taskId)
          try {
            if (task && shouldBeOnGoogle(task, skipKeys())) await upsertGoogleEvent(eventId, googleFieldsForTask(task))
            else await deleteGoogleEvent(eventId)
            queue.delete(taskId)
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            if (isPermanentFailure(message)) {
              if (message.toLowerCase().includes('scope not granted')) useTaskStore.getState().setGoogleCanWrite(false)
              queue.clear()
              return
            }
            console.error('[google] push', e)
            reportFailure('integration', 'google:push', e)
            failed = true
            break
          }
        }
      } finally {
        saveQueue(userId, queue)
        sending = false
      }
      if (cancelled) return
      if (failed) {
        schedule(retryMs)
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS)
      } else {
        retryMs = RETRY_MIN_MS
        // 送っている間に増えたもの
        if (queue.size > 0) schedule(SEND_DELAY_MS)
      }
    }

    const unsub = useTaskStore.subscribe((state, prev) => {
      // つながった・書き込めるようになったら、残っているものを送る
      if (state.googleCanWrite !== prev.googleCanWrite || state.googleConnected !== prev.googleConnected) {
        if (canSend() && queue.size > 0) schedule(SEND_DELAY_MS)
      }
      const skipChanged = state.addons.googleSkip !== prev.addons.googleSkip
      if (state.tasks === prev.tasks && !skipChanged) return
      if (isIncomingChange() || isAdoptingFromOtherTab()) return
      if (!canSend()) return
      const nextSkip = skipKeys()
      const ids = [
        ...(state.tasks === prev.tasks ? [] : changedForGoogle(prev.tasks, state.tasks, nextSkip)),
        // 送らない名前を変えた: その名前の予定を Google から消す・送る
        ...(skipChanged ? changedForGoogleSkip(state.tasks, googleSkipKeys(prev.addons.googleSkip), nextSkip, appTodayKey()) : []),
      ]
      if (ids.length === 0) return
      ids.forEach((id) => queue.add(id))
      saveQueue(userId, queue)
      schedule(SEND_DELAY_MS)
    })

    /** 待っているものを応答を待たずに送る（届かなければ覚えたまま、次に開いたときに送る） */
    const flushOnLeave = () => {
      const token = accessTokenRef.current
      if (!token || queue.size === 0 || !canSend()) return
      clearTimeout(timer)
      const tasks = useTaskStore.getState().tasks
      for (const taskId of queue) {
        const task = tasks.find((t) => t.id === taskId)
        const eventId = googleEventIdForTask(taskId)
        sendFunctionOnLeave(
          'google-calendar',
          task && shouldBeOnGoogle(task, skipKeys())
            ? { action: 'upsert', eventId, fields: googleFieldsForTask(task), timeZone: appTimeZone() }
            : { action: 'delete', eventId },
          token,
        )
      }
    }

    // スマホではタブを閉じても pagehide が来ないことがあるので、隠れたときにも送る
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flush()
      else flushOnLeave()
    }
    const onOnline = () => void flush()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', flushOnLeave)
    window.addEventListener('online', onOnline)
    if (queue.size > 0) schedule(SEND_DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      unsub()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', flushOnLeave)
      window.removeEventListener('online', onOnline)
    }
  }, [userId, loading])
}
