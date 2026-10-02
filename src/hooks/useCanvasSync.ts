import { useEffect, useSyncExternalStore } from 'react'
import i18n from '../i18n/config'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { paletteColors } from '../lib/listColorPalettes'
import { appTimeZone } from '../lib/timeZone'
import {
  CanvasRequestError,
  fetchCanvasItems,
  markCanvasComplete,
  parseCanvasTaskId,
  reconcileCanvasItems,
} from '../lib/canvas'
import { useTaskStore } from '../store/taskStore'

/** Canvas は 1 回の取り込みで数ページ読むので、開いている間の取り込みは控えめに */
const POLL_MS = 5 * 60_000
/** 完了を付け外ししてから Canvas に書くまでの猶予。この間に戻せば（⌘Z も）Canvas は触らない */
const WRITE_DELAY_MS = 5_000
/** 初回はクラウド同期の取得を待つ（新しい端末で、取得前に作ったタスクが上書きされないように） */
const FIRST_SYNC_WAIT_MS = 10_000

export type CanvasSyncState = {
  /** null はまだ確認していない */
  connected: boolean | null
  syncing: boolean
  lastSyncedAt: string | null
  /** サーバーのエラーコード（`canvas_unauthorized` など）か、その他のメッセージ */
  error: string | null
}

let syncState: CanvasSyncState = { connected: null, syncing: false, lastSyncedAt: null, error: null }
const listeners = new Set<() => void>()
let requestSync: (() => void) | null = null

function setSyncState(patch: Partial<CanvasSyncState>) {
  syncState = { ...syncState, ...patch }
  listeners.forEach((l) => l())
}

/** 設定画面の「今すぐ同期」や、接続の直後に呼ぶ */
export function requestCanvasSync() {
  requestSync?.()
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
 * Canvas の課題を Canvas 用リストに取り込み、そのリストのタスクの完了を Canvas の To Do に書き戻す。
 */
export function useCanvasSync() {
  const { user, loading } = useAuth()
  const userId = user?.id ?? null

  useEffect(() => {
    if (!isSupabaseConfigured || !userId || loading) {
      setSyncState({ connected: null, lastSyncedAt: null, error: null })
      return
    }

    let cancelled = false
    let running = false
    let rerun = false
    /** 自動で完了にしたタスク。ユーザーの完了ではないので Canvas に書き戻さない */
    const autoCompleted = new Set<string>()
    const pendingWrite = new Map<string, ReturnType<typeof setTimeout>>()

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
          const res = await fetchCanvasItems()
          if (cancelled) return
          if (!res.connected) {
            setSyncState({ connected: false, error: null })
            continue
          }
          // 取得と反映の間に await を挟まない（この間のローカル編集を取りこぼさない）
          const s = useTaskStore.getState()
          const cols = paletteColors(s.listColorPaletteId)
          const result = reconcileCanvasItems(
            { lists: s.lists, sections: s.sections, tasks: s.tasks },
            res,
            {
              now: new Date().toISOString(),
              listName: 'Canvas',
              listColor: cols[s.lists.length % cols.length],
              timeZone: appTimeZone(),
              untitled: i18n.t('canvas.untitled'),
              // 書き戻し待ちのものは、Canvas がまだ古い状態なので触らない
              skipIds: new Set(pendingWrite.keys()),
            },
          )
          result.autoCompletedIds.forEach((id) => autoCompleted.add(id))
          if (result.changed) useTaskStore.setState({ lists: result.lists, sections: result.sections, tasks: result.tasks })
          setSyncState({ connected: true, lastSyncedAt: new Date().toISOString(), error: null })
        } while (rerun && !cancelled)
      } catch (e) {
        if (cancelled) return
        console.error('[canvas]', e)
        setSyncState({ error: e instanceof CanvasRequestError && e.code ? e.code : e instanceof Error ? e.message : String(e) })
      } finally {
        running = false
        if (!cancelled) setSyncState({ syncing: false })
      }
    }

    const write = (taskId: string, type: string, id: string) => {
      clearTimeout(pendingWrite.get(taskId))
      pendingWrite.set(
        taskId,
        setTimeout(() => {
          const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
          if (!task) {
            pendingWrite.delete(taskId)
            return
          }
          // 猶予のあいだに付け外しを繰り返しても、最後の状態だけを書く
          markCanvasComplete(type, id, task.completed)
            .catch((e) => {
              console.error('[canvas] complete', e)
              if (!cancelled) setSyncState({ error: e instanceof CanvasRequestError && e.code ? e.code : String(e) })
            })
            .finally(() => pendingWrite.delete(taskId))
        }, WRITE_DELAY_MS),
      )
    }

    const unsub = useTaskStore.subscribe((state, prev) => {
      if (state.tasks === prev.tasks) return
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
        write(t.id, parsed.type, parsed.id)
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
      pendingWrite.forEach((t) => clearTimeout(t))
      document.removeEventListener('visibilitychange', onVisible)
      unsub()
    }
  }, [userId, loading])
}
