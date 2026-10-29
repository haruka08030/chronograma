/**
 * ⌘Z / ⌘⇧Z の履歴（メモリ上だけ。永続化しない）。ストアを作るときに 1 つ作り、各 slice へ `pushUndo` などを渡す。
 *
 * 1 回の操作で「変わった行の、操作前の姿」だけを覚え、取り消しではその行だけを戻す（`updatedAt` は付け直す）。
 * - 全体の控えを丸ごと戻すと、操作のあとに同期で届いた他の端末の行まで消え、サーバーからも消してしまう
 * - 古い `updatedAt` のまま戻すと、次の同期でサーバー側が勝って取り消しが黙って元に戻る
 * - 戻すのはデータ（と、はじめの案内を閉じたか）だけ。記録中のタイマーと見ている画面（絞り込み・日付など）は ⌘Z で変えない
 */
import type { TaskState, ToastText } from './storeTypes'
import type { StoreGet, StoreSet } from './slices/sliceTypes'
import type { Task } from '../types/task'
import { labelIndex, relabelTasks } from '../lib/labelIds'
import { sameValue } from '../lib/sameValue'

const MAX_UNDO = 50

/** ⌘Z で戻す行の集まり（どれも id を持ち、同期される） */
const COLLECTIONS = ['tasks', 'lists', 'sections', 'habits'] as const
type CollectionKey = (typeof COLLECTIONS)[number]
/** ⌘Z で戻す端末の設定（行ではなく値ごと） */
const SETTINGS = [
  'timeLogTagPresets',
  'logCategoryColors',
  'logLabelTargets',
  'logLabelIds',
  'eventTemplates',
  'timetable',
  'addons',
  'myEventTimes',
  // はじめの案内を × で閉じたのを戻す（自動で終わったときは積まない）
  'onboardingDone',
  'onboardingFinishedOn',
] as const
type SettingKey = (typeof SETTINGS)[number]

type Row = { id: string; updatedAt?: string }
type DataView = Pick<TaskState, CollectionKey | SettingKey>

/** 1 回の操作の記録: 変わった行の操作前の姿（null は「その操作で作られた」）と、変わった設定の操作前の値 */
type UndoEntry = {
  rows: { [K in CollectionKey]?: Map<string, Row | null> }
  settings: Partial<Pick<TaskState, SettingKey>>
}

/**
 * 操作の前の状態。操作が終わってから差分にする（`finalize`）。`session` は続けて足していく回（`asUndoSession`）の鍵。
 * `id` はトーストがどの操作を戻すかを指す番号（`undoOperation`）
 */
type PendingEntry = { id: number; before: DataView; entry: UndoEntry | null; session?: string }

export interface UndoHistory {
  /**
   * 直前の状態を控える。`label` を渡した操作だけ「元に戻す」トーストを出す。
   * 削除は `recentDeletes` 由来のトーストが出るので渡さない
   * （二重に出さないため）。
   */
  pushUndo: (label?: ToastText, typingKey?: string) => number
  /**
   * Enter で増やした空の行がまだ名前を持たないまま、取り消し履歴の一番上が
   * 「その行を作る直前」の控えになっているか。名前付けと作成を 1 手として扱うのに使う
   */
  isUnnamedJustCreated: (id: string) => boolean
  /** いちばん上の控えを捨てる（空のまま捨てた行の作成を、取り消し履歴からも消す） */
  dropLastUndo: () => void
  /** 取り消し・やり直しの履歴を空にする（ログアウト） */
  clear: () => void
  /** 一番上の操作を差分にしておく（他のタブの変更を取り込む前。取り込んだ行をその操作の変更に数えない） */
  settle: () => void
  actions: Pick<TaskState, 'asOneUndo' | 'asUndoSession' | 'undoLastOperation' | 'undoOperation' | 'lastUndoId' | 'redoLastOperation'>
}

function dataView(s: TaskState): DataView {
  // 不変に扱っているので参照だけ持てばよい（複製しない）
  return {
    tasks: s.tasks,
    lists: s.lists,
    sections: s.sections,
    habits: s.habits,
    timeLogTagPresets: s.timeLogTagPresets,
    logCategoryColors: s.logCategoryColors,
    logLabelTargets: s.logLabelTargets,
    logLabelIds: s.logLabelIds,
    eventTemplates: s.eventTemplates,
    timetable: s.timetable,
    addons: s.addons,
    myEventTimes: s.myEventTimes,
    onboardingDone: s.onboardingDone,
    onboardingFinishedOn: s.onboardingFinishedOn,
  }
}

/** 操作の前と後を比べて、変わった行の前の姿だけを残す */
export function diffEntry(before: DataView, after: DataView): UndoEntry {
  const entry: UndoEntry = { rows: {}, settings: {} }
  // ラベルの名前・色を変えたときに端末の中で読み替えただけの行（updatedAt が同じ）は覚えない。
  // 取り消しでは表を戻して読み替え直す（`applyEntry`）。覚えて戻すと、その行を全部書き直して送っていた（#365）
  const relabeled = labelTableChanged(before, after)
  for (const key of COLLECTIONS) {
    const prev = before[key] as Row[]
    const next = after[key] as Row[]
    if (prev === next) continue
    const prevById = new Map(prev.map((r) => [r.id, r]))
    const changed = new Map<string, Row | null>()
    for (const r of next) {
      const old = prevById.get(r.id)
      if (old === undefined) changed.set(r.id, null)
      else if (old !== r && !(relabeled && key === 'tasks' && onlyRelabeled(old as Task, r as Task))) changed.set(r.id, old)
      prevById.delete(r.id)
    }
    // 操作で消えた行（物理的に消す操作）は、前の姿に戻す
    for (const [id, old] of prevById) changed.set(id, old)
    if (changed.size > 0) entry.rows[key] = changed
  }
  for (const key of SETTINGS) {
    if (before[key] !== after[key]) (entry.settings as Record<string, unknown>)[key] = before[key]
  }
  return entry
}

/** 後の操作の記録を前の記録へ足す。同じ行・設定は前の記録の姿（より前の姿）を残す */
function mergeEntry(into: UndoEntry, later: UndoEntry): void {
  for (const key of COLLECTIONS) {
    const rows = later.rows[key]
    if (!rows) continue
    const target = (into.rows[key] ??= new Map())
    for (const [id, old] of rows) if (!target.has(id)) target.set(id, old)
  }
  for (const key of SETTINGS) {
    if (key in later.settings && !(key in into.settings)) (into.settings as Record<string, unknown>)[key] = later.settings[key]
  }
}

function isEmpty(entry: UndoEntry): boolean {
  return Object.keys(entry.rows).length === 0 && Object.keys(entry.settings).length === 0
}

/**
 * 記録を今の状態に当てる。戻す行は `updatedAt` を今にする（同期で負けないように）。
 * 返すのは、当てる前のその行・設定の姿（やり直し／取り消し用の逆の記録）
 */
export function applyEntry(state: DataView, entry: UndoEntry, nowIso: string): { next: Partial<DataView>; inverse: UndoEntry } {
  const next: Partial<DataView> = {}
  const inverse: UndoEntry = { rows: {}, settings: {} }
  for (const key of COLLECTIONS) {
    const changes = entry.rows[key]
    if (!changes) continue
    const current = state[key] as Row[]
    const currentById = new Map(current.map((r) => [r.id, r]))
    const inv = new Map<string, Row | null>()
    for (const id of changes.keys()) inv.set(id, currentById.get(id) ?? null)
    const out: Row[] = []
    for (const r of current) {
      if (!changes.has(r.id)) {
        out.push(r)
        continue
      }
      const target = changes.get(r.id)
      if (target) out.push({ ...target, updatedAt: nowIso })
      // null は「その操作で作られた行」なので取り除く
    }
    for (const [id, target] of changes) {
      if (target && !currentById.has(id)) out.push({ ...target, updatedAt: nowIso })
    }
    ;(next as Record<string, unknown>)[key] = out
    inverse.rows[key] = inv
  }
  for (const key of SETTINGS) {
    if (!(key in entry.settings)) continue
    ;(inverse.settings as Record<string, unknown>)[key] = state[key]
    ;(next as Record<string, unknown>)[key] = entry.settings[key]
  }
  // ラベル表を戻したら、行の名前・色も戻した表で読み替える（updatedAt は変えない）
  const after = { ...state, ...next } as DataView
  if (labelTableChanged(state, after)) next.tasks = relabelTasks(after.tasks, labelIndex(state), labelIndex(after))
  return { next, inverse }
}

/**
 * 一番上ではない操作を戻すときに当てる記録を作る。あとの操作も同じ行を変えていたら、その行は
 * この操作が変えた項目だけを戻す（あとの操作の変更は残す）。あとの操作の記録も、この操作を戻した姿に合わせて書き換える
 * （あとでそちらを戻しても、この操作の変更が戻ってこないように）
 */
export function rebaseEntry(state: DataView, entry: UndoEntry, later: UndoEntry[]): UndoEntry {
  const out: UndoEntry = { rows: {}, settings: { ...entry.settings } }
  for (const key of COLLECTIONS) {
    const changes = entry.rows[key]
    if (!changes) continue
    const currentById = new Map((state[key] as Row[]).map((r) => [r.id, r]))
    const target = new Map<string, Row | null>()
    for (const [id, before] of changes) {
      const touching = later.filter((l) => l.rows[key]?.has(id))
      if (touching.length === 0) {
        target.set(id, before)
        continue
      }
      // この操作の直後の姿（あとの操作のうち最初に触ったものが覚えている前の姿）
      const afterThis = touching[0].rows[key]!.get(id)!
      const current = currentById.get(id)
      if (!before || !afterThis || !current) {
        // 作った・消した行は項目ごとに分けられないので、行ごと戻す
        target.set(id, before)
        for (const l of touching) l.rows[key]!.set(id, before)
        continue
      }
      const revert = (row: Row): Row => {
        const next = { ...row } as Record<string, unknown>
        const keys = new Set([...Object.keys(before), ...Object.keys(afterThis)])
        for (const k of keys) {
          if (k === 'updatedAt') continue
          const b = (before as Record<string, unknown>)[k]
          if (sameValue(b, (afterThis as Record<string, unknown>)[k])) continue
          if (k in before) next[k] = b
          else delete next[k]
        }
        return next as Row
      }
      target.set(id, revert(current))
      for (const l of touching) {
        const v = l.rows[key]!.get(id)
        if (v) l.rows[key]!.set(id, revert(v))
      }
    }
    out.rows[key] = target
  }
  for (const key of SETTINGS) {
    if (!(key in entry.settings)) continue
    for (const l of later) if (key in l.settings) (l.settings as Record<string, unknown>)[key] = entry.settings[key]
  }
  return out
}

const LABEL_SETTINGS = ['timeLogTagPresets', 'logCategoryColors', 'logLabelIds'] as const

function labelTableChanged(a: DataView, b: DataView): boolean {
  return LABEL_SETTINGS.some((k) => a[k] !== b[k])
}

/** ラベルの読み替えだけで変わった行か（名前・色・ラベルの id だけが違い、updatedAt は同じ） */
function onlyRelabeled(a: Task, b: Task): boolean {
  if (a.updatedAt !== b.updatedAt) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (k === 'category' || k === 'tags' || k === 'color' || k === 'labelId') continue
    if (!sameValue((a as unknown as Record<string, unknown>)[k], (b as unknown as Record<string, unknown>)[k])) return false
  }
  return true
}

export function createUndoHistory(set: StoreSet, get: StoreGet): UndoHistory {
  const undoStack: PendingEntry[] = []
  const redoStack: UndoEntry[] = []
  let nextId = 1

  /** 操作が終わったら差分にする（操作は同期的なので、次のマイクロタスクには結果が出ている） */
  const finalize = (p: PendingEntry): UndoEntry => {
    if (!p.entry) p.entry = diffEntry(p.before, dataView(get()))
    return p.entry
  }
  const finalizeTop = () => {
    const top = undoStack[undoStack.length - 1]
    if (top) finalize(top)
  }

  /** `asOneUndo` の中では最初の 1 回だけ積む（複数の操作を 1 回の取り消しで戻す） */
  let undoGroupDepth = 0
  let undoGroupPushed = false
  /** 直前に積んだのが同じ欄の打鍵なら、その欄のキー（`typingKey`） */
  let lastTypingKey: string | null = null

  /**
   * `typingKey` を渡すと、同じ欄を続けて打っている間は 1 回分にまとめる（メモ・場所を 1 文字ずつ戻さない。
   * 1 文字ごとに積むと、履歴の上限でその前の操作が押し出される）
   */
  const pushUndo = (label?: ToastText, typingKey?: string): number => {
    if (undoGroupDepth > 0) {
      if (undoGroupPushed) return undoStack.at(-1)?.id ?? 0
      undoGroupPushed = true
    }
    if (typingKey && typingKey === lastTypingKey && undoStack.length > 0) {
      redoStack.length = 0
      return undoStack.at(-1)!.id
    }
    lastTypingKey = typingKey ?? null
    finalizeTop()
    const pending: PendingEntry = { id: nextId++, before: dataView(get()), entry: null }
    undoStack.push(pending)
    if (undoStack.length > MAX_UNDO) undoStack.shift()
    redoStack.length = 0
    queueMicrotask(() => {
      if (undoGroupDepth === 0) finalize(pending)
    })
    if (label) set({ undoBanner: { text: label, at: Date.now(), undoId: pending.id } })
    return pending.id
  }

  /** 記録を今の状態に当て、やり直しに積む */
  const applyUndo = (entry: UndoEntry) => {
    const { next, inverse } = applyEntry(dataView(get()), entry, new Date().toISOString())
    set(next)
    redoStack.push(inverse)
    if (redoStack.length > MAX_UNDO) redoStack.shift()
    pruneDeletedTasks()
  }

  const isUnnamedJustCreated = (id: string) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task || task.title.trim()) return false
    const top = undoStack[undoStack.length - 1]
    if (!top) return false
    return finalize(top).rows.tasks?.get(id) === null
  }

  /** 取り消し・やり直しで戻した削除は、削除のトーストの一覧からも外す */
  const pruneDeletedTasks = () => {
    const stillDeleted = new Set(
      get()
        .tasks.filter((t) => t.deletedAt)
        .map((t) => t.id),
    )
    const batches = get().recentDeletes
    if (batches.some((b) => b.ids.some((id) => !stillDeleted.has(id)))) {
      set({
        recentDeletes: batches.map((b) => ({ ...b, ids: b.ids.filter((id) => stillDeleted.has(id)) })).filter((b) => b.ids.length > 0),
      })
    }
  }

  return {
    pushUndo,
    isUnnamedJustCreated,
    dropLastUndo: () => {
      undoStack.pop()
    },
    clear: () => {
      lastTypingKey = null
      undoStack.length = 0
      redoStack.length = 0
    },
    settle: finalizeTop,
    actions: {
      asOneUndo: (fn) => {
        if (undoGroupDepth === 0) undoGroupPushed = false
        undoGroupDepth++
        try {
          fn()
        } finally {
          undoGroupDepth--
        }
      },
      asUndoSession: (key, fn) => {
        const top = undoStack[undoStack.length - 1]
        if (undoGroupDepth > 0 || !top || top.session !== key) {
          // 新しい回: ふつうに 1 回分として積み、鍵を付けておく（次に同じ鍵で来たらここへ足す）
          const before = undoStack.length
          get().asOneUndo(fn)
          const pushed = undoStack[undoStack.length - 1]
          if (pushed && (undoStack.length !== before || pushed !== top)) pushed.session = key
          return
        }
        // 同じ回の続き: 中の操作では積まず、前後の差分を一番上の記録に足す。
        // 前後だけを比べるので、押す間に同期で届いた変更は含めない（取り消しで他の端末の変更を戻さない）
        finalize(top)
        const before = dataView(get())
        undoGroupDepth++
        undoGroupPushed = true
        try {
          fn()
        } finally {
          undoGroupDepth--
        }
        const later = diffEntry(before, dataView(get()))
        if (isEmpty(later)) return
        mergeEntry(top.entry!, later)
        lastTypingKey = null
        redoStack.length = 0
      },
      undoLastOperation: () => {
        lastTypingKey = null
        // 何も変えなかった操作（同じ値の保存など）は飛ばす
        while (undoStack.length > 0) {
          const entry = finalize(undoStack.pop()!)
          if (isEmpty(entry)) continue
          applyUndo(entry)
          return true
        }
        return false
      },

      undoOperation: (id) => {
        const i = undoStack.findIndex((p) => p.id === id)
        // もう戻した（⌘Z・履歴の上限で押し出された）操作は何もしない
        if (i < 0) return false
        lastTypingKey = null
        const entry = finalize(undoStack[i])
        const later = undoStack.slice(i + 1).map(finalize)
        undoStack.splice(i, 1)
        if (isEmpty(entry)) return false
        applyUndo(later.length === 0 ? entry : rebaseEntry(dataView(get()), entry, later))
        return true
      },

      lastUndoId: () => undoStack.at(-1)?.id ?? null,

      redoLastOperation: () => {
        lastTypingKey = null
        const entry = redoStack.pop()
        if (!entry) return false
        const { next, inverse } = applyEntry(dataView(get()), entry, new Date().toISOString())
        set(next)
        undoStack.push({ id: nextId++, before: dataView(get()), entry: inverse })
        if (undoStack.length > MAX_UNDO) undoStack.shift()
        pruneDeletedTasks()
        return true
      },
    },
  }
}
