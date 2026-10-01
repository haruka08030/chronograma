import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { HOUR_HEIGHT, timeToY, yToTime, SNAP_MINUTES, timeToMinutes } from './timeGrid'
import { dragBlockDurationMinutes } from './taskTimeRange'

const RESIZE_EDGE_PX = 8
const MIN_BLOCK_MINUTES = SNAP_MINUTES
const CREATE_MIN_PX = 5
const CREATE_MIN_COARSE_PX = 20
const TAP_SLOP_PX = 10

function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

export interface CreateDrag {
  kind: 'create'
  dateKey: string
  startY: number
  currentY: number
  intent: CreateIntent
  /** これより下（後の時刻）には伸ばせない（記録は今より先に作れない） */
  maxY?: number
}

export interface MoveDrag {
  kind: 'move'
  taskId: string
  origDateKey: string
  origStartTime: string
  origEndTime: string
  dateKey: string
  offsetY: number
  currentY: number
  /** 移動後も維持するブロック長（分）。省略時は壁時計の差（下限 SNAP） */
  blockDurationMinutes: number
}

export interface ResizeDrag {
  kind: 'resize'
  taskId: string
  dateKey: string
  edge: 'top' | 'bottom'
  origStartTime: string
  origEndTime: string
  currentY: number
}

export type DragState = CreateDrag | MoveDrag | ResizeDrag

export type CreateIntent = 'schedule' | 'log'

export interface CreatePopup {
  dateKey: string
  startTime: string
  endTime: string
  /** 予定 vs ログ: 左=schedule 右=log */
  intent?: CreateIntent
}

export interface DragPreview {
  kind: 'create' | 'move' | 'resize'
  dateKey: string
  taskId?: string
  top: number
  height: number
  label: string
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface UseTimelineDragOptions {
  getRelativeY: (clientY: number, dateKey: string) => number
  getDateKeyFromX?: (clientX: number) => string | null
  onMoveDone: (taskId: string, dateKey: string, startTime: string, endTime: string) => void
  onResizeDone: (taskId: string, startTime: string, endTime: string) => void
  /** ドラッグ作成時のデフォルト（週カレンダーは schedule） */
  defaultCreateIntent?: CreateIntent
  /** グリッドが pointer capture するため click が届かない環境向け: 移動・リサイズなしの指離し時 */
  onBlockTap?: (taskId: string) => void
  /**
   * 空き時間をクリック（ドラッグなし）したときに作る予定の長さ（分）。Google カレンダーと同じく
   * クリックだけで作成カードを出す。未指定なら従来どおりクリックでは何もしない（予定 vs ログなど）
   */
  clickCreateMinutes?: number
}

export function useTimelineDrag(options: UseTimelineDragOptions) {
  const { getRelativeY, getDateKeyFromX, onMoveDone, onResizeDone, defaultCreateIntent = 'schedule', onBlockTap, clickCreateMinutes } = options
  const [drag, setDrag] = useState<DragState | null>(null)
  const [popup, setPopup] = useState<CreatePopup | null>(null)
  const didMoveRef = useRef(false)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  /** タッチ: ブロック上はドラッグせずタップで詳細を開く（スクロールと競合しない） */
  const onBlockTapRef = useRef(onBlockTap)
  useEffect(() => {
    onBlockTapRef.current = onBlockTap
  }, [onBlockTap])

  const handleCreatePointerDown = useCallback((e: React.PointerEvent, dateKey: string, intent: CreateIntent = defaultCreateIntent, maxY?: number) => {
    if (popup) return
    if (maxY !== undefined && getRelativeY(e.clientY, dateKey) >= maxY) return
    // タッチでは capture を遅らせず、十分なドラッグ幅が出るまで作成扱いにしない（スクロール優先）
    const coarse = isCoarsePointer()
    if (!coarse) e.currentTarget.setPointerCapture(e.pointerId)
    const y = getRelativeY(e.clientY, dateKey)
    didMoveRef.current = false
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    setDrag({ kind: 'create', dateKey, startY: y, currentY: y, intent, maxY })
  }, [getRelativeY, popup, defaultCreateIntent])

  const handleBlockPointerDown = useCallback((
    e: React.PointerEvent,
    taskId: string,
    dateKey: string,
    startTime: string,
    endTime: string,
    gridEl: HTMLElement | null,
    blockDurationSource?: {
      startTime: string
      endTime: string
      isTimeLog?: boolean
      dueDate?: string | null
      endDate?: string | null
    },
  ) => {
    if (popup) return

    // タッチ主体: 移動・リサイズは詳細モーダルで行い、ここはタップのみ（スクロールと共存）
    if (isCoarsePointer()) {
      e.stopPropagation()
      const startX = e.clientX
      const startY = e.clientY
      const id = taskId
      const finish = (ev: PointerEvent) => {
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
        if (Math.abs(ev.clientX - startX) <= TAP_SLOP_PX && Math.abs(ev.clientY - startY) <= TAP_SLOP_PX) {
          onBlockTapRef.current?.(id)
        }
      }
      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', finish)
      return
    }

    const blockEl = e.currentTarget as HTMLElement
    const rect = blockEl.getBoundingClientRect()
    const localY = e.clientY - rect.top
    const blockHeight = rect.height

    didMoveRef.current = false
    pointerStartRef.current = { x: e.clientX, y: e.clientY }

    if (gridEl) gridEl.setPointerCapture(e.pointerId)

    if (localY <= RESIZE_EDGE_PX) {
      const y = getRelativeY(e.clientY, dateKey)
      setDrag({ kind: 'resize', taskId, dateKey, edge: 'top', origStartTime: startTime, origEndTime: endTime, currentY: y })
    } else if (localY >= blockHeight - RESIZE_EDGE_PX) {
      const y = getRelativeY(e.clientY, dateKey)
      setDrag({ kind: 'resize', taskId, dateKey, edge: 'bottom', origStartTime: startTime, origEndTime: endTime, currentY: y })
    } else {
      const offsetY = e.clientY - rect.top
      const y = getRelativeY(e.clientY, dateKey)
      const blockDurationMinutes = blockDurationSource
        ? dragBlockDurationMinutes(blockDurationSource)
        : dragBlockDurationMinutes({ startTime, endTime })
      setDrag({
        kind: 'move',
        taskId,
        origDateKey: dateKey,
        origStartTime: startTime,
        origEndTime: endTime,
        dateKey,
        offsetY,
        currentY: y,
        blockDurationMinutes,
      })
    }
  }, [getRelativeY, popup])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag) return
    const p0 = pointerStartRef.current
    if (p0 && !didMoveRef.current) {
      const dx = Math.abs(e.clientX - p0.x)
      const dy = Math.abs(e.clientY - p0.y)
      const threshold = isCoarsePointer() ? CREATE_MIN_COARSE_PX : 6
      if (dx > threshold || dy > threshold) {
        didMoveRef.current = true
        if (drag.kind === 'create' && isCoarsePointer() && e.currentTarget instanceof HTMLElement) {
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* already captured or unsupported */
          }
        }
      }
    }
    if (drag.kind === 'create' && isCoarsePointer() && !didMoveRef.current) return

    const dateKey = (getDateKeyFromX ? getDateKeyFromX(e.clientX) : null) ?? drag.dateKey
    const y = getRelativeY(e.clientY, dateKey)

    if (drag.kind === 'create') {
      setDrag((prev) => prev && prev.kind === 'create' ? { ...prev, currentY: prev.maxY !== undefined ? Math.min(y, prev.maxY) : y, dateKey } : prev)
    } else if (drag.kind === 'move') {
      setDrag((prev) => prev && prev.kind === 'move' ? { ...prev, currentY: y, dateKey } : prev)
    } else {
      setDrag((prev) => prev && prev.kind === 'resize' ? { ...prev, currentY: y } : prev)
    }
  }, [drag, getRelativeY, getDateKeyFromX])

  const handlePointerUp = useCallback(() => {
    if (!drag) return
    if (drag.kind === 'create') {
      const minY = Math.min(drag.startY, drag.currentY)
      const maxY = Math.max(drag.startY, drag.currentY)
      const minPx = isCoarsePointer() ? CREATE_MIN_COARSE_PX : CREATE_MIN_PX
      if (maxY - minY < minPx || (isCoarsePointer() && !didMoveRef.current)) {
        setDrag(null)
        pointerStartRef.current = null
        if (clickCreateMinutes && !isCoarsePointer() && !didMoveRef.current) {
          // クリックした 30 分枠の頭から既定の長さで作成カードを出す
          const startMin = Math.floor(timeToMinutes(yToTime(minY)) / 30) * 30
          const limitMin = drag.maxY !== undefined ? Math.floor((drag.maxY / HOUR_HEIGHT) * 60) : 24 * 60 - SNAP_MINUTES
          const endMin = Math.min(startMin + clickCreateMinutes, 24 * 60 - SNAP_MINUTES, limitMin)
          if (endMin - startMin < SNAP_MINUTES) return
          setPopup({ dateKey: drag.dateKey, startTime: minutesToTime(startMin), endTime: minutesToTime(endMin), intent: drag.intent })
        }
        return
      }
      if (drag.maxY !== undefined) {
        // 15 分に丸めると今より先にはみ出すので、終わりは「今」で止める
        const limitMin = Math.floor((drag.maxY / HOUR_HEIGHT) * 60)
        const startMin = timeToMinutes(yToTime(minY))
        const endMin = Math.min(timeToMinutes(yToTime(maxY)), limitMin)
        if (endMin - startMin >= 5) {
          setPopup({ dateKey: drag.dateKey, startTime: minutesToTime(startMin), endTime: minutesToTime(endMin), intent: drag.intent })
        }
      } else {
        setPopup({ dateKey: drag.dateKey, startTime: yToTime(minY), endTime: yToTime(maxY), intent: drag.intent })
      }
    } else if (drag.kind === 'move') {
      if (didMoveRef.current) {
        const durationMin = drag.blockDurationMinutes
        const newStartY = drag.currentY - drag.offsetY
        const newStart = yToTime(Math.max(0, newStartY))
        const newStartMin = timeToMinutes(newStart)
        const M = 24 * 60
        const endWallMin = (newStartMin + durationMin) % M
        onMoveDone(drag.taskId, drag.dateKey, newStart, minutesToTime(endWallMin))
      } else {
        onBlockTap?.(drag.taskId)
      }
    } else {
      if (didMoveRef.current) {
        const newTime = yToTime(drag.currentY)
        const newMin = timeToMinutes(newTime)
        if (drag.edge === 'top') {
          const endMin = timeToMinutes(drag.origEndTime)
          const clampedStart = Math.min(newMin, endMin - MIN_BLOCK_MINUTES)
          onResizeDone(drag.taskId, minutesToTime(Math.max(0, clampedStart)), drag.origEndTime)
        } else {
          const startMin = timeToMinutes(drag.origStartTime)
          const clampedEnd = Math.max(newMin, startMin + MIN_BLOCK_MINUTES)
          onResizeDone(drag.taskId, drag.origStartTime, minutesToTime(Math.min(clampedEnd, 24 * 60)))
        }
      } else {
        onBlockTap?.(drag.taskId)
      }
    }
    setDrag(null)
    pointerStartRef.current = null
  }, [drag, onMoveDone, onResizeDone, onBlockTap, clickCreateMinutes])

  const dismissPopup = useCallback(() => { setPopup(null) }, [])

  const dragPreview = useMemo((): DragPreview | null => {
    if (!drag) return null
    if (drag.kind === 'create') {
      const minY = Math.min(drag.startY, drag.currentY)
      const maxY = Math.max(drag.startY, drag.currentY)
      if (maxY - minY < 2) return null
      return { kind: 'create', dateKey: drag.dateKey, top: minY, height: maxY - minY, label: `${yToTime(minY)} – ${yToTime(maxY)}` }
    } else if (drag.kind === 'move') {
      // eslint-disable-next-line react-hooks/refs -- preview must match pointer session gate
      if (!didMoveRef.current) return null
      const durationMin = drag.blockDurationMinutes
      const newTop = Math.max(0, drag.currentY - drag.offsetY)
      const newStart = yToTime(newTop)
      const newStartMin = timeToMinutes(newStart)
      const M = 24 * 60
      const endWallMin = (newStartMin + durationMin) % M
      const visibleMin = Math.min(durationMin, M - newStartMin)
      const height = Math.max((visibleMin / 60) * HOUR_HEIGHT, HOUR_HEIGHT / 4)
      return {
        kind: 'move',
        dateKey: drag.dateKey,
        taskId: drag.taskId,
        top: newTop,
        height,
        label: `${newStart} – ${minutesToTime(endWallMin)}`,
      }
    } else {
      // eslint-disable-next-line react-hooks/refs -- preview must match pointer session gate
      if (!didMoveRef.current) return null
      const newTime = yToTime(drag.currentY)
      const newMin = timeToMinutes(newTime)
      let top: number, height: number, startLabel: string, endLabel: string
      if (drag.edge === 'top') {
        const endMin = timeToMinutes(drag.origEndTime)
        const clampedStart = Math.max(0, Math.min(newMin, endMin - MIN_BLOCK_MINUTES))
        top = (clampedStart / 60) * HOUR_HEIGHT
        height = ((endMin - clampedStart) / 60) * HOUR_HEIGHT
        startLabel = minutesToTime(clampedStart)
        endLabel = drag.origEndTime
      } else {
        const startMin = timeToMinutes(drag.origStartTime)
        const clampedEnd = Math.min(24 * 60, Math.max(newMin, startMin + MIN_BLOCK_MINUTES))
        top = timeToY(drag.origStartTime)
        height = ((clampedEnd - startMin) / 60) * HOUR_HEIGHT
        startLabel = drag.origStartTime
        endLabel = minutesToTime(clampedEnd)
      }
      return { kind: 'resize', dateKey: drag.dateKey, taskId: drag.taskId, top, height, label: `${startLabel} – ${endLabel}` }
    }
  }, [drag])

  const movingTaskId = drag?.kind === 'move' ? drag.taskId : (drag?.kind === 'resize' ? drag.taskId : null)
  const didMove = didMoveRef

  const activeCreateIntent: CreateIntent | null =
    drag?.kind === 'create' ? drag.intent : null

  const handlePointerCancel = useCallback(() => {
    setDrag(null)
    pointerStartRef.current = null
    didMoveRef.current = false
  }, [])

  return {
    drag,
    popup,
    dragPreview,
    movingTaskId,
    didMove,
    activeCreateIntent,
    handleCreatePointerDown,
    handleBlockPointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    dismissPopup,
  }
}

export function getResizeCursor(e: React.PointerEvent): string | null {
  if (isCoarsePointer()) return null
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const localY = e.clientY - rect.top
  if (localY <= RESIZE_EDGE_PX || localY >= rect.height - RESIZE_EDGE_PX) {
    return 'ns-resize'
  }
  return null
}
