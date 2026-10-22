import { useEffect, useRef, useSyncExternalStore } from 'react'
import i18n from '../i18n/config'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { ensureLabel, type LabelTable } from '../lib/foldTaskFolders'
import {
  advanceNotionPage,
  advanceNotionPageOnLeave,
  fetchNotionPages,
  NotionRequestError,
  notionTaskId,
  parseNotionTaskId,
  reconcileNotionPages,
} from '../lib/notion'
import { useTaskStore, isAdoptingFromOtherTab, setStateWithImportedLabels } from '../store/taskStore'
import { cloudReady } from '../lib/cloudReady'
import { needsReconnect } from '../lib/integrationReconnect'
import { notify } from '../lib/notify'
import { knownNotConnected, noteIntegrationConnected, shouldRefetchOnReturn } from '../lib/integrationHint'
import { reportFailure } from '../lib/errorReport'
import { asIncomingChange, isIncomingChange } from '../lib/changeOrigin'
import { isLeaderTab } from '../lib/tabLeader'
import { NOTION_PULLED_PREFIX, loadPulled, savePulled } from '../lib/externalFields'
import { WRITE_BACK_PREFIX, writeBackQueue } from '../lib/writeBackQueue'
import { registerIntegrationWrites } from '../lib/integrationWrites'
import type { SyncStatus } from '../types/sync'

/** Notion は 1 秒 3 回までなので、開いている間の取り込みは控えめに */
const POLL_MS = 5 * 60_000
/** 完了にしてから Notion を進めるまでの猶予。この間に戻せば（⌘Z も）Notion は触らない。タブを閉じる・隠れるときは待たずに送る */
const ADVANCE_DELAY_MS = 5_000
/** 初回はクラウド同期の取得を待つ（新しい端末で、取得前に作ったタスクが上書きされないように） */
const FIRST_SYNC_WAIT_MS = 10_000
/** 保存した設定が今のデータベースと合わない（Notion でステータスの名前を変えた・消した）。設定を見直すまで出す */
export const NOTION_CONFIG_CHANGED = 'notion_config_changed'

export type NotionSyncState = SyncStatus & {
  /** null はまだ確認していない */
  connected: boolean | null
  configured: boolean
}

let syncState: NotionSyncState = { connected: null, configured: false, syncing: false, lastSyncedAt: null, error: null }
const listeners = new Set<() => void>()
let requestSync: (() => void) | null = null

function setSyncState(patch: Partial<NotionSyncState>) {
  syncState = { ...syncState, ...patch }
  listeners.forEach((l) => l())
}

/** 設定画面の「今すぐ同期」や、接続・設定の保存直後に呼ぶ */
export function requestNotionSync() {
  requestSync?.()
}

/** 前回 Notion から取り込んだタイトル・期限（この端末だけ。ユーザーが変えた値を上書きしないため） */
const notionPulledKey = (userId: string) => `${NOTION_PULLED_PREFIX}${userId}`

/** まだ Notion に届いていない「完了で進める」（この端末だけ。届くまで間隔をあけて送り直す） */
type AdvancePayload = { pageId: string; status: string }
const notionAdvanceKey = (userId: string) => `${WRITE_BACK_PREFIX}notion:${userId}`

/** Notion の接続が切れていて、つなぎ直さないと直らない */
export function useNotionReconnectNeeded(): boolean {
  return needsReconnect(useNotionSyncState().error)
}

export function useNotionSyncState(): NotionSyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => syncState,
  )
}

/**
 * Notion の「要アクション」の行を Notion 用リストに取り込み、
 * そのリストのタスクを完了にしたら Notion のステータスを次へ進める。
 */
export function useNotionSync() {
  const { user, session, loading } = useAuth()
  const userId = user?.id ?? null
  // タブを閉じるときはセッションの読み出しを待てないので、手元に持っておく
  const accessTokenRef = useRef<string | null>(null)
  useEffect(() => {
    accessTokenRef.current = session?.access_token ?? null
  }, [session])

  useEffect(() => {
    if (!isSupabaseConfigured || !userId || loading) {
      setSyncState({ connected: null, configured: false, lastSyncedAt: null, error: null })
      return
    }

    let cancelled = false
    let running = false
    let rerun = false
    /** 前に取り込みを始めた時刻（画面に戻ったときの取り直しの間隔に使う） */
    let lastStartedAt = 0
    /** 自動で完了にしたタスク。ユーザーの完了ではないので Notion に書き戻さない */
    const autoCompleted = new Set<string>()
    const pendingAdvance = new Map<string, { timer: ReturnType<typeof setTimeout>; pageId: string; status: string }>()
    /** 送り直し待ち。進めるのはサーバーが「まだそのステータスか」を見てからなので、何度送っても二重には進まない */
    const advanceQueue = writeBackQueue<AdvancePayload>(notionAdvanceKey(userId))
    /** 送っている最中のもの（同じものを同時に 2 回送らない） */
    const sending = new Set<string>()
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    /** 設定が合わなくなったことを知らせたか（直るまでに何度も知らせない） */
    let configNoticeShown = false
    /** 設定が合わなくなったことを、1 回だけ知らせる（設定には直るまで出す） */
    const noteConfigChanged = () => {
      setSyncState({ error: NOTION_CONFIG_CHANGED })
      if (!configNoticeShown) notify(i18n.t('notion.configChangedNotice'))
      configNoticeShown = true
    }

    /** `manual`: 設定の「今すぐ同期」など。代表でないタブからでも取り込む */
    const run = async (manual = false) => {
      // 取り込みは代表の 1 つのタブだけ
      if (!manual && !(await isLeaderTab())) return
      // つないでいないと分かっていれば呼ばない（設定からの同期・接続は呼ぶ）
      if (!manual && knownNotConnected('notion', userId)) {
        setSyncState({ connected: false, configured: false, error: null })
        return
      }
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
          const res = await fetchNotionPages()
          if (cancelled) return
          noteIntegrationConnected('notion', userId, res.connected && res.configured)
          if (!res.connected) {
            setSyncState({ connected: false, configured: false, error: null })
            continue
          }
          if (!res.configured) {
            setSyncState({ connected: true, configured: false, error: null })
            if (res.configChanged) noteConfigChanged()
            continue
          }
          // 取得と反映の間に await を挟まない（この間のローカル編集を取りこぼさない）
          const s = useTaskStore.getState()
          // 新しいタスクにはデータベース名のラベルを付ける（無ければ作る）
          const labels0: LabelTable = { timeLogTagPresets: s.timeLogTagPresets, logCategoryColors: s.logCategoryColors }
          let labels = labels0
          const result = reconcileNotionPages({ tasks: s.tasks }, res, {
            now: new Date().toISOString(),
            colorFor: () => {
              const name = res.databaseTitle.trim()
              if (!name) return null
              const r = ensureLabel(labels, name)
              labels = r.table
              return r.hex
            },
            titleFor: (p) => i18n.t('notion.taskTitle', { name: p.title || i18n.t('notion.untitled'), status: p.status }),
            pulled: loadPulled(notionPulledKey(userId)),
            // 設定が合わないときは「要アクションでなくなった」が本当か分からないので、完了にしない
            autoComplete: !res.configChanged,
          })
          savePulled(notionPulledKey(userId), result.pulled)
          result.autoCompletedIds.forEach((id) => autoCompleted.add(id))
          // 作ったラベルは「無ければ足す」だけ送る（ラベル表の変えた時刻は進めない。進めるとほかの端末のラベルの編集が負けていた、#357）
          if (result.changed) {
            if (labels === labels0) asIncomingChange(() => useTaskStore.setState({ tasks: result.tasks }))
            else setStateWithImportedLabels({ tasks: result.tasks, ...labels })
          }
          setSyncState({ connected: true, configured: true, lastSyncedAt: new Date().toISOString(), error: null })
          if (res.configChanged) noteConfigChanged()
          else {
            configNoticeShown = false
            // 届いていない「進める」を、待ち時間を待たずに送り直す（いま Notion に届くと分かったので）。
            // もう要アクションに無い行は、ほかで進んだので送らない
            void flushAdvances(new Set(res.pages.map((p) => notionTaskId(p.pageId, p.status))), true)
          }
        } while (rerun && !cancelled)
      } catch (e) {
        if (cancelled) return
        console.error('[notion]', e)
        reportFailure('integration', 'notion', e, { code: e instanceof NotionRequestError ? e.code : null })
        const wasLost = needsReconnect(syncState.error)
        setSyncState({ error: e instanceof NotionRequestError && e.code ? e.code : e instanceof Error ? e.message : String(e) })
        // 接続が切れたら 1 回だけ知らせる（受信箱の上と設定には直るまで出す）
        if (!wasLost && needsReconnect(syncState.error)) notify(i18n.t('integrationReconnect.lost', { name: 'Notion' }))
      } finally {
        running = false
        if (!cancelled) setSyncState({ syncing: false })
      }
    }

    /** 1 件送る。送れたら送り直し待ちから外し、送れなければ間隔をあけて次に回す。進めたら true */
    const sendAdvance = async (taskId: string, p: AdvancePayload): Promise<boolean> => {
      if (sending.has(taskId)) return false
      sending.add(taskId)
      try {
        const r = await advanceNotionPage(p.pageId, p.status)
        advanceQueue.done(taskId)
        if (r.configChanged && !cancelled) noteConfigChanged()
        return r.advanced
      } catch (e) {
        advanceQueue.fail(taskId)
        console.error('[notion] advance', e)
        reportFailure('integration', 'notion:advance', e, { code: e instanceof NotionRequestError ? e.code : null })
        if (!cancelled) setSyncState({ error: e instanceof NotionRequestError && e.code ? e.code : String(e) })
        return false
      } finally {
        sending.delete(taskId)
        if (!cancelled) scheduleRetry()
      }
    }

    /**
     * 送り直し待ちのうち、いま送ってよいものを送る。
     * `actionIds` は取り込んだばかりの要アクションの行（無い行は Notion 側で既に進んでいるので送らずに外す）。
     * `now`: 次に送ってよい時刻を待たずに全部送る（回線が戻った・Notion に届くと分かったとき）
     */
    const flushAdvances = async (actionIds?: ReadonlySet<string>, now = false) => {
      let advanced = false
      for (const [taskId, e] of now ? advanceQueue.all() : advanceQueue.due()) {
        if (cancelled) return
        // 猶予中のものは、猶予が明けたときに送る
        if (pendingAdvance.has(taskId)) continue
        // 完了を戻した・消したものは進めない
        const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
        if ((task && !task.completed) || (actionIds && !actionIds.has(taskId))) {
          advanceQueue.done(taskId)
          continue
        }
        // まだ手元に読み込まれていないだけかもしれないので、見つからないものは次に回す（古くなれば捨てる）
        if (!task) continue
        if (await sendAdvance(taskId, e.payload)) advanced = true
      }
      // 進めた先が要アクションなら、次の段階のタスクをすぐ出す
      if (advanced && !cancelled) void run()
    }

    /** 送り直しは代表のタブだけ（取り込みと同じ。同じ端末のタブで送り直し待ちを分け合う） */
    const retryAsLeader = (now = false) => {
      void isLeaderTab().then((leader) => {
        if (leader && !cancelled) void flushAdvances(undefined, now)
      })
    }

    /** 次に送ってよい時刻に、送り直しを起こす */
    function scheduleRetry() {
      clearTimeout(retryTimer)
      const at = advanceQueue.nextDueAt()
      if (at === null || cancelled) return
      retryTimer = setTimeout(() => retryAsLeader(), Math.max(1_000, at - Date.now()))
    }

    const advance = (taskId: string, pageId: string, status: string) => {
      clearTimeout(pendingAdvance.get(taskId)?.timer)
      pendingAdvance.set(taskId, {
        pageId,
        status,
        timer: setTimeout(() => {
          pendingAdvance.delete(taskId)
          const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
          if (!task?.completed) return
          // 送れなかったら、閉じても次に開いたときに送り直せるよう先に覚えておく
          advanceQueue.put(taskId, { pageId, status })
          void sendAdvance(taskId, { pageId, status }).then((advanced) => {
            if (advanced && !cancelled) void run()
          })
        }, ADVANCE_DELAY_MS),
      })
    }

    /**
     * 猶予中のものを待たずに送る。応答は待てないので送り直し待ちにも積んでおき、次に開いたときにもう一度送る
     * （届いていればサーバーが「もう進んでいる」と見て何もしない）
     */
    const flushPending = () => {
      const token = accessTokenRef.current
      for (const p of queuePending()) if (token) advanceNotionPageOnLeave(p.pageId, p.status, token)
    }

    /** 猶予中のものを送り直し待ちに積む（猶予は待たない）。積んだものを返す */
    function queuePending(): AdvancePayload[] {
      const queued: AdvancePayload[] = []
      for (const [taskId, p] of [...pendingAdvance]) {
        clearTimeout(p.timer)
        pendingAdvance.delete(taskId)
        if (!useTaskStore.getState().tasks.find((t) => t.id === taskId)?.completed) continue
        const payload = { pageId: p.pageId, status: p.status }
        advanceQueue.put(taskId, payload)
        queued.push(payload)
      }
      return queued
    }

    // ログアウトの前に、猶予中のものも含めて今すぐ送る（残った数は確かめに出す）
    const unregisterWrites = registerIntegrationWrites('notion', {
      flush: () => {
        queuePending()
        return flushAdvances(undefined, true)
      },
      count: () => advanceQueue.all().length,
    })

    const unsub = useTaskStore.subscribe((state, prev) => {
      if (state.tasks === prev.tasks) return
      // 進めるのはこの端末でのユーザーの完了だけ（同期・他のタブ・取り込みで届いた完了では進めない）
      if (isIncomingChange() || isAdoptingFromOtherTab()) return
      let prevById: Map<string, boolean> | null = null
      for (const t of state.tasks) {
        if (!t.completed || !t.id.startsWith('notion-')) continue
        const parsed = parseNotionTaskId(t.id)
        if (!parsed) continue
        prevById ??= new Map(prev.tasks.filter((p) => p.id.startsWith('notion-')).map((p) => [p.id, p.completed]))
        // 新しく現れたタスク（他の端末から同期された完了済み）や、もともと完了のものは対象外
        if (prevById.get(t.id) !== false) continue
        if (autoCompleted.delete(t.id)) continue
        // 他の端末で完了したものがここに来ても、サーバーが「まだそのステータスか」を見るので二重には進まない
        advance(t.id, parsed.pageId, parsed.status)
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
      pendingAdvance.forEach((p) => clearTimeout(p.timer))
      clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', flushPending)
      window.removeEventListener('online', onOnline)
      unsub()
    }
  }, [userId, loading])
}
