import { useEffect, useSyncExternalStore } from 'react'
import i18n from '../i18n/config'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { paletteColors } from '../lib/listColorPalettes'
import { appTimeZone } from '../lib/timeZone'
import {
  CANVAS_LIST_ID,
  canvasCourseSectionsToTags,
  mergeCanvasLists,
  CanvasRequestError,
  fetchCanvasItems,
  markCanvasComplete,
  parseCanvasTaskId,
  reconcileCanvasItems,
} from '../lib/canvas'
import { useTaskStore, isAdoptingFromOtherTab } from '../store/taskStore'
import { notify } from '../lib/notify'
import { asIncomingChange, isIncomingChange } from '../lib/changeOrigin'
import { isLeaderTab } from '../lib/tabLeader'
import { loadPulled, savePulled } from '../lib/externalFields'

/** Canvas は 1 回の取り込みで数ページ読むので、開いている間の取り込みは控えめに */
const POLL_MS = 5 * 60_000
/** 完了を付け外ししてから Canvas に書くまでの猶予。この間に戻せば（⌘Z も）Canvas は触らない */
const WRITE_DELAY_MS = 5_000
/** 初回はクラウド同期の取得を待つ（新しい端末で、取得前に作ったタスクが上書きされないように） */
const FIRST_SYNC_WAIT_MS = 10_000

export type CanvasSyncState = {
  syncing: boolean
  lastSyncedAt: string | null
  /** 全体のエラー。サーバーのエラーコード（`canvas_api` など）か、その他のメッセージ */
  error: string | null
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
const pulledKey = (userId: string) => `chronograma-canvas-pulled-v1:${userId}`

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
  const { user, loading } = useAuth()
  const userId = user?.id ?? null

  useEffect(() => {
    if (!isSupabaseConfigured || !userId || loading) {
      setSyncState({ lastSyncedAt: null, error: null, connectionErrors: {} })
      return
    }

    let cancelled = false
    let running = false
    let rerun = false
    /** 自動で完了にしたタスク。ユーザーの完了ではないので Canvas に書き戻さない */
    const autoCompleted = new Set<string>()
    const pendingWrite = new Map<string, ReturnType<typeof setTimeout>>()
    /** カレンダーフィードでつないだ学校。完了を書き戻さない */
    const readOnly = new Set<string>()

    /** `manual`: 設定の「今すぐ同期」など。代表でないタブからでも取り込む */
    const run = async (manual = false) => {
      // 取り込みは代表の 1 つのタブだけ（ほかのタブは保存の共有で同じ結果を受け取る）
      if (!manual && !isLeaderTab()) return
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
          // 取得と反映の間に await を挟まない（この間のローカル編集を取りこぼさない）
          const s = useTaskStore.getState()
          const cols = paletteColors(s.listColorPaletteId)
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
          // 科目ごとのセクションだった版の課題を、科目のタグに移す。タグが見えるよう「タグを使う」を一度だけオンにする
          let tagsEnabled = s.tagsEnabled
          const toTags = canvasCourseSectionsToTags(next, new Date().toISOString())
          if (toTags.converted) {
            next = { ...next, sections: toTags.sections, tasks: toTags.tasks }
            changed = true
            tagsEnabled = true
          }
          const connectionErrors: Record<string, string> = {}
          const pulled = loadPulled(pulledKey(userId))
          for (const conn of res.connections) {
            if ('error' in conn) {
              connectionErrors[conn.id] = conn.error
              continue
            }
            if (conn.readOnly) readOnly.add(conn.id)
            else readOnly.delete(conn.id)
            const result = reconcileCanvasItems(next, conn, {
              now: new Date().toISOString(),
              listName: 'Canvas',
              listColor: cols[next.lists.length % cols.length],
              timeZone: appTimeZone(),
              untitled: i18n.t('canvas.untitled'),
              // 書き戻し待ちのものは、Canvas がまだ古い状態なので触らない
              skipIds: new Set(pendingWrite.keys()),
              pulled,
            })
            Object.assign(pulled, result.pulled)
            result.autoCompletedIds.forEach((id) => autoCompleted.add(id))
            if (result.changed) {
              next = { lists: result.lists, sections: result.sections, tasks: result.tasks }
              changed = true
            }
          }
          savePulled(pulledKey(userId), pulled)
          if (changed) asIncomingChange(() => useTaskStore.setState({ ...next, selectedListId, tagsEnabled }))
          setSyncState({ lastSyncedAt: new Date().toISOString(), error: null, connectionErrors })
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

    const write = (taskId: string, connectionId: string, type: string, id: string) => {
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
          markCanvasComplete(connectionId, type, id, task.completed)
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
