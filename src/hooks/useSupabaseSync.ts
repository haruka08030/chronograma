import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getSupabase } from '../lib/supabase'
import { decideHydrate, fetchListsTasksHabits, pushListsTasksHabits } from '../lib/supabaseData'
import { baselineFrom, loadBaseline, mergeSnapshots, saveBaseline, type SyncSnapshot } from '../lib/syncMerge'
import { useTaskStore, INBOX_LIST_ID } from '../store/taskStore'

const DEBOUNCE_MS = 1800
/** 他端末の変更を取り込む間隔（タブが見えている間だけ） */
const POLL_MS = 60_000

function localSnapshot(): SyncSnapshot {
  const s = useTaskStore.getState()
  return { lists: s.lists, tasks: s.tasks, habits: s.habits, sections: s.sections }
}

/**
 * Supabase 同期。毎回「取得 → 前回同期との三方向マージ → ローカル反映 → push」を行う。
 * 以前はローカルの丸ごとスナップショットを push してサーバー側の差分を削除していたため、
 * 開きっぱなしの端末が他端末で追加されたタスクを消してしまうことがあった。
 */
export function useSupabaseSync() {
  const { user, loading } = useAuth()
  const userId = user?.id ?? null
  /** マージ結果を反映している間は、その変更で再び push を予約しない */
  const applyingRef = useRef(false)

  useEffect(() => {
    if (!userId || loading) {
      // ログアウト時やロード中に「同期エラー」の表示が残らないようにする
      useTaskStore.getState().setSyncState('idle')
      return
    }
    const supabase = getSupabase()
    if (!supabase) return

    let cancelled = false
    let running = false
    let rerun = false
    let debounce: ReturnType<typeof setTimeout> | undefined
    /** 失敗後の再送タイマーと現在の待ち時間（0 = 失敗していない） */
    let retry: ReturnType<typeof setTimeout> | undefined
    let retryMs = 0

    const apply = (next: SyncSnapshot) => {
      const cur = useTaskStore.getState()
      if (
        cur.lists === next.lists &&
        cur.tasks === next.tasks &&
        cur.habits === next.habits &&
        cur.sections === next.sections
      )
        return
      const listIds = new Set(next.lists.map((l) => l.id))
      const sel = cur.selectedListId
      applyingRef.current = true
      try {
        useTaskStore.setState({
          ...next,
          selectedListId: sel && !listIds.has(sel) ? INBOX_LIST_ID : sel,
        })
      } finally {
        applyingRef.current = false
      }
    }

    /** 1 往復ぶん。成功したか（= これ以上送るものが無いか）を返す */
    const syncOnce = async (): Promise<boolean> => {
      const remote = await fetchListsTasksHabits(supabase, userId)
      if (cancelled) return true
      if ('error' in remote) {
        console.error('[sync]', remote.error)
        return false
      }

      const baseline = loadBaseline(userId)
      let toPush: SyncSnapshot
      let deletes = undefined as Parameters<typeof pushListsTasksHabits>[6]

      if (!baseline) {
        // この端末で初めての同期: 従来どおり、サーバーに中身があればサーバー優先
        const local = localSnapshot()
        const decision = decideHydrate(
          remote.lists, remote.tasks, remote.habits, remote.sections,
          local.lists, local.tasks, local.habits, local.sections,
        )
        if (decision.kind === 'use_remote') {
          apply({ lists: decision.lists, tasks: decision.tasks, habits: decision.habits, sections: decision.sections })
          saveBaseline(userId, baselineFrom(localSnapshot()))
          return true
        }
        toPush = local
      } else {
        // 取得後に await を挟まずマージして反映する（この間のローカル編集を取りこぼさない）
        const local = localSnapshot()
        const result = mergeSnapshots(local, remote, baseline)
        // 変わっていない種類は参照を保って再描画・再 push を避ける
        const same = <T,>(a: T[], b: T[]) =>
          a.length === b.length && a.every((x, i) => x === b[i])
        const merged: SyncSnapshot = {
          lists: same(result.merged.lists, local.lists) ? local.lists : result.merged.lists,
          tasks: same(result.merged.tasks, local.tasks) ? local.tasks : result.merged.tasks,
          habits: same(result.merged.habits, local.habits) ? local.habits : result.merged.habits,
          sections: same(result.merged.sections, local.sections) ? local.sections : result.merged.sections,
        }
        apply(merged)
        toPush = merged
        deletes = result.deletes
      }

      const res = await pushListsTasksHabits(
        supabase, userId, toPush.lists, toPush.tasks, toPush.habits, toPush.sections, deletes,
      )
      if (cancelled) return true
      if (res.error) {
        console.error('[sync]', res.error)
        return false
      }
      saveBaseline(userId, baselineFrom(toPush))
      return true
    }

    /**
     * 同期は常に 1 本ずつ。実行中に要求が来たら終わってからもう 1 回だけ回す。
     * 失敗したら未送信の変更が残るので、バックオフで自力再送する（オフライン対策）。
     */
    const sync = async () => {
      if (running) {
        rerun = true
        return
      }
      running = true
      const { setSyncState } = useTaskStore.getState()
      // 60 秒ごとのポーリングでドットが点滅しないよう、
      // 「送信中」を出すのは一度失敗して未送信が残っている間だけにする
      if (retryMs > 0) setSyncState('syncing')
      let ok = false
      try {
        do {
          rerun = false
          ok = await syncOnce()
        } while (ok && rerun && !cancelled)
      } finally {
        running = false
      }
      if (cancelled) return

      if (ok) {
        retryMs = 0
        clearTimeout(retry)
        setSyncState('idle', new Date().toISOString())
        return
      }
      setSyncState('error')
      // 10s → 30s → 60s で打ち切り（以降は 60s ごと）。復帰は online / focus でも拾う
      retryMs = retryMs === 0 ? 10_000 : Math.min(retryMs * 3, 60_000)
      clearTimeout(retry)
      retry = setTimeout(() => void sync(), retryMs)
    }

    void sync()

    const unsub = useTaskStore.subscribe((state, prev) => {
      if (
        state.tasks === prev.tasks &&
        state.lists === prev.lists &&
        state.habits === prev.habits &&
        state.sections === prev.sections
      )
        return
      if (applyingRef.current) return
      clearTimeout(debounce)
      debounce = setTimeout(() => void sync(), DEBOUNCE_MS)
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    /** 回線が戻ったら待たずに送る（地下鉄で編集 → 浮上してそのまま、を防ぐ） */
    const onOnline = () => {
      retryMs = 0
      void sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void sync()
    }, POLL_MS)

    return () => {
      cancelled = true
      clearTimeout(debounce)
      clearTimeout(retry)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
      unsub()
    }
  }, [userId, loading])
}
