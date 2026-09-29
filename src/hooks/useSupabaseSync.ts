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
    if (!userId || loading) return
    const supabase = getSupabase()
    if (!supabase) return

    let cancelled = false
    let running = false
    let rerun = false
    let debounce: ReturnType<typeof setTimeout> | undefined

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

    const syncOnce = async () => {
      const remote = await fetchListsTasksHabits(supabase, userId)
      if (cancelled) return
      if ('error' in remote) {
        console.error('[sync]', remote.error)
        return
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
          return
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
      if (cancelled) return
      if (res.error) {
        console.error('[sync]', res.error)
        return
      }
      saveBaseline(userId, baselineFrom(toPush))
    }

    /** 同期は常に 1 本ずつ。実行中に要求が来たら終わってからもう 1 回だけ回す */
    const sync = async () => {
      if (running) {
        rerun = true
        return
      }
      running = true
      try {
        do {
          rerun = false
          await syncOnce()
        } while (rerun && !cancelled)
      } finally {
        running = false
      }
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
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void sync()
    }, POLL_MS)

    return () => {
      cancelled = true
      clearTimeout(debounce)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      unsub()
    }
  }, [userId, loading])
}
