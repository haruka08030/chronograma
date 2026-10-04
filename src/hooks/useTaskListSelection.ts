import { useCallback, useEffect, useRef, useState, type DependencyList, type MouseEvent } from 'react'
import { useHotkey } from './useHotkey'
import { SHORTCUTS, useSelectAllShortcut } from '../lib/shortcuts'
import { isModKey } from '../lib/keyboard'
import type { TaskItemSelection } from '../components/TaskItem'

/** ⌘/ のメニューを行の下に出すのに要る高さ（項目 8 つほど） */
const MENU_ROOM = 340

/**
 * タスクの一覧の選択とキー操作（To-Do 一覧・今日の計画・カレンダーの置き場・検索結果で共通）。
 * - クリック: Shift で範囲、⌘ で 1 件ずつ、選択中なら選択に足す/外す、それ以外は詳細
 * - ⌘A で全部、↑↓ で行を動く（Shift で選択を広げる）、Enter・e で詳細、Space で完了
 * - 選択中（なければ枠の行）: Delete で削除、⌘Enter で完了、⌘/ でメニュー、Esc で解除
 * 削除・完了・詳細は枠が見えている行にだけ効かせる（見えない行を消さない）。対象がなければ次へ回す
 */
export function useTaskListSelection({
  rowIds,
  rangeIds = rowIds,
  openDetail,
  toggleRow,
  removeRows,
  completeRows,
  openMenu,
  resetOn,
}: {
  /** 上から順の、操作できる行（⌘A・↑↓・枠の対象） */
  rowIds: string[]
  /** Shift で範囲を選ぶときの並び（完了済みも含めるなど）。省略すると rowIds */
  rangeIds?: string[]
  openDetail: (id: string) => void
  /** Space・⌘Enter（枠の行だけのとき）: 丸を押したときと同じ完了の付け外し */
  toggleRow: (id: string) => void
  removeRows: (ids: string[]) => void
  completeRows: (ids: string[]) => void
  /** 右クリック・⌘/ のメニューを開く。`above` は (x, y) の上に出す */
  openMenu: (menu: { x: number; y: number; taskIds: string[]; above?: boolean }) => void
  /** これが変わったら選択と枠を外す（開いているリスト・絞り込みなど） */
  resetOn: DependencyList
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const selectedRef = useRef(selected)
  const lastAnchorRef = useRef<string | null>(null)
  /** Shift+↑↓ の起点。Shift なしで動かしたら外す */
  const shiftAnchorRef = useRef<string | null>(null)
  /** ↑↓ で動かす行。枠はキーで動かしている間だけ出す（マウスで押した行も覚えて、そこから続ける） */
  const [cursorId, setCursorId] = useState<string | null>(null)
  const [cursorVisible, setCursorVisible] = useState(false)

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    lastAnchorRef.current = null
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      clearSelection()
      setCursorId(null)
      setCursorVisible(false)
    })
    // 呼ぶ側が決める（開いているリストなど）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetOn)

  const toggleInSelection = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    lastAnchorRef.current = id
  }, [])

  const makeRowClick = useCallback(
    (id: string) => (e: MouseEvent) => {
      goneCursorRef.current = null
      setCursorId(id)
      setCursorVisible(false)
      if (e.shiftKey && lastAnchorRef.current !== null) {
        const ia = rangeIds.indexOf(lastAnchorRef.current)
        const ib = rangeIds.indexOf(id)
        if (ia >= 0 && ib >= 0) {
          const lo = Math.min(ia, ib)
          const hi = Math.max(ia, ib)
          setSelected((prev) => {
            const n = new Set(prev)
            for (let i = lo; i <= hi; i++) n.add(rangeIds[i])
            return n
          })
        }
        lastAnchorRef.current = id
        return
      }
      if (isModKey(e) || selectedRef.current.size > 0) {
        toggleInSelection(id)
        return
      }
      openDetail(id)
      lastAnchorRef.current = id
    },
    [rangeIds, openDetail, toggleInSelection],
  )

  const makeSelection = useCallback(
    (id: string): TaskItemSelection => ({
      selected: selected.has(id),
      reveal: selected.size > 0,
      onToggle: () => toggleInSelection(id),
      cursor: cursorVisible && cursorId === id,
      onContextMenu: (e) => {
        setCursorId(id)
        setCursorVisible(false)
        // 選択中の行なら選択中のすべてに、それ以外はその行だけに効かせる
        openMenu({ x: e.clientX, y: e.clientY, taskIds: selected.has(id) && selected.size > 1 ? [...selected] : [id] })
      },
    }),
    [selected, toggleInSelection, cursorVisible, cursorId, openMenu],
  )

  // ⌘A: 操作できる行をすべて選ぶ
  useSelectAllShortcut(() => {
    if (rowIds.length === 0) return false
    setSelected(new Set(rowIds))
    lastAnchorRef.current = rowIds[rowIds.length - 1]
    return true
  })

  const completeSelected = useCallback(() => {
    completeRows([...selectedRef.current])
    clearSelection()
  }, [completeRows, clearSelection])
  const removeSelected = useCallback(() => {
    if (selectedRef.current.size === 0) return
    removeRows([...selectedRef.current])
    clearSelection()
  }, [removeRows, clearSelection])

  // 完了・削除などで枠の行が一覧から消えたら、同じ位置の行（末尾なら前の行）へ移す
  const cursorIndexRef = useRef(-1)
  /** 枠のあった行が消えたとき、その行。取り消しで戻ってきたら枠を戻す（次の Delete が別の行に効かないように） */
  const goneCursorRef = useRef<string | null>(null)
  useEffect(() => {
    const gone = goneCursorRef.current
    if (gone && rowIds.includes(gone)) {
      goneCursorRef.current = null
      queueMicrotask(() => setCursorId(gone))
      return
    }
    if (!cursorId) return
    const i = rowIds.indexOf(cursorId)
    if (i >= 0) {
      cursorIndexRef.current = i
      return
    }
    goneCursorRef.current = cursorId
    const fallback = rowIds[Math.min(cursorIndexRef.current, rowIds.length - 1)] ?? null
    queueMicrotask(() => setCursorId(fallback))
  }, [cursorId, rowIds])

  const cursorRow = () => (cursorId && rowIds.includes(cursorId) ? cursorId : null)
  const targetRow = () => (cursorVisible ? cursorRow() : null)
  const onButton = (e: KeyboardEvent) =>
    e.target instanceof HTMLButtonElement || (e.target instanceof Element && e.target.getAttribute('role') === 'button')

  useHotkey(SHORTCUTS.moveRow.hotkeys, (e) => {
    if (rowIds.length === 0) return false
    const cursor = cursorRow()
    const down = e.key === 'ArrowDown'
    const i = cursor ? rowIds.indexOf(cursor) : -1
    const next = i < 0 ? (down ? rowIds[0] : rowIds[rowIds.length - 1]) : rowIds[Math.min(rowIds.length - 1, Math.max(0, i + (down ? 1 : -1)))]
    goneCursorRef.current = null
    if (e.shiftKey) {
      // 起点（最初に Shift を押した行）から枠までを選ぶ。戻れば選択も縮む（OS・Gmail と同じ）
      const anchor = shiftAnchorRef.current ?? cursor ?? next
      shiftAnchorRef.current = anchor
      const a = rowIds.indexOf(anchor)
      const b = rowIds.indexOf(next)
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      setSelected(new Set(rowIds.slice(lo, hi + 1)))
      lastAnchorRef.current = anchor
    } else {
      shiftAnchorRef.current = null
    }
    setCursorId(next)
    setCursorVisible(true)
  })
  useHotkey(SHORTCUTS.close.hotkeys, () => {
    if (selectedRef.current.size > 0) clearSelection()
    else if (targetRow()) setCursorVisible(false)
    else return false
  })
  useHotkey(SHORTCUTS.delete.hotkeys, () => {
    const target = targetRow()
    if (selectedRef.current.size > 0) removeSelected()
    else if (target) removeRows([target])
    else return false
  })
  useHotkey(SHORTCUTS.completeSelected.hotkeys, () => {
    const target = targetRow()
    if (selectedRef.current.size > 0) completeSelected()
    else if (target) toggleRow(target)
    else return false
  })
  useHotkey(SHORTCUTS.openMenu.hotkeys, () => {
    // ⌘/（Notion と同じ）: 選択中（なければ枠の行）のメニューを、その行の下に開く
    const target = targetRow()
    const ids = selectedRef.current.size > 0 ? [...selectedRef.current] : target ? [target] : []
    if (ids.length === 0) return false
    const anchor = target && ids.includes(target) ? target : ids[0]
    const row = document.querySelector(`[data-task-row="${anchor}"]`)?.getBoundingClientRect()
    if (!row) return false
    // 下に入らないときは行の上に出す（下にずらして重ねると、対象の行が隠れる）
    const above = row.bottom + MENU_ROOM > window.innerHeight
    openMenu({ x: row.left + 48, y: above ? row.top - 4 : row.bottom + 4, taskIds: ids, above })
  })
  // e は予定カードと同じ「詳細を開く」。ボタンの上の Enter はボタンのほうを押す
  useHotkey([...SHORTCUTS.openRow.hotkeys, ...SHORTCUTS.edit.hotkeys], (e) => {
    const target = targetRow()
    if (!target || (e.key === 'Enter' && onButton(e))) return false
    openDetail(target)
  })
  useHotkey(SHORTCUTS.completeRow.hotkeys, (e) => {
    const target = targetRow()
    if (!target || onButton(e)) return false
    toggleRow(target)
  })

  return { selected, clearSelection, makeRowClick, makeSelection, completeSelected, removeSelected }
}
