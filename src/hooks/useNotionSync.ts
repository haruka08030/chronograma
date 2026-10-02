import { useEffect, useSyncExternalStore } from 'react'
import i18n from '../i18n/config'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { paletteColors } from '../lib/listColorPalettes'
import {
  advanceNotionPage,
  fetchNotionPages,
  NotionRequestError,
  parseNotionTaskId,
  reconcileNotionPages,
} from '../lib/notion'
import { useTaskStore } from '../store/taskStore'

/** Notion は 1 秒 3 回までなので、開いている間の取り込みは控えめに */
const POLL_MS = 5 * 60_000
/** 完了にしてから Notion を進めるまでの猶予。この間に戻せば（⌘Z も）Notion は触らない */
const ADVANCE_DELAY_MS = 5_000
/** 初回はクラウド同期の取得を待つ（新しい端末で、取得前に作ったタスクが上書きされないように） */
const FIRST_SYNC_WAIT_MS = 10_000

export type NotionSyncState = {
  /** null はまだ確認していない */
  connected: boolean | null
  configured: boolean
  syncing: boolean
  lastSyncedAt: string | null
  /** サーバーのエラーコード（`notion_unauthorized` など）か、その他のメッセージ */
  error: string | null
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
  const { user, loading } = useAuth()
  const userId = user?.id ?? null

  useEffect(() => {
    if (!isSupabaseConfigured || !userId || loading) {
      setSyncState({ connected: null, configured: false, lastSyncedAt: null, error: null })
      return
    }

    let cancelled = false
    let running = false
    let rerun = false
    /** 自動で完了にしたタスク。ユーザーの完了ではないので Notion に書き戻さない */
    const autoCompleted = new Set<string>()
    const pendingAdvance = new Map<string, ReturnType<typeof setTimeout>>()

    const run = async () => {
      if (running) {
        rerun = true
        return
      }
      running = true
      setSyncState({ syncing: true })
      try {
        do {
          rerun = false
          const res = await fetchNotionPages()
          if (cancelled) return
          if (!res.connected) {
            setSyncState({ connected: false, configured: false, error: null })
            continue
          }
          if (!res.configured) {
            setSyncState({ connected: true, configured: false, error: null })
            continue
          }
          // 取得と反映の間に await を挟まない（この間のローカル編集を取りこぼさない）
          const s = useTaskStore.getState()
          const cols = paletteColors(s.listColorPaletteId)
          const result = reconcileNotionPages(
            { lists: s.lists, tasks: s.tasks },
            res,
            {
              now: new Date().toISOString(),
              listColor: cols[s.lists.length % cols.length],
              titleFor: (p) => i18n.t('notion.taskTitle', { name: p.title || i18n.t('notion.untitled'), status: p.status }),
            },
          )
          result.autoCompletedIds.forEach((id) => autoCompleted.add(id))
          if (result.changed) useTaskStore.setState({ lists: result.lists, tasks: result.tasks })
          setSyncState({ connected: true, configured: true, lastSyncedAt: new Date().toISOString(), error: null })
        } while (rerun && !cancelled)
      } catch (e) {
        if (cancelled) return
        console.error('[notion]', e)
        setSyncState({ error: e instanceof NotionRequestError && e.code ? e.code : e instanceof Error ? e.message : String(e) })
      } finally {
        running = false
        if (!cancelled) setSyncState({ syncing: false })
      }
    }

    const advance = (taskId: string, pageId: string, status: string) => {
      clearTimeout(pendingAdvance.get(taskId))
      pendingAdvance.set(
        taskId,
        setTimeout(() => {
          pendingAdvance.delete(taskId)
          const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
          if (!task?.completed) return
          advanceNotionPage(pageId, status)
            .then((r) => {
              // 進めた先が要アクションなら、次の段階のタスクをすぐ出す
              if (r.advanced && !cancelled) void run()
            })
            .catch((e) => {
              console.error('[notion] advance', e)
              if (!cancelled) setSyncState({ error: e instanceof NotionRequestError && e.code ? e.code : String(e) })
            })
        }, ADVANCE_DELAY_MS),
      )
    }

    const unsub = useTaskStore.subscribe((state, prev) => {
      if (state.tasks === prev.tasks) return
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

    requestSync = () => void run()

    // 初回はクラウド同期が一度終わるのを待つ（時間切れなら待たずに始める）
    let firstTimer: ReturnType<typeof setTimeout> | undefined
    let unsubFirst: (() => void) | undefined
    const start = () => {
      clearTimeout(firstTimer)
      unsubFirst?.()
      unsubFirst = undefined
      if (!cancelled) void run()
    }
    if (useTaskStore.getState().lastSyncedAt) {
      start()
    } else {
      unsubFirst = useTaskStore.subscribe((s) => {
        if (s.lastSyncedAt) start()
      })
      firstTimer = setTimeout(start, FIRST_SYNC_WAIT_MS)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void run()
    }
    document.addEventListener('visibilitychange', onVisible)
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void run()
    }, POLL_MS)

    return () => {
      cancelled = true
      requestSync = null
      clearTimeout(firstTimer)
      unsubFirst?.()
      clearInterval(poll)
      pendingAdvance.forEach((t) => clearTimeout(t))
      document.removeEventListener('visibilitychange', onVisible)
      unsub()
    }
  }, [userId, loading])
}
