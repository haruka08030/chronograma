import { useEffect, useRef, useSyncExternalStore } from 'react'
import i18n from '../i18n/config'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { appTimeZone } from '../lib/timeZone'
import {
  CANVAS_LIST_ID,
  canvasCourseSectionsToTags,
  mergeCanvasLists,
  CanvasRequestError,
  fetchCanvasItems,
  markCanvasComplete,
  markCanvasCompleteOnLeave,
  parseCanvasTaskId,
  reconcileCanvasItems,
} from '../lib/canvas'
import { useTaskStore, isAdoptingFromOtherTab } from '../store/taskStore'
import { cloudReady } from '../lib/cloudReady'
import { needsReconnect } from '../lib/integrationReconnect'
import { knownNotConnected, noteIntegrationConnected, shouldRefetchOnReturn } from '../lib/integrationHint'
import { reportFailure } from '../lib/errorReport'
import { notify } from '../lib/notify'
import { asIncomingChange, isIncomingChange } from '../lib/changeOrigin'
import { isLeaderTab } from '../lib/tabLeader'
import { CANVAS_PULLED_PREFIX, loadPulled, savePulled } from '../lib/externalFields'
import { bindCanvasSubmitted, noteCanvasSubmitted } from '../lib/canvasSubmitted'
import { WRITE_BACK_PREFIX, writeBackQueue } from '../lib/writeBackQueue'
import { registerIntegrationWrites } from '../lib/integrationWrites'
import type { SyncStatus } from '../types/sync'

/** Canvas は 1 回の取り込みで数ページ読むので、開いている間の取り込みは控えめに */
const POLL_MS = 5 * 60_000
/** 完了を付け外ししてから Canvas に書くまでの猶予。この間に戻せば（⌘Z も）Canvas は触らない */
const WRITE_DELAY_MS = 5_000
/** 初回はクラウド同期の取得を待つ（新しい端末で、取得前に作ったタスクが上書きされないように） */
const FIRST_SYNC_WAIT_MS = 10_000

export type CanvasSyncState = SyncStatus & {
  /** 学校ごとのエラーコード（`canvas_unauthorized` など）。キーは接続 ID */
  connectionErrors: Record<string, string>
}

let syncState: CanvasSyncState = { syncing: false, lastSyncedAt: null, error: null, connectionErrors: {} }
const listeners = new Set<() => void>()
let requestSync: (() => void) | null = null

function setSyncState(patch: Partial<CanvasSyncState>) {
  syncState = { ...syncState, ...patch }
  listeners.forEach((l) => l())
}

const FEED_NOTICE_KEY = 'chronograma-canvas-feed-notice'

/**
 * カレンダーフィードでつないだ学校の課題は読むだけなので、ここで完了にしても Canvas は変わらない。
 * 最初に完了にしたときだけ、この端末で一度知らせる
 */
function noticeFeedIsReadOnly() {
  try {
    if (localStorage.getItem(FEED_NOTICE_KEY)) return
    localStorage.setItem(FEED_NOTICE_KEY, '1')
  } catch {
    return
  }
  notify(i18n.t('canvas.feedCompleteNotice'))
}

/** 設定画面の「今すぐ同期」や、接続の直後に呼ぶ */
export function requestCanvasSync() {
  requestSync?.()
}

/** 前回 Canvas から取り込んだタイトル・期限（この端末だけ。ユーザーが変えた値を上書きしないため） */
const pulledKey = (userId: string) => `${CANVAS_PULLED_PREFIX}${userId}`

/** まだ Canvas に届いていない完了の付け外し（この端末だけ。届くまで間隔をあけて送り直す）。付けるか外すかは送るときのタスクの状態 */
type CanvasWritePayload = { connectionId: string; type: string; id: string }
const canvasWriteKey = (userId: string) => `${WRITE_BACK_PREFIX}canvas:${userId}`

/** どこかの学校の接続が切れていて、つなぎ直さないと直らない */
export function canvasReconnectNeeded(s: CanvasSyncState): boolean {
  return needsReconnect(s.error) || Object.values(s.connectionErrors).some(needsReconnect)
}

export function useCanvasReconnectNeeded(): boolean {
  return canvasReconnectNeeded(useCanvasSyncState())
}

export function useCanvasSyncState(): CanvasSyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => syncState,
  )
}

/**
 * つないだ学校ごとに Canvas の課題をその学校のリストに取り込み、タスクの完了を Canvas の To Do に書き戻す。
 */
export function useCanvasSync() {
  const { user, session, loading } = useAuth()
  const userId = user?.id ?? null
  // タブを閉じるときはセッションの読み出しを待てないので、手元に持っておく
  const accessTokenRef = useRef<string | null>(null)
  useEffect(() => {
    accessTokenRef.current = session?.access_token ?? null
  }, [session])

  useEffect(() => {
    if (!isSupabaseConfigured || !userId || loading) {
      setSyncState({ lastSyncedAt: null, error: null, connectionErrors: {} })
      bindCanvasSubmitted(null)
      return
    }
    bindCanvasSubmitted(userId)

    let cancelled = false
    let running = false
    let rerun = false
    /** 前に取り込みを始めた時刻（画面に戻ったときの取り直しの間隔に使う） */
    let lastStartedAt = 0
    /** 自動で完了にしたタスク。ユーザーの完了ではないので Canvas に書き戻さない */
    const autoCompleted = new Set<string>()
    /** 猶予中の書き戻し（猶予が明けたら送る） */
    const pendingWrite = new Map<string, { timer: ReturnType<typeof setTimeout>; payload: CanvasWritePayload }>()
    /** 送り直し待ち。届くまで、そのタスクは取り込みで上書きしない（外した完了が次の同期で戻らないように） */
    const writeQueue = writeBackQueue<CanvasWritePayload>(canvasWriteKey(userId))
    /** 送っている最中のもの（同じものを同時に 2 回送らない） */
    const sending = new Set<string>()
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    /** カレンダーフィードでつないだ学校。完了を書き戻さない */
    const readOnly = new Set<string>()

    /** `manual`: 設定の「今すぐ同期」など。代表でないタブからでも取り込む */
    const run = async (manual = false) => {
      // 取り込みは代表の 1 つのタブだけ（ほかのタブは保存の共有で同じ結果を受け取る）
      if (!manual && !(await isLeaderTab())) return
      // つないでいないと分かっていれば呼ばない（設定からの同期・接続は呼ぶ）
      if (!manual && knownNotConnected('canvas', userId)) return
      if (running) {
        rerun = true
        return
      }
      running = true
      lastStartedAt = Date.now()
      setSyncState({ syncing: true })
      try {
        do {
          rerun = false
          const res = await fetchCanvasItems()
          if (cancelled) return
          noteIntegrationConnected('canvas', userId, res.connections.length > 0)
          // 取得と反映の間に await を挟まない（この間のローカル編集を取りこぼさない）
          const s = useTaskStore.getState()
          let next = { lists: s.lists, sections: s.sections, tasks: s.tasks }
          let changed = false
          // 学校ごとに分かれていた版のリストを 1 つにまとめる（開いていたらまとめた先を開く）
          const merged = mergeCanvasLists(next, new Date().toISOString())
          let selectedListId = s.selectedListId
          if (merged) {
            next = { lists: merged.lists, sections: merged.sections, tasks: merged.tasks }
            changed = true
            if (selectedListId && merged.mergedIds.includes(selectedListId)) selectedListId = CANVAS_LIST_ID
          }
          // 科目ごとのセクションだった版の課題を、科目のタグに移す
          const toTags = canvasCourseSectionsToTags(next, new Date().toISOString())
          if (toTags.converted) {
            next = { ...next, sections: toTags.sections, tasks: toTags.tasks }
            changed = true
          }
          const connectionErrors: Record<string, string> = {}
          const pulled = loadPulled(pulledKey(userId))
          /** 接続ごとの、提出はしたが済んではいない課題（行の目印と「終わった？」の知らせ） */
          const submitted: Array<[string, string[]]> = []
          for (const conn of res.connections) {
            if ('error' in conn) {
              connectionErrors[conn.id] = conn.error
              continue
            }
            if (conn.readOnly) readOnly.add(conn.id)
            else readOnly.delete(conn.id)
            const result = reconcileCanvasItems(next, conn, {
              now: new Date().toISOString(),
              timeZone: appTimeZone(),
              untitled: i18n.t('canvas.untitled'),
              // 書き戻し待ち・送り直し待ちのものは、Canvas がまだ古い状態なので触らない
              skipIds: new Set([...pendingWrite.keys(), ...writeQueue.all().map(([id]) => id)]),
              pulled,
            })
            Object.assign(pulled, result.pulled)
            submitted.push([conn.id, result.submittedIds])
            result.autoCompletedIds.forEach((id) => autoCompleted.add(id))
            if (result.changed) {
              next = { ...next, sections: result.sections, tasks: result.tasks }
              changed = true
            }
          }
          savePulled(pulledKey(userId), pulled)
          if (changed) asIncomingChange(() => useTaskStore.setState({ ...next, selectedListId }))
          for (const [id, ids] of submitted) noteCanvasSubmitted(id, ids)
          const wasLost = canvasReconnectNeeded(syncState)
          setSyncState({ lastSyncedAt: new Date().toISOString(), error: null, connectionErrors })
          // 接続が切れたら 1 回だけ知らせる（Canvas のリストの上と設定には直るまで出す）
          if (!wasLost && canvasReconnectNeeded(syncState)) notify(i18n.t('integrationReconnect.lost', { name: 'Canvas' }))
          // 届いていない書き戻しを、待ち時間を待たずに送り直す（いま Canvas に届くと分かったので）
          void flushWrites(true)
        } while (rerun && !cancelled)
      } catch (e) {
        if (cancelled) return
        console.error('[canvas]', e)
        reportFailure('integration', 'canvas', e, { code: e instanceof CanvasRequestError ? e.code : null })
        const wasLost = canvasReconnectNeeded(syncState)
        setSyncState({ error: e instanceof CanvasRequestError && e.code ? e.code : e instanceof Error ? e.message : String(e) })
        if (!wasLost && canvasReconnectNeeded(syncState)) notify(i18n.t('integrationReconnect.lost', { name: 'Canvas' }))
      } finally {
        running = false
        if (!cancelled) setSyncState({ syncing: false })
      }
    }

    /**
     * 1 件送る（付けるか外すかは、いまのタスクの状態）。送れたら送り直し待ちから外し、送れなければ間隔をあけて次に回す。
     * 送っている間に付け外しが変わったら、外さずに残して送り直す
     */
    const sendWrite = async (taskId: string, p: CanvasWritePayload) => {
      const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
      if (!task || sending.has(taskId)) return
      sending.add(taskId)
      const complete = task.completed
      try {
        await markCanvasComplete(p.connectionId, p.type, p.id, complete)
        if (useTaskStore.getState().tasks.find((t) => t.id === taskId)?.completed === complete) writeQueue.done(taskId)
        else writeQueue.put(taskId, p)
      } catch (e) {
        writeQueue.fail(taskId)
        console.error('[canvas] complete', e)
        reportFailure('integration', 'canvas:complete', e, { code: e instanceof CanvasRequestError ? e.code : null })
        if (!cancelled) setSyncState({ error: e instanceof CanvasRequestError && e.code ? e.code : String(e) })
      } finally {
        sending.delete(taskId)
        if (!cancelled) scheduleRetry()
      }
    }

    /** 送り直し待ちのうち、いま送ってよいものを送る。`now`: 次に送ってよい時刻を待たずに全部 */
    const flushWrites = async (now = false) => {
      for (const [taskId, e] of now ? writeQueue.all() : writeQueue.due()) {
        if (cancelled) return
        // 猶予中のものは、猶予が明けたときに送る。まだ手元に読み込まれていないものは次に回す（古くなれば捨てる）
        if (pendingWrite.has(taskId)) continue
        await sendWrite(taskId, e.payload)
      }
    }

    /** 送り直しは代表のタブだけ（取り込みと同じ。同じ端末のタブで送り直し待ちを分け合う） */
    const retryAsLeader = (now = false) => {
      void isLeaderTab().then((leader) => {
        if (leader && !cancelled) void flushWrites(now)
      })
    }

    /** 次に送ってよい時刻に、送り直しを起こす */
    function scheduleRetry() {
      clearTimeout(retryTimer)
      const at = writeQueue.nextDueAt()
      if (at === null || cancelled) return
      retryTimer = setTimeout(() => retryAsLeader(), Math.max(1_000, at - Date.now()))
    }

    const write = (taskId: string, connectionId: string, type: string, id: string) => {
      const payload = { connectionId, type, id }
      clearTimeout(pendingWrite.get(taskId)?.timer)
      pendingWrite.set(taskId, {
        payload,
        timer: setTimeout(() => {
          pendingWrite.delete(taskId)
          if (!useTaskStore.getState().tasks.some((t) => t.id === taskId)) return
          // 猶予のあいだに付け外しを繰り返しても、最後の状態だけを書く。
          // 送れなかったら、閉じても次に開いたときに送り直せるよう先に覚えておく
          writeQueue.put(taskId, payload)
          void sendWrite(taskId, payload)
        }, WRITE_DELAY_MS),
      })
    }

    /**
     * 猶予中のものを待たずに送る（タブを閉じる・隠れるとき）。応答は待てないので送り直し待ちにも積んでおき、
     * 次に開いたときにもう一度送る（同じ状態を書くだけなので、二重に届いても変わらない）
     */
    const flushPending = () => {
      const token = accessTokenRef.current
      for (const { payload, completed } of queuePending()) {
        if (token) markCanvasCompleteOnLeave(payload.connectionId, payload.type, payload.id, completed, token)
      }
    }

    /** 猶予中のものを送り直し待ちに積む（猶予は待たない）。積んだものと、いまの付け外しを返す */
    function queuePending(): { payload: CanvasWritePayload; completed: boolean }[] {
      const queued: { payload: CanvasWritePayload; completed: boolean }[] = []
      for (const [taskId, p] of [...pendingWrite]) {
        clearTimeout(p.timer)
        pendingWrite.delete(taskId)
        const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
        if (!task) continue
        writeQueue.put(taskId, p.payload)
        queued.push({ payload: p.payload, completed: task.completed })
      }
      return queued
    }

    // ログアウトの前に、猶予中のものも含めて今すぐ送る（残った数は確かめに出す）
    const unregisterWrites = registerIntegrationWrites('canvas', {
      flush: () => {
        queuePending()
        return flushWrites(true)
      },
      count: () => writeQueue.all().length,
    })

    const unsub = useTaskStore.subscribe((state, prev) => {
      if (state.tasks === prev.tasks) return
      // 書き戻すのはこの端末でのユーザーの操作だけ（同期・他のタブ・取り込みで届いた完了は書き戻さない）
      if (isIncomingChange() || isAdoptingFromOtherTab()) return
      let prevById: Map<string, boolean> | null = null
      for (const t of state.tasks) {
        if (!t.id.startsWith('canvas-')) continue
        const parsed = parseCanvasTaskId(t.id)
        if (!parsed) continue
        prevById ??= new Map(prev.tasks.filter((p) => p.id.startsWith('canvas-')).map((p) => [p.id, p.completed]))
        const before = prevById.get(t.id)
        // 新しく現れたタスク（取り込み・他の端末からの同期）や、完了が変わっていないものは対象外
        if (before === undefined || before === t.completed) continue
        if (t.completed && autoCompleted.delete(t.id)) continue
        if (readOnly.has(parsed.connectionId)) {
          if (t.completed) noticeFeedIsReadOnly()
          continue
        }
        write(t.id, parsed.connectionId, parsed.type, parsed.id)
      }
    })

    requestSync = () => void run(true)

    // 初回はクラウドの内容を取り込み終えるのを待つ（送信・設定の同期は待たない。時間切れなら待たずに始める）
    let firstTimer: ReturnType<typeof setTimeout> | undefined
    let unsubFirst: (() => void) | undefined
    const start = () => {
      clearTimeout(firstTimer)
      unsubFirst?.()
      unsubFirst = undefined
      if (!cancelled) void run()
    }
    if (cloudReady(useTaskStore.getState())) {
      start()
    } else {
      unsubFirst = useTaskStore.subscribe((s) => {
        if (cloudReady(s)) start()
      })
      firstTimer = setTimeout(start, FIRST_SYNC_WAIT_MS)
    }

    // スマホではタブを閉じても pagehide が来ないことがあるので、隠れたときにも送る
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (shouldRefetchOnReturn(running, lastStartedAt)) void run()
      } else flushPending()
    }
    // 回線が戻ったら、送り直し待ちをすぐ送る
    const onOnline = () => retryAsLeader(true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', flushPending)
    window.addEventListener('online', onOnline)
    scheduleRetry()
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void run()
    }, POLL_MS)

    return () => {
      cancelled = true
      requestSync = null
      unregisterWrites()
      clearTimeout(firstTimer)
      unsubFirst?.()
      clearInterval(poll)
      pendingWrite.forEach((p) => clearTimeout(p.timer))
      clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', flushPending)
      window.removeEventListener('online', onOnline)
      unsub()
    }
  }, [userId, loading])
}
