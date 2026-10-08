import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getSupabase } from '../lib/supabase'
import {
  decideHydrate,
  fetchExtraTimeZones,
  fetchLogLabels,
  fetchMinSyncVersion,
  pushExtraTimeZones,
  pushListsTasksHabits,
  pushLogLabels,
} from '../lib/supabaseData'
import { loadSettingSyncedAt, runSettingSync, type SettingKey, type SettingSyncDeps } from '../lib/settingSync'
import { clearPreviousAccount } from '../lib/accountBoundary'
import { requestPersistentStorage } from '../lib/persistentStorage'
import { SYNC_PROTOCOL_VERSION, isAppOutdatedError } from '../lib/syncVersion'
import { afterPush, createPullState, missingWithoutTombstone, pullRemote } from '../lib/syncPull'
import {
  baselineFrom,
  clearBaseline,
  hasOtherUsersBaseline,
  loadBaseline,
  mergeSnapshots,
  mergeWithoutBaseline,
  withoutDuplicateDefaults,
  saveBaseline,
  syncedSnapshot,
  withServerStamps,
  adoptServerStamps,
  type SyncSnapshot,
} from '../lib/syncMerge'
import { useTaskStore, INBOX_LIST_ID, LEGACY_DATA_OWNER, adoptOtherTabChanges, isAdoptingFromOtherTab } from '../store/taskStore'
import { backupNow } from './useAutoBackup'
import { asIncomingChange } from '../lib/changeOrigin'
import { reportSyncError } from '../lib/errorReport'
import { planLabelSync } from '../lib/labelSync'
import { planExtraTimeZoneSync } from '../lib/extraTimeZones'
import { hasExistingData } from '../lib/onboarding'

const DEBOUNCE_MS = 1800
/** 他端末の変更を取り込む間隔（タブが見えている間だけ） */
const POLL_MS = 60_000
/** 取得した後に他の端末が変えていて断られた行を、続けて取り直して送る回数（それを超えたら次の同期で） */
const MAX_STALE_RETRIES = 3

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

/**
 * ラベル表・他のタイムゾーンの手元の変更を送れているか。送れたら手元の時刻はサーバーの版と同じになる
 * （送れなかったときは記録するだけでタスクの同期は止めないので、ログアウトの前にここで確かめる）
 */
function settingsSent(userId: string): boolean {
  const s = useTaskStore.getState()
  const local: [SettingKey, string | null][] = [
    ['labels', s.logLabelsUpdatedAt],
    ['zones', s.extraTimeZonesUpdatedAt],
  ]
  return local.every(([key, at]) => at === null || at === loadSettingSyncedAt(userId, key))
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
      useTaskStore.getState().setSyncRejected([])
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
    /** この sync() の中で、断られた行のために取り直した回数 */
    let staleRetries = 0
    /** 直前の送信が行数の上限（`row_limit_exceeded`）で断られたか */
    let limitHit = false
    /** アプリの版が同期の下限より古い（送らない） */
    let outdated = false
    /** 前回取得したサーバーの内容と、差分の取得の目印（このログインの間だけ。最初の同期は全部を取る） */
    const pull = createPullState()

    const apply = (next: SyncSnapshot) => {
      const cur = useTaskStore.getState()
      if (cur.lists === next.lists && cur.tasks === next.tasks && cur.habits === next.habits && cur.sections === next.sections) return
      // 同期で手元のタスクが減るときは、減る前を控えておく（他端末での削除でも、取り違えでも戻せるように）
      if (cur.tasks !== next.tasks) {
        const nextIds = new Set(next.tasks.map((t) => t.id))
        if (cur.tasks.some((t) => !nextIds.has(t.id))) backupNow('beforeSync')
      }
      const listIds = new Set(next.lists.map((l) => l.id))
      const sel = cur.selectedListId
      applyingRef.current = true
      try {
        asIncomingChange(() =>
          useTaskStore.setState({
            ...next,
            selectedListId: sel && !listIds.has(sel) ? INBOX_LIST_ID : sel,
          }),
        )
      } finally {
        applyingRef.current = false
      }
    }

    const syncSetting = <
      R extends { updatedAt: string },
      A extends { updatedAt: string },
      P extends { updatedAt: string; base: string | null },
    >(
      s: SettingSyncDeps<R, A, P>,
    ) =>
      runSettingSync(userId, s, {
        isCancelled: () => cancelled,
        clockOffsetMs: loadBaseline(userId)?.clockOffsetMs ?? 0,
        maxStaleRetries: MAX_STALE_RETRIES,
      })

    /** ラベル表（名前・並び・色） */
    const syncLabels = () =>
      syncSetting({
        key: 'labels',
        fetch: () => fetchLogLabels(supabase, userId),
        plan: (remote, syncedAt, offset) => {
          const st = useTaskStore.getState()
          return planLabelSync(
            { presets: st.timeLogTagPresets, colors: st.logCategoryColors, updatedAt: st.logLabelsUpdatedAt, syncedAt },
            remote,
            undefined,
            offset,
          )
        },
        localUpdatedAt: () => useTaskStore.getState().logLabelsUpdatedAt,
        applyLocal: ({ presets, colors, updatedAt }) =>
          asIncomingChange(() =>
            useTaskStore.setState({ timeLogTagPresets: presets, logCategoryColors: colors, logLabelsUpdatedAt: updatedAt }),
          ),
        setLocalUpdatedAt: (at) => asIncomingChange(() => useTaskStore.setState({ logLabelsUpdatedAt: at })),
        push: (p) => pushLogLabels(supabase, userId, p, p.base),
      })

    /** 他のタイムゾーン（並び・名前） */
    const syncExtraTimeZones = () =>
      syncSetting({
        key: 'zones',
        fetch: () => fetchExtraTimeZones(supabase, userId),
        plan: (remote, syncedAt, offset) => {
          const st = useTaskStore.getState()
          return planExtraTimeZoneSync(
            { zones: st.extraTimeZones, updatedAt: st.extraTimeZonesUpdatedAt, syncedAt },
            remote,
            undefined,
            offset,
          )
        },
        localUpdatedAt: () => useTaskStore.getState().extraTimeZonesUpdatedAt,
        applyLocal: ({ zones, updatedAt }) =>
          asIncomingChange(() => useTaskStore.setState({ extraTimeZones: zones, extraTimeZonesUpdatedAt: updatedAt })),
        setLocalUpdatedAt: (at) => asIncomingChange(() => useTaskStore.setState({ extraTimeZonesUpdatedAt: at })),
        push: (p) => pushExtraTimeZones(supabase, userId, p, p.base),
      })

    /** ラベル表と他のタイムゾーン（タスクとは別に、まとめて 1 つの値として合わせる設定） */
    const syncSettings = async () => {
      await syncLabels()
      await syncExtraTimeZones()
    }

    /** 1 往復ぶん。成功したか（= これ以上送るものが無いか）を返す */
    const syncOnce = (): Promise<boolean> => withSyncLock(userId, syncOnceLocked)

    const syncOnceLocked = async (): Promise<boolean> => {
      // 待っている間に他のタブが同期して保存した内容（手元のデータと控え）にそろえてから始める
      adoptOtherTabChanges()
      // 版の下限より古いアプリは送らない（端末の時計で書き勝たないように）。読み込み直しを促す
      const min = await fetchMinSyncVersion(supabase)
      if (cancelled) return true
      if (typeof min !== 'number') {
        console.error('[sync]', min.error)
        reportSyncError('min-version', min.error)
        return false
      }
      if (min > SYNC_PROTOCOL_VERSION) {
        outdated = true
        return false
      }
      // 差分を取る（変わった行と消えた行の印だけ）。この端末でこの人として初めての同期は全部を取る
      const known = useTaskStore.getState().dataOwner !== null ? loadBaseline(userId) : null
      const pulled = await pullRemote(supabase, userId, pull, { full: !known })
      if (cancelled) return true
      if ('error' in pulled) {
        console.error('[sync]', pulled.error)
        reportSyncError('pull', pulled.error)
        return false
      }
      let remote = pulled.snapshot
      if (!pulled.full && known) {
        // 差分で取りこぼしがあると、手元の行を「他の端末で消された」と読んでしまう。消えた印の無い行があれば全部を取り直す
        const missing = missingWithoutTombstone(localSnapshot(), known, remote, pulled.tombstoned)
        if (missing.length > 0) {
          console.warn('[sync] delta missed rows, fetching everything', missing.slice(0, 5))
          const again = await pullRemote(supabase, userId, pull, { full: true })
          if (cancelled) return true
          if ('error' in again) {
            console.error('[sync]', again.error)
            reportSyncError('pull', again.error, { full: true })
            return false
          }
          remote = again.snapshot
        }
      }

      const owner = useTaskStore.getState().dataOwner
      // 持ち主の記録が無い古い版のデータ（*legacy*）は、この人として同期したことがあればこの人のもの。
      // この人としては無く、ほかの人として同期した控えがあれば、その人のもの（混ぜずに外す）
      const legacyOfOther = owner === LEGACY_DATA_OWNER && !loadBaseline(userId) && hasOtherUsersBaseline(userId)
      if ((owner !== null && owner !== userId && owner !== LEGACY_DATA_OWNER) || legacyOfOther) {
        // 別の人のデータが残っている（ログアウトの処理を通らずにアカウントが替わった）。
        // 混ぜてこの人のアカウントに送らないよう、控えを取ってから空にして、この人のデータを取り込む
        // 前の人の通知の購読もここで外す（ログアウトの道しか外していなかった）
        clearPreviousAccount()
      }
      // ログインせずに作ったデータは、前回同期の控え（baseline）と比べると、この人のクラウドの行が
      // 全部「この端末で消された」に見える。初回同期と同じく、両方を残して取り込む
      const baseline = useTaskStore.getState().dataOwner === null ? null : loadBaseline(userId)
      let toPush: SyncSnapshot
      let deletes: Parameters<typeof pushListsTasksHabits>[6] = { lists: [], tasks: [], habits: [], sections: [] }
      const done = (synced: SyncSnapshot, clockOffsetMs?: number) => {
        // 本体を保存できていない間（容量不足）は控えも書かずに消す。再読み込みで本体だけ古い中身に戻ると、
        // 控えにだけある行（他の端末から取り込んだ行）を「この端末で消した」と読み、サーバーから消していた
        if (useTaskStore.getState().storageFull) {
          clearBaseline(userId)
          reportSyncError('baseline', 'skipped while local storage is full')
        } else if (
          // 時計のずれは測れたときだけ替える（何も送らなかった同期では前の値のまま）
          !saveBaseline(userId, { ...baselineFrom(synced), clockOffsetMs: clockOffsetMs ?? baseline?.clockOffsetMs })
        ) {
          reportSyncError('baseline', 'could not save the baseline')
        }
        useTaskStore.getState().setDataOwner(userId)
        void requestPersistentStorage()
      }

      if (!baseline) {
        // この端末で初めての同期
        // アカウントにもうデータがある人（別の端末で使っていた人）には、はじめの案内を出さない
        if (hasExistingData(remote) && !useTaskStore.getState().onboardingDone) useTaskStore.getState().finishOnboarding()
        const local = withoutDuplicateDefaults(localSnapshot(), remote)
        const decision = decideHydrate(
          remote.lists,
          remote.tasks,
          remote.habits,
          remote.sections,
          local.lists,
          local.tasks,
          local.habits,
          local.sections,
        )
        const remoteListIds = new Set(remote.lists.map((l) => l.id))
        const onlyInitial =
          local.tasks.length === 0 &&
          local.habits.length === 0 &&
          local.sections.length === 0 &&
          local.lists.every((l) => l.id === INBOX_LIST_ID || remoteListIds.has(l.id))
        if (decision.kind === 'use_remote' && onlyInitial) {
          // 手元は初期リストだけ: サーバーをそのまま使う（初期リストを重複して上げない）。
          // 以前はタスクが無ければこちらに来て、手元で作った空のリストやセクションが消えていた
          apply({ lists: decision.lists, tasks: decision.tasks, habits: decision.habits, sections: decision.sections })
          done(localSnapshot())
          useTaskStore.getState().setSyncRejected([])
          await syncSettings()
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
        const same = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i])
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

      const res = await pushListsTasksHabits(supabase, userId, toPush.lists, toPush.tasks, toPush.habits, toPush.sections, deletes, remote)
      if (cancelled) return true
      if (res.error) {
        console.error('[sync]', res.error)
        limitHit = res.error.includes('row_limit_exceeded')
        if (isAppOutdatedError(res.error)) outdated = true
        reportSyncError('push', res.error)
        // 途中まで届いた行・消えた行がある。次は全部を取り直す
        pull.forceFull = true
        return false
      }
      // 拒否された行があっても、ほかの行は届いている。拒否された行は控えに入れず、利用者に見せる
      if (res.rejected.length > 0) {
        console.warn('[sync] rejected rows', res.rejected)
        // 行の中身（id）は送らない。どの表で何と断られたかだけ
        const first = res.rejected[0]
        reportSyncError('rejected', `${first.table} ${first.op}: ${first.message}`, {
          count: res.rejected.length,
          rows: res.rejected.slice(0, 5).map((r) => ({ table: r.table, op: r.op, message: r.message })),
        })
      }
      // 届いた行はサーバーが付けた時刻にそろえる（手元も、送っている間に編集していない行だけ）
      const stamped = withServerStamps(toPush, res.written)
      if (stamped !== toPush) apply(adoptServerStamps(localSnapshot(), toPush, stamped))
      // 取得した後に他の端末が変えていた行は届いていない。控えは取得した版にして（次の同期で項目ごとに合わせる）、すぐ取り直す
      done(syncedSnapshot(stamped, remote, [...res.rejected, ...res.stale]), res.clockOffsetMs)
      // 送れた行・消せた行を前回取得したサーバーの内容に入れる。断られた行があれば次は全部を取る
      afterPush(pull, stamped, deletes, res)
      if (res.stale.length > 0 && staleRetries < MAX_STALE_RETRIES) {
        staleRetries++
        rerun = true
      } else if (res.stale.length > 0) {
        // 取り直しても毎回断られる（合わせ方の食い違いで回り続けている）
        reportSyncError('stale', `still stale after ${MAX_STALE_RETRIES} retries`, {
          count: res.stale.length,
          tables: [...new Set(res.stale.map((r) => r.table))],
        })
      }
      await syncSettings()
      const prevRejected = useTaskStore.getState().syncRejected
      const key = (rows: typeof res.rejected) => rows.map((r) => `${r.op}:${r.table}:${r.id}`).join('|')
      if (key(prevRejected) !== key(res.rejected)) useTaskStore.getState().setSyncRejected(res.rejected)
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
      staleRetries = 0
      limitHit = false
      outdated = false
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
        reportSyncError('unexpected', err)
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
      setSyncState(outdated ? 'outdated' : limitHit ? 'limit' : 'error')
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
      // 拒否された行は手元にしか無いので、送れていない扱いにする（ログアウトの前に確かめる）
      const s = useTaskStore.getState()
      return !running && s.syncState === 'idle' && s.syncRejected.length === 0 && settingsSent(userId)
    }

    const unsub = useTaskStore.subscribe((state, prev) => {
      if (
        state.tasks === prev.tasks &&
        state.lists === prev.lists &&
        state.habits === prev.habits &&
        state.sections === prev.sections &&
        state.timeLogTagPresets === prev.timeLogTagPresets &&
        state.logCategoryColors === prev.logCategoryColors &&
        state.extraTimeZones === prev.extraTimeZones
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
