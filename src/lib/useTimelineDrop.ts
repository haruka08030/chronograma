import { useState, useCallback, useRef } from 'react'
import { HOUR_HEIGHT, yToTime, timeToMinutes } from './timeGrid'
import { markTimelineDragOver } from './nativeTaskDragGhost'

export const TASK_DND_TYPE = 'application/x-task-id'
/** 複数選択ドラッグ時に運ぶ、表示順の taskId 配列（JSON） */
export const TASK_MULTI_DND_TYPE = 'application/x-task-ids'
const DEFAULT_DURATION_MIN = 60

/** ドラッグ中の DataTransfer から対象 taskId を取り出す（複数選択対応） */
export function readDraggedTaskIds(dataTransfer: DataTransfer): string[] {
  const multi = dataTransfer.getData(TASK_MULTI_DND_TYPE)
  if (multi) {
    try {
      const arr = JSON.parse(multi)
      if (Array.isArray(arr) && arr.length && arr.every((x) => typeof x === 'string')) return arr
    } catch {
      // fall through to single
    }
  }
  const single = dataTransfer.getData(TASK_DND_TYPE)
  if (single) return [single]
  const text = dataTransfer.getData('text/plain')
  if (text) return text.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

export interface DropPreview {
  dateKey: string
  top: number
  height: number
  label: string
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface UseTimelineDropOptions {
  getRelativeY: (clientY: number, dateKey: string) => number
  getTaskDuration?: (taskId: string) => number | null
  onDrop: (taskId: string, dateKey: string, startTime: string, endTime: string) => void
}

export function useTimelineDrop(options: UseTimelineDropOptions) {
  const { getRelativeY, getTaskDuration, onDrop } = options
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null)
  const enterCountRef = useRef(0)


  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(TASK_DND_TYPE)) return
    enterCountRef.current++
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, dateKey: string) => {
    if (!e.dataTransfer.types.includes(TASK_DND_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    markTimelineDragOver(e.nativeEvent)
    const y = getRelativeY(e.clientY, dateKey)
    const startTime = yToTime(y)
    const startMin = timeToMinutes(startTime)
    const duration = DEFAULT_DURATION_MIN
    const endMin = Math.min(startMin + duration, 24 * 60)
    const actualDuration = endMin - startMin
    const height = (actualDuration / 60) * HOUR_HEIGHT
    setDropPreview({ dateKey, top: y, height, label: `${startTime} – ${minutesToTime(endMin)}` })
  }, [getRelativeY])

  const handleDragLeave = useCallback(() => {
    enterCountRef.current--
    if (enterCountRef.current <= 0) {
      enterCountRef.current = 0
      setDropPreview(null)
    }
  }, [])

  const handleDropEvent = useCallback((e: React.DragEvent, dateKey: string) => {
    e.preventDefault()
    enterCountRef.current = 0
    const taskIds = readDraggedTaskIds(e.dataTransfer)
    if (!taskIds.length) { setDropPreview(null); return }
    const y = getRelativeY(e.clientY, dateKey)
    // 複数選択時はドロップ位置から順に重ならないよう積み上げて配置する
    let cursorMin = timeToMinutes(yToTime(y))
    for (const taskId of taskIds) {
      const raw = getTaskDuration?.(taskId) ?? DEFAULT_DURATION_MIN
      const duration = raw > 0 ? raw : DEFAULT_DURATION_MIN
      const startMin = Math.min(cursorMin, 24 * 60 - duration)
      const clampedStart = Math.max(0, startMin)
      const endMin = Math.min(clampedStart + duration, 24 * 60)
      onDrop(taskId, dateKey, minutesToTime(clampedStart), minutesToTime(endMin))
      cursorMin = endMin
    }
    setDropPreview(null)
  }, [getRelativeY, getTaskDuration, onDrop])

  return {
    dropPreview,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDropEvent,
  }
}
