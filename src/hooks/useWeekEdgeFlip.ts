import { useState, useRef, useEffect, type RefObject } from 'react'
import type { useTimelineDrag } from '../lib/useTimelineDrag'

/** ドラッグ中にこの幅まで左右の端へ寄せると前後をめくる */
const EDGE_FLIP_PX = 16
const EDGE_FLIP_DELAY_MS = 600
const EDGE_FLIP_REPEAT_MS = 1000

/**
 * 週タイムラインでドラッグ中に左右の端で止めたとき、前後の週へめくる。
 * `edgeDirAt` で今の端の向きを出して `setEdgeDir` に入れる。`activeEdge` はめくり待ちの向き（端の案内の表示用）
 */
export function useWeekEdgeFlip({
  onNavigateWeek,
  gridDays,
  gridRef,
  scrollRef,
  keepScrollOnFlipRef,
  timelineDrag,
  taskDragActive,
}: {
  onNavigateWeek?: (dir: -1 | 1) => void
  gridDays: Date[]
  gridRef: RefObject<HTMLDivElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
  keepScrollOnFlipRef: RefObject<boolean>
  timelineDrag: ReturnType<typeof useTimelineDrag>
  /** ToDo 一覧などから ToDo をドラッグ中か */
  taskDragActive: boolean
}) {
  const [edgeDir, setEdgeDir] = useState<-1 | 1 | null>(null)
  const edgeDirAt = (clientX: number, clientY: number): -1 | 1 | null => {
    if (!onNavigateWeek || !gridRef.current || !scrollRef.current) return null
    const area = scrollRef.current.getBoundingClientRect()
    if (clientY < area.top || clientY > area.bottom) return null
    const grid = gridRef.current.getBoundingClientRect()
    if (clientX < grid.left + EDGE_FLIP_PX) return -1
    if (clientX > grid.right - EDGE_FLIP_PX) return 1
    return null
  }
  const flipWeekRef = useRef<(dir: -1 | 1) => void>(() => {})
  flipWeekRef.current = (dir) => {
    keepScrollOnFlipRef.current = true
    onNavigateWeek?.(dir)
    // 表示している日数ぶん（週は 7 日、スマホの 1 日表示は 1 日）めくる
    timelineDrag.shiftMoveDragDate(dir * gridDays.length)
  }
  const pointerMoving = timelineDrag.drag?.kind === 'move'
  const activeEdge = edgeDir && (taskDragActive || pointerMoving) ? edgeDir : null
  useEffect(() => {
    if (!activeEdge) return
    let id = window.setTimeout(function tick() {
      flipWeekRef.current(activeEdge)
      id = window.setTimeout(tick, EDGE_FLIP_REPEAT_MS)
    }, EDGE_FLIP_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [activeEdge])

  return { activeEdge, setEdgeDir, edgeDirAt }
}
