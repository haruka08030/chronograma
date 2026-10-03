import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getSupabase } from '../lib/supabase'
import { decideHydrate, fetchListsTasksHabits, pushListsTasksHabits } from '../lib/supabaseData'
import {
  baselineFrom,
  loadBaseline,
  mergeSnapshots,
  mergeWithoutBaseline,
  saveBaseline,
  type SyncSnapshot,
} from '../lib/syncMerge'
import { useTaskStore, INBOX_LIST_ID, LEGACY_DATA_OWNER, adoptOtherTabChanges, isAdoptingFromOtherTab } from '../store/taskStore'
import { backupNow } from './useAutoBackup'

const DEBOUNCE_MS = 1800
/** 他端末の変更を取り込む間隔（タブが見えている間だけ） */
const POLL_MS = 60_000

/**
 * 同じ人の同期をタブ間で 1 本ずつにする。前回同期の控え（baseline）は端末で 1 つなので、
 * 2 つのタブが同時に回すと、取得が古いほうのタブが「控えにあってサーバーに無い」を削除と読み違える
 */
function withSyncLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return fn()
  return navigator.locks.request(`chronograma-sync:${userId}`, fn)
}

/** 動いている同期フックの「今すぐ送る」。ログインしていなければ null */
let flushSync: (() => Promise<boolean>) | null = null

/**
 * 待っている変更（入力から 1.8 秒の待ち時間ぶん）を今すぐ送り、送れたかを返す。
 * ログアウトの直前に使う（以前は待ち時間中の編集が送られないまま端末から消えていた）
 */
export function flushPendingSync(): Promise<boolean> {
  return flushSync ? flushSync() : Promise.resolve(true)
}

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
      // 同期で手元のタスクが減るときは、減る前を控えておく（他端末での削除でも、取り違えでも戻せるように）
      if (cur.tasks !== next.tasks) {
        const nextIds = new Set(next.tasks.map((t) => t.id))
        if (cur.tasks.some((t) => !nextIds.has(t.id))) backupNow('beforeSync')
      }
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
    const syncOnce = (): Promise<boolean> => withSyncLock(userId, syncOnceLocked)

    const syncOnceLocked = async (): Promise<boolean> => {
      // 待っている間に他のタブが同期して保存した内容（手元のデータと控え）にそろえてから始める
      adoptOtherTabChanges()
      const remote = await fetchListsTasksHabits(supabase, userId)
      if (cancelled) return true
      if ('error' in remote) {
        console.error('[sync]', remote.error)
        return false
      }

      const owner = useTaskStore.getState().dataOwner
      if (owner !== null && owner !== userId && owner !== LEGACY_DATA_OWNER) {
        // 別の人のデータが残っている（ログアウトの処理を通らずにアカウントが替わった）。
        // 混ぜてこの人のアカウントに送らないよう、控えを取ってから空にして、この人のデータを取り込む
        backupNow('beforeSignOut')
        useTaskStore.getState().resetLocalData()
      }
      // ログインせずに作ったデータは、前回同期の控え（baseline）と比べると、この人のクラウドの行が
      // 全部「この端末で消された」に見える。初回同期と同じく、両方を残して取り込む
      const baseline = useTaskStore.getState().dataOwner === null ? null : loadBaseline(userId)
      let toPush: SyncSnapshot
      let deletes: Parameters<typeof pushListsTasksHabits>[6] = { lists: [], tasks: [], habits: [], sections: [] }
      const done = (synced: SyncSnapshot) => {
        saveBaseline(userId, baselineFrom(synced))
        useTaskStore.getState().setDataOwner(userId)
      }

      if (!baseline) {
        // この端末で初めての同期
        const local = localSnapshot()
        const decision = decideHydrate(
          remote.lists, remote.tasks, remote.habits, remote.sections,
          local.lists, local.tasks, local.habits, local.sections,
        )
        if (decision.kind === 'use_remote' && local.tasks.length === 0 && local.habits.length === 0) {
          // 手元は初期リストだけ: サーバーをそのまま使う（初期リストを重複して上げない）
          apply({ lists: decision.lists, tasks: decision.tasks, habits: decision.habits, sections: decision.sections })
          done(localSnapshot())
          return true
        }
        if (decision.kind === 'use_remote') {
          // サーバーで置き換えると、送れていなかった手元の変更が消える。両方を残して送る
          const merged = mergeWithoutBaseline(local, remote)
          apply(merged)
          toPush = merged
        } else {
          toPush = local
        }
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
      done(toPush)
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
      } catch (err) {
        // 想定外の例外でも「失敗」として表示し、再送の予約に進む（以前は黙って止まっていた）
        console.error('[sync]', err)
        ok = false
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

    flushSync = async () => {
      clearTimeout(debounce)
      await sync()
      // 実行中の同期に相乗りした場合は、それ（と予約した 1 回）が終わるまで待つ。回線が無いと長引くので 10 秒で諦める
      const until = Date.now() + 10_000
      while (running && Date.now() < until) await new Promise((r) => setTimeout(r, 100))
      return !running && useTaskStore.getState().syncState === 'idle'
    }

    const unsub = useTaskStore.subscribe((state, prev) => {
      if (
        state.tasks === prev.tasks &&
        state.lists === prev.lists &&
        state.habits === prev.habits &&
        state.sections === prev.sections
      )
        return
      if (applyingRef.current || isAdoptingFromOtherTab()) return
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
      flushSync = null
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
